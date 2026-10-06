/**
 * The automatic dispatch — the job that turns the seven triggers into delivered
 * messages, and Phase 6's central mechanism.
 *
 * `06-constants.md` §4.10 states the send rules this function keeps:
 *
 * - **Priority order.** At most one automatic message per person per day, and when
 *   more than one is due, the order next-session appointment → financial → survey
 *   decides which one is sent. The list in the constants module *is* the order, and
 *   this function reads it rather than restating it, because a reordering that
 *   silently changed which message a customer receives would be invisible in review.
 * - **Consent.** No consent, no send — recorded as suppressed with a reason.
 * - **The 90-day window.** No repeat message to a person within the window, across
 *   every automatic kind, because «یک پیام در ۹۰ روز» is a promise to the person.
 * - **The send window.** A message due outside the clinic's hours is queued, and the
 *   queue is flushed when the hours open.
 *
 * ## Why the candidates are grouped by customer before any rule is applied
 *
 * The daily cap and the duplicate window are both facts about a *person*, and the
 * priority order only decides between two messages that are due for the *same*
 * person on the *same* run. Sorting the whole list and processing it in place would
 * apply the cap in the order the candidates happened to arrive in — which is the
 * evaluator order, not the priority order — and a customer due a next-session
 * reminder and a survey in the same tick would get whichever the evaluators
 * happened to list first. Grouping first makes the priority the tie-break it is,
 * and nothing else.
 *
 * ## Why a candidate that was already recorded is skipped and not suppressed
 *
 * A row for `(customer, kind)` exists when a previous run already decided this
 * message — sent, queued or suppressed. A second row would be a second decision about
 * one message, and the ledger's answer to "what did we do" would be two answers. This
 * is the dispatch's idempotency (DoD 9), and it lives *before* the rules rather than
 * inside them because a rule that re-ran would re-write a row the first run wrote.
 *
 * ## Why the row is written before the gateway is called
 *
 * A send that never returned — the provider timed out, the worker's lease expired —
 * still has a row, and the row is what the next run reads to know the message was
 * attempted. A send that wrote nothing on failure would send again on the next tick,
 * and a provider that charged per message would charge the clinic twice for one.
 */

import {
  AUTOMATIC_MESSAGE_PRIORITY,
  AutomaticMessageKind,
  type Channel,
} from '@/core/constants'
import {
  asLocalTime,
  fromUtcInstant,
  toUtcInstant,
} from '@/core/localization'
import { ValidationError } from '@/core/types'
import type { TransactionClient } from '@/core/db/scope'
import {
  collectAutomaticCandidates,
  hasChannelConsent,
  type AutomaticCandidate,
  type DispatchOutcome,
  type SuppressedReason,
} from '@/modules/notifications'

import {
  customerMessageHistory,
  lastDeliveredSend,
  markDelivered,
  recordSend,
  sendAlreadyRecorded,
  sendsToday,
} from './ledger'
import { currentGateway } from './gateway'
import { isWithinSendWindow } from './window'
import { readSendSettings } from './settings'
import { readTemplate, renderAutomaticTemplate } from './templates'

/** A day, as milliseconds, so the window reads as days and not as numbers. */
const DAY_MS = 24 * 60 * 60 * 1000

/** One dispatch reads a bounded set; a tenant's due messages are not thousands. */
const DISPATCH_BATCH = 500

/**
 * The day's automatic dispatch.
 *
 * @returns the decision made for every candidate a rule was applied to. A candidate
 *   a previous run already recorded is not among them, because it was decided.
 */
