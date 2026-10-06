/**
 * The dispatch — the orchestration that turns an approved, scheduled campaign into
 * delivered messages, and the one place a campaign's audience becomes a set of sends.
 *
 * `06-constants.md` §4.10's send rules are the automatic dispatch's; a campaign's
 * sends keep the same four the specification states for any message the clinic sends,
 * because a campaign is not exempt from the promises the automatic messages keep:
 *
 * - **Consent.** No consent, no send — recorded as suppressed with a reason, so the
 *   attempt is on the customer's record (DoD 5).
 * - **The 90-day window.** No repeat message to a person within the window, across
 *   automatic *and* campaign sends. The window's read counts no kind, which is how a
 *   campaign that lands the day after an automatic reminder is held and not sent.
 * - **The daily cap.** The clinic's own cap, and then the campaign's own `dailyCap`
 *   on top, because a campaign that reached its whole audience in one run is a
 *   campaign that filled the day for every other message.
 * - **The send window.** A message due outside the clinic's hours is queued, and the
 *   automatic dispatch's own tick flushes it when the hours open.
 *
 * ## Why the scan is `status = ACTIVE` and the gate is re-asserted anyway
 *
 * The scan uses `campaign_tenant_status_idx` and reads only campaigns the state machine
 * put in the sending state — which is the campaigns that passed the approval gate. The
 * re-assertion of `approvedByUserId` and `approvedAt` is not about the scan; it is
 * about the row. A status is a column, and a writer that set it without `manage.ts`
 * would reach this function, and the two columns are the facts the invariant is
 * written in. The scan is the filter; the assert is the rule.
 *
 * ## Idempotency, and why the schedule is the lock
 *
 * A recurring campaign must not re-send within its own period (DoD 10), and the
 * mechanism is the schedule: a campaign that dispatched advances `scheduledAt` to the
 * next period *in the same transaction* as its sends, so the row the next tick scans
 * is a row whose `scheduledAt` is already ahead of the clock. Two ticks in one period
 * cannot both claim it, and a tick that rolls back has not advanced it — the sends and
 * the advance are one commit. On top of that, the ledger's `(customer, campaign)` key
 * makes the per-recipient check a fact: a run that re-evaluated a customer it already
 * sent to reads the row that says it did.
 *
 * ## Why the audience is re-evaluated at dispatch and not read from a list
 *
 * `03-data-model.md` Decision 3: the group is a query. The audience that the preview
 * counted and the audience the dispatch sends to are the same evaluation against the
 * same clock, run through the same `evaluateGroup` — which is what makes the count the
 * manager approved the count the campaign sent to, and what makes a recurring birthday
 * campaign correct a year later, when nobody on the original list has the same birth
 * month.
 */

import { CampaignScheduleKind, CampaignStatus } from '@/core/constants'
import { formatMoney, renderMessage } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'
import {
  campaignSendRecordedFor,
  recordCampaignSuppression,
  sendCampaignMessage,
} from '@/modules/messages'
import { hasChannelConsent } from '@/modules/notifications'
import { evaluateGroup, loadAudienceGroup } from '@/modules/audience-groups'
import { customerBalance } from '@/modules/payments'
import {
  lastDeliveredSend,
  readSendSettings,
  sendsToday,
  type SendSettings,
} from '@/modules/messages'

import type { CampaignRow, DispatchOutcome, DispatchSkipReason } from '../types'
import { advanceSchedule, assertApprovalFacts, loadOwnCampaign } from './manage'
import { countCampaignAppointments } from './attribution'

/** A day, as milliseconds, so the duplicate window reads as days and not as numbers. */
const DAY_MS = 24 * 60 * 60 * 1000

/** The dispatch scans a bounded set; a tenant's due campaigns are not thousands. */
const DISPATCH_BATCH = 50

/** One campaign's per-run counts, as the outcome the job reports. */
interface RunCounts {
  readonly sent: number
  readonly queued: number
  readonly suppressed: number
}

/**
 * The dispatch — sends every campaign the clock has reached, and advances each one.
 *
 * @returns the outcome per campaign that was due, for the job's log and the page.
 */