export async function runAutomaticDispatch(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly DispatchOutcome[]> {
  const settings = await readSendSettings(tx, tenantId)
  const candidates = await collectAutomaticCandidates(tx, tenantId, now)

  const outcomes: DispatchOutcome[] = []
  for (const group of groupByCustomer(candidates)) {
    for (const candidate of group) {
      const outcome = await dispatchOne({ tx, tenantId, candidate, settings, now })
      if (outcome !== null) outcomes.push(outcome)
    }
  }

  return outcomes
}

/**
 * Delivers the ledger's queued rows whose send window has opened.
 *
 * A queued row was written by a run that found it due outside the clinic's hours, so
 * the only reason to send it now is that the hours opened. The window is checked once
 * rather than per row, because a window that is open for one queued row is open for
 * every one, and ۵۰۰ gateway calls behind a check the loop already made is ۵۰۰ calls
 * that could have been zero.
 *
 * @returns the ids delivered.
 */
export async function flushSendQueue(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly string[]> {
  const settings = await readSendSettings(tx, tenantId)
  if (!isWithinSendWindow(now, settings)) return []

  const rows = await tx.messageSend.findMany({
    where: { tenantId, status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    take: DISPATCH_BATCH,
    select: { id: true, customerId: true, channel: true, renderedText: true },
  })

  const delivered: string[] = []
  for (const row of rows) {
    const customer = await tx.customer.findUnique({
      where: { id: row.customerId },
      select: { mobile: true },
    })
    if (customer === null) continue

    const result = await currentGateway().send({
      tenantId,
      customerId: row.customerId,
      mobile: customer.mobile,
      channel: row.channel as Channel,
      renderedText: row.renderedText,
    })
    await markDelivered(tx, row.id, result, now)
    delivered.push(row.id)
  }
  return delivered
}

/**
 * Applies the rules to one candidate and writes the ledger row the decision is.
 *
 * The rules are applied in the order the specification states them, and the order is
 * the argument: consent is asked first because a customer who never agreed is not the
 * clinic's to write to regardless of what else is due; then the daily cap, which
 * bounds the day and so is what decides between two messages due in one run; then the
 * duplicate window, which is the promise made to the person across runs; then the
 * send window, which holds what survived.
 */
async function dispatchOne(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly candidate: AutomaticCandidate
  readonly settings: Awaited<ReturnType<typeof readSendSettings>>
  readonly now: Date
}): Promise<DispatchOutcome | null> {
  const { tx, tenantId, candidate, settings, now } = args
  const { kind, customerId } = candidate

  // A previous run already decided this message; the ledger's row is the decision.
  if (await sendAlreadyRecorded(tx, tenantId, customerId, kind)) return null

  const channel = settings.channels[kind]
  const template = await readTemplate({ tx, tenantId, kind, channel })

  // The clinic turned this message off. An inactive template is a configuration
  // state rather than a per-customer decision, so there is no ledger row to write.
  if (!template.isActive) return null

  let renderedText: string
  try {
    renderedText = renderAutomaticTemplate(template, candidate.values)
  } catch (error) {
    // A placeholder the record did not fill. The allow-list makes this unreachable
    // from a settings screen; a caller that reaches it is a defect the ledger names.
    if (error instanceof ValidationError) {
      return await suppressed(tx, {
        tenantId,
        customerId,
        kind,
        channel,
        templateId: template.id,
        renderedText: template.text,
        reason: 'TEMPLATE_MISSING',
        now,
      })
    }
    throw error
  }

  // Consent is a hard filter: no consent, no send, and the attempt is recorded.
  const consented = await hasChannelConsent(tx, tenantId, customerId, channel)
  if (!consented) {
    return await suppressed(tx, {
      tenantId,
      customerId,
      kind,
      channel,
      templateId: template.id,
      renderedText,
      reason: 'NO_CONSENT',
      now,
    })
  }

  // The daily cap, over the clinic's own day. Checked before the window because the
  // row this run just wrote is inside the window too — a cap read after it would never
  // be the reason a second message is held, and the priority list would decide nothing.
  const startOfDay = toUtcInstant(
    fromUtcInstant(now, settings.utcOffsetMinutes).localDate,
    asLocalTime('00:00'),
    settings.utcOffsetMinutes,
  )
  const sentToday = await sendsToday(tx, tenantId, customerId, startOfDay, now)
  if (sentToday >= settings.dailyMessageCap) {
    return await suppressed(tx, {
      tenantId,
      customerId,
      kind,
      channel,
      templateId: template.id,
      renderedText,
      reason: 'DAILY_CAP',
      now,
    })
  }

  // The 90-day window, across every automatic kind.
  const last = await lastDeliveredSend(tx, tenantId, customerId)
  if (last !== null && last.sentAt.getTime() > now.getTime() - settings.duplicateWindowDays * DAY_MS) {
    return await suppressed(tx, {
      tenantId,
      customerId,
      kind,
      channel,
      templateId: template.id,
      renderedText,
      reason: 'DUPLICATE_WINDOW',
      now,
    })
  }

  // The send window holds the message rather than refusing it.
  if (!isWithinSendWindow(now, settings)) {
    const row = await recordSend({
      tx,
      tenantId,
      customerId,
      kind,
      channel,
      templateId: template.id,
      renderedText,
      status: 'QUEUED',
      suppressedReason: null,
      now,
    })
    return { result: 'QUEUED', sendId: row.id }
  }

  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { mobile: true },
  })
  if (customer === null) return null

  const row = await recordSend({
    tx,
    tenantId,
    customerId,
    kind,
    channel,
    templateId: template.id,
    renderedText,
    status: 'QUEUED',
    suppressedReason: null,
    now,
  })
  const result = await currentGateway().send({
    tenantId,
    customerId,
    mobile: customer.mobile,
    channel,
    renderedText,
  })
  await markDelivered(tx, row.id, result, now)

  return {
    result: result.status === 'SENT' ? 'SENT' : 'FAILED',
    sendId: row.id,
  }
}