export async function dispatchDueCampaigns(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<readonly DispatchOutcome[]> {
  const rows = await args.tx.campaign.findMany({
    where: {
      tenantId: args.tenantId,
      status: CampaignStatus.Active,
      scheduledAt: { lte: args.now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: DISPATCH_BATCH,
    select: { id: true },
  })

  const settings = await readSendSettings(args.tx, args.tenantId)

  const outcomes: DispatchOutcome[] = []
  for (const row of rows) {
    const campaign = await args.tx.campaign.findUnique({
      where: { id: row.id },
      select: CAMPAIGN_SELECT,
    })
    if (campaign === null) continue

    const outcome = await dispatchOne({
      tx: args.tx,
      tenantId: args.tenantId,
      campaign: asRow(campaign),
      settings,
      now: args.now,
    })
    outcomes.push(outcome)
  }

  return outcomes
}

/**
 * Sends one campaign, applies the rules to its audience, and advances its schedule.
 *
 * The skip reasons are the five ways a due campaign sends to nobody, and each is a
 * state the row is in rather than a transient failure: the campaign is not active, it
 * holds no approval, its group was retired, its audience is empty, or it already sent
 * this period. A campaign that sent to nobody because every customer lacked consent is
 * *not* a skip — it is a run with suppressions, and the ledger holds the reasons.
 */
async function dispatchOne(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly campaign: CampaignRow
  readonly settings: SendSettings
  readonly now: Date
}): Promise<DispatchOutcome> {
  const { tx, tenantId, campaign, now } = args

  if (campaign.status !== CampaignStatus.Active) {
    return skipped(campaign, 'NOT_ACTIVE')
  }
  try {
    assertApprovalFacts(campaign, campaign.id)
  } catch {
    return skipped(campaign, 'NOT_APPROVED')
  }

  const group = await loadAudienceGroup(tx, tenantId, campaign.audienceGroupId)
  if (!group.isActive) return skipped(campaign, 'GROUP_INACTIVE')

  const customerIds = await evaluateGroup({
    tx,
    tenantId,
    predicate: group.predicate,
    now,
  })
  if (customerIds.length === 0) return skipped(campaign, 'AUDIENCE_EMPTY')

  const counts = await sendToAudience({
    tx,
    tenantId,
    campaign,
    customerIds,
    settings: args.settings,
    now,
  })

  // The campaign's own counts, from the ledger the sends wrote.
  const sends = await tx.messageSend.count({
    where: { tenantId, campaignId: campaign.id },
  })
  await tx.campaign.update({
    where: { id: campaign.id },
    data: { sentCount: sends },
  })

  // The schedule is the idempotency lock: advance inside the sends' transaction, so the
  // row the next tick scans is already ahead of the clock.
  if (campaign.scheduleKind === CampaignScheduleKind.OneTime) {
    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        status: CampaignStatus.Finished,
        audienceLockedAt: now,
      },
    })
  } else {
    const nextAt = advanceSchedule({
      campaign,
      utcOffsetMinutes: args.settings.utcOffsetMinutes,
      now,
    })
    await tx.campaign.update({
      where: { id: campaign.id },
      data: { scheduledAt: nextAt },
    })
  }

  // The attribution count, recomputed from the appointments the campaign's recipients booked.
  const appointments = await countCampaignAppointments(tx, tenantId, campaign.id)
  await tx.campaign.update({
    where: { id: campaign.id },
    data: { resultingAppointmentCount: appointments },
  })

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    evaluated: customerIds.length,
    ...counts,
    skipped: null,
  }
}

/**
 * Sends one campaign's message to its audience, applying the four rules per customer.
 *
 * The order is the order the automatic dispatch keeps, for the same reasons: consent
 * first, because a customer who never agreed is not the clinic's to write to regardless
 * of what else is due; then the campaign's own ledger key, which is the idempotency the
 * run owes the clinic; then the daily cap; then the 90-day window, which is the promise
 * made to the person across every message the clinic sends.
 */
async function sendToAudience(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly campaign: CampaignRow
  readonly customerIds: readonly string[]
  readonly settings: SendSettings
  readonly now: Date
}): Promise<RunCounts> {
  const { tx, tenantId, campaign, customerIds, now } = args
  const windowStart = new Date(now.getTime() - args.settings.duplicateWindowDays * DAY_MS)
  const names = await loadCustomerNames(tx, tenantId, customerIds)
  const needsAmount = campaign.messageText.includes('{amount}')

  const render = (customerId: string): Promise<string> =>
    renderCampaignText({ tx, tenantId, campaign, customerId, names, needsAmount })

  let sent = 0
  let queued = 0
  let suppressed = 0

  for (const customerId of customerIds) {
    // The campaign's daily cap bounds the run itself.
    if (campaign.dailyCap !== null && sent + queued >= campaign.dailyCap) break

    // Already recorded for this campaign — the ledger's own idempotency.
    if (await campaignSendRecordedFor({ tx, tenantId, customerId, campaignId: campaign.id })) {
      continue
    }

    // Consent is a hard filter: no consent, no send, and the attempt is recorded.
    const consented = await hasChannelConsent(tx, tenantId, customerId, campaign.channel)
    if (!consented) {
      await recordCampaignSuppression({
        tx,
        tenantId,
        customerId,
        campaignId: campaign.id,
        channel: campaign.channel,
        renderedText: await render(customerId),
        reason: 'NO_CONSENT',
        now,
      })
      suppressed += 1
      continue
    }

    // The clinic's daily cap, over the clinic's own day.
    const sentToday = await sendsToday(tx, tenantId, customerId, new Date(now.getTime() - DAY_MS), now)
    if (sentToday >= args.settings.dailyMessageCap) {
      await recordCampaignSuppression({
        tx,
        tenantId,
        customerId,
        campaignId: campaign.id,
        channel: campaign.channel,
        renderedText: await render(customerId),
        reason: 'DAILY_CAP',
        now,
      })
      suppressed += 1
      continue
    }

    // The 90-day window, across every message the clinic sent the person.
    const last = await lastDeliveredSend(tx, tenantId, customerId)
    if (last !== null && last.sentAt.getTime() > windowStart.getTime()) {
      await recordCampaignSuppression({
        tx,
        tenantId,
        customerId,
        campaignId: campaign.id,
        channel: campaign.channel,
        renderedText: await render(customerId),
        reason: 'DUPLICATE_WINDOW',
        now,
      })
      suppressed += 1
      continue
    }

    const row = await sendCampaignMessage({
      tx,
      tenantId,
      customerId,
      campaignId: campaign.id,
      channel: campaign.channel,
      renderedText: await render(customerId),
      now,
    })
    if (row.status === 'QUEUED') queued += 1
    else if (row.status === 'SUPPRESSED') suppressed += 1
    else sent += 1
  }

  return { sent, queued, suppressed }
}

/**
 * The campaign's text, rendered for one customer.
 *
 * The `{name}` placeholder is the one every campaign text carries, and `{amount}` is the
 * one a debt reminder carries — filled from the customer's own balance, because a
 * reminder that names no number is a reminder the customer cannot act on. The renderer's
 * digit conversion is what keeps a Latin digit out of a sentence a customer reads, and
 * its throw on an unknown placeholder is what makes a campaign whose text was never
 * previewed a campaign the settings path catches and not a customer.
 */
async function renderCampaignText(
  args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly campaign: CampaignRow
    readonly customerId: string
    readonly names: ReadonlyMap<string, string>
    readonly needsAmount: boolean
  },
): Promise<string> {
  const name = args.names.get(args.customerId) ?? ''
  if (!args.needsAmount) {
    return renderMessage(args.campaign.messageText, { name })
  }

  const balance = await customerBalance(args.tx, args.tenantId, args.customerId)
  return renderMessage(args.campaign.messageText, { name, amount: formatMoney(balance.balance) })
}

/**
 * The audience's names, read once for the whole run.
 *
 * The dispatch renders at send time and not at schedule time, because the name a person
 * is known by is the name the customer record holds *now* — a customer who corrected
 * their name between the schedule and the send receives the corrected one. One read for
 * the audience is the cost of not holding a stale name per customer.
 */
async function loadCustomerNames(
  tx: TransactionClient,
  tenantId: string,
  customerIds: readonly string[],
): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map()

  const rows = await tx.customer.findMany({
    where: { tenantId, id: { in: customerIds as never[] } },
    select: { id: true, firstName: true, lastName: true },
  })
  return new Map(
    rows.map((row) => {
      const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
      return [row.id, full] as const
    }),
  )
}

/** A campaign that sent to nobody, with the state that explains it. */
function skipped(campaign: CampaignRow, reason: DispatchSkipReason): DispatchOutcome {
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    evaluated: 0,
    sent: 0,
    queued: 0,
    suppressed: 0,
    skipped: reason,
  }
}

/** The columns the dispatch reads, and nothing more. */
const CAMPAIGN_SELECT = {
  id: true,
  tenantId: true,
  audienceGroupId: true,
  messageTemplateId: true,
  createdByUserId: true,
  approvedByUserId: true,
  approvedAt: true,
  name: true,
  type: true,
  channel: true,
  messageText: true,
  audienceLockedAt: true,
  isRecurring: true,
  scheduleKind: true,
  scheduledAt: true,
  scheduledTime: true,
  dailyCap: true,
  status: true,
  sentCount: true,
  resultingAppointmentCount: true,
  createdAt: true,
} as const

/** The row as the module's own shape — the same `asRow` `manage.ts` keeps. */
function asRow(row: {
  readonly id: string
  readonly tenantId: string
  readonly audienceGroupId: string
  readonly messageTemplateId: string | null
  readonly createdByUserId: string
  readonly approvedByUserId: string | null
  readonly approvedAt: Date | null
  readonly name: string
  readonly type: string
  readonly channel: string
  readonly messageText: string
  readonly audienceLockedAt: Date | null
  readonly isRecurring: boolean
  readonly scheduleKind: string
  readonly scheduledAt: Date | null
  readonly scheduledTime: string | null
  readonly dailyCap: number | null
  readonly status: string
  readonly sentCount: number
  readonly resultingAppointmentCount: number
  readonly createdAt: Date
}): CampaignRow {
  return Object.freeze({
    id: row.id,
    tenantId: row.tenantId,
    audienceGroupId: row.audienceGroupId,
    messageTemplateId: row.messageTemplateId,
    createdByUserId: row.createdByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    name: row.name,
    type: row.type as never,
    channel: row.channel as never,
    messageText: row.messageText,
    audienceLockedAt: row.audienceLockedAt,
    isRecurring: row.isRecurring,
    scheduleKind: row.scheduleKind as never,
    scheduledAt: row.scheduledAt,
    scheduledTime: row.scheduledTime,
    dailyCap: row.dailyCap,
    status: row.status as never,
    sentCount: row.sentCount,
    resultingAppointmentCount: row.resultingAppointmentCount,
    createdAt: row.createdAt,
  })
}

/** Re-exported so the page names the same load the dispatch uses. */
export { loadOwnCampaign }