/** Writes the suppression the ledger records, with the reason the rules refused it. */
async function suppressed(
  tx: TransactionClient,
  args: {
    readonly tenantId: string
    readonly customerId: string
    readonly kind: AutomaticMessageKind
    readonly channel: Channel
    readonly templateId: string | null
    readonly renderedText: string
    readonly reason: SuppressedReason
    readonly now: Date
  },
): Promise<DispatchOutcome> {
  const row = await recordSend({
    tx,
    tenantId: args.tenantId,
    customerId: args.customerId,
    kind: args.kind,
    channel: args.channel,
    templateId: args.templateId,
    renderedText: args.renderedText,
    status: 'SUPPRESSED',
    suppressedReason: args.reason,
    now: args.now,
  })
  return { result: 'SUPPRESSED', sendId: row.id, reason: args.reason }
}

/**
 * The candidates grouped by customer, each group in the priority order.
 *
 * The priority is the constants module's list, and a candidate whose kind is not on
 * it is a kind the product does not send — sorted last rather than dropped, so a
 * future kind that lands in the constants without the priority list still dispatches
 * rather than vanishing, and the list's own test has the one place to notice.
 */
function groupByCustomer(
  candidates: readonly AutomaticCandidate[],
): readonly AutomaticCandidate[][] {
  const rank = new Map<AutomaticMessageKind, number>(
    AUTOMATIC_MESSAGE_PRIORITY.map((kind, index) => [kind, index]),
  )
  const priorityOf = (kind: AutomaticMessageKind): number =>
    rank.get(kind) ?? AUTOMATIC_MESSAGE_PRIORITY.length

  const groups = new Map<string, AutomaticCandidate[]>()
  for (const candidate of candidates) {
    const group = groups.get(candidate.customerId)
    if (group === undefined) {
      groups.set(candidate.customerId, [candidate])
    } else {
      group.push(candidate)
    }
  }

  return [...groups.values()].map((group) =>
    group.slice().sort((left, right) => priorityOf(left.kind) - priorityOf(right.kind)),
  )
}

/** Re-exported so the barrel names the history read from the module that owns it. */
export { customerMessageHistory }
