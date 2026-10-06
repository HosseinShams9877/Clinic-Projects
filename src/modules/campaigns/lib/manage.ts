/**
 * The campaign writes — CRUD, and the status machine whose one edge is the approval
 * gate.
 *
 * `03-data-model.md` §2.6's invariant is the rule this file keeps: `status` cannot
 * reach `ACTIVE` without `approvedByUserId` and `approvedAt`. Immutable rule 4 — "no
 * bulk sending without human approval" — is enforced here on the server and not in the
 * UI, and it is enforced three times rather than once, because the three are three
 * different ways a campaign could reach a send:
 *
 * 1. **`approveCampaign` is the only writer of the two columns.** Nothing else sets
 *    `approvedByUserId` or `approvedAt`, so a campaign that never passed through it
 *    holds `null` in both, whatever its status says.
 * 2. **`activateCampaign` refuses without them.** The transition into `ACTIVE` re-reads
 *    the row and raises when either is `null`, which is the check a row that reached
 *    `ACTIVE` by any other path still cannot pass.
 * 3. **The dispatch re-asserts the pair before a single send** (`dispatch.ts`), because
 *    the scan is `status = ACTIVE` and a row's status is a column a future writer could
 *    set without this file. The two columns are the facts; the status is the label.
 *
 * ## Why approval is not the creator's own
 *
 * A gate the author opens for themselves is a gate the product does not have. The
 * approval refuses when the approver is the creator, and the refusal is a `DomainError`
 * on the server rather than a hidden button — a button hidden in the UI is a convention
 * a second pair of eyes can grant itself by any other path, and the rule is that it
 * cannot.
 *
 * ## Why the schedule is required at creation
 *
 * A campaign with no `scheduledAt` is a campaign the dispatch scan cannot order, and
 * the scan is the thing that makes the schedule real. `ONE_TIME` needs its moment,
 * `DAILY_AT` needs the time of day it recurs at, and `MONTHLY_DAY` needs the day it
 * lands on — the three are the three `scheduleKind` values the schema holds, and a
 * campaign that names none of them is a draft the builder has not finished.
 */

import {
  CampaignScheduleKind,
  CampaignStatus,
  CampaignType,
  Channel,
  isMember,
} from '@/core/constants'
import {
  addLocalDays,
  addLocalMonths,
  asLocalTime,
  fromUtcInstant,
  toUtcInstant,
} from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError, NotFoundError, ValidationError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { CampaignInput, CampaignRow } from '../types'
import { STATUS_TRANSITIONS } from '../catalog'
import { loadAudienceGroup } from '@/modules/audience-groups'

/** The columns the reads carry, and nothing more. */
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

/**
 * Creates a campaign as a draft.
 *
 * The campaign starts at `DRAFT` and not at `ACTIVE`, for the reason the file header
 * gives: a created campaign is a proposal, and a proposal no one has approved sends
 * nothing. The audience group's `isActive` is checked here so a builder that points a
 * campaign at a retired group learns it at the builder and not at the dispatch.
 *
 * @throws PermissionError — no `manage_campaigns`.
 * @throws ValidationError — no name, no text, no group, or no schedule.
 * @throws DomainError — the type or the schedule kind is not one the closed sets hold.
 */
export async function createCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly input: CampaignInput
  readonly now: Date
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')

  validateCampaignInput(args.input)

  const group = await loadAudienceGroup(args.tx, args.ctx.tenantId, args.input.audienceGroupId)
  if (!group.isActive) {
    throw new DomainError(`Audience group ${args.input.audienceGroupId} is inactive.`, {
      messageKey: 'campaigns.groupNotActive',
      detail: { audienceGroupId: args.input.audienceGroupId },
    })
  }

  const row = await args.tx.campaign.create({
    data: {
      tenantId: args.ctx.tenantId,
      audienceGroupId: args.input.audienceGroupId,
      createdByUserId: args.ctx.userId,
      name: args.input.name.trim(),
      type: args.input.type,
      channel: args.input.channel,
      messageText: args.input.messageText,
      isRecurring: args.input.isRecurring,
      scheduleKind: args.input.scheduleKind,
      scheduledAt: args.input.scheduledAt,
      scheduledTime: args.input.scheduledTime,
      dailyCap: args.input.dailyCap,
      status: CampaignStatus.Draft,
    },
    select: CAMPAIGN_SELECT,
  })
  return asRow(row)
}

/**
 * Edits a campaign's text, audience and schedule.
 *
 * Editable only while the campaign has not been approved: an approved campaign is a
 * decision the clinic made about what to say to whom, and editing it after approval is
 * changing the decision without the second approval. The edit sends the campaign back
 * to `DRAFT`, which is the honest state for a row whose content changed under the
 * approval it held.
 *
 * @throws PermissionError — no `manage_campaigns`.
 * @throws NotFoundError — the campaign is another tenant's.
 * @throws DomainError — the campaign has been approved and is no longer editable.
 */
export async function updateCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
  readonly input: CampaignInput
  readonly now: Date
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')
  validateCampaignInput(args.input)

  const current = await loadOwnCampaign(args.tx, args.ctx, args.campaignId)
  if (current.status !== CampaignStatus.Draft) {
    throw new DomainError(
      `Campaign ${args.campaignId} is ${current.status} and no longer editable.`,
      {
        messageKey: 'campaigns.alreadyClosed',
        detail: { campaignId: args.campaignId, status: current.status },
      },
    )
  }

  const row = await args.tx.campaign.update({
    where: { id: args.campaignId },
    data: {
      audienceGroupId: args.input.audienceGroupId,
      name: args.input.name.trim(),
      type: args.input.type,
      channel: args.input.channel,
      messageText: args.input.messageText,
      isRecurring: args.input.isRecurring,
      scheduleKind: args.input.scheduleKind,
      scheduledAt: args.input.scheduledAt,
      scheduledTime: args.input.scheduledTime,
      dailyCap: args.input.dailyCap,
    },
    select: CAMPAIGN_SELECT,
  })
  return asRow(row)
}

/**
 * «ارسال برای تأیید» — moves a draft to the state an approver acts on.
 *
 * @throws PermissionError — no `manage_campaigns`.
 * @throws DomainError — the campaign is not a draft.
 */
export async function submitCampaignForApproval(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')
  return transitionCampaign(args, CampaignStatus.AwaitingApproval)
}

/**
 * «تأیید کمپین» — the gate's first half, and the only writer of the two columns.
 *
 * The approver may not be the creator, for the reason the file header gives. The
 * campaign moves to `APPROVED`, which is the state that makes activation possible and
 * is *not* the state that sends: an approved campaign still sends nothing until a
 * person activates it, and the two-step shape is what keeps "the manager approved the
 * text" and "the manager started the campaign" as two decisions the audit can tell
 * apart.
 *
 * @throws PermissionError — no `manage_campaigns`.
 * @throws DomainError — the campaign is not awaiting approval, or the approver created it.
 */
export async function approveCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
  readonly now: Date
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')

  const current = await loadOwnCampaign(args.tx, args.ctx, args.campaignId)
  if (current.status !== CampaignStatus.AwaitingApproval) {
    throw new DomainError(
      `Campaign ${args.campaignId} is ${current.status}, not awaiting approval.`,
      {
      messageKey: 'campaigns.notAwaitingApproval',
      detail: { campaignId: args.campaignId, status: current.status },
    })
  }
  if (args.ctx.userId === current.createdByUserId) {
    throw new DomainError(
      `User ${args.ctx.userId} cannot approve a campaign they created.`,
      {
        messageKey: 'campaigns.cannotApproveOwn',
        detail: { campaignId: args.campaignId, userId: args.ctx.userId },
      },
    )
  }

  const row = await args.tx.campaign.update({
    where: { id: args.campaignId },
    data: {
      status: CampaignStatus.Approved,
      approvedByUserId: args.ctx.userId,
      approvedAt: args.now,
    },
    select: CAMPAIGN_SELECT,
  })
  return asRow(row)
}

/**
 * «فعال کردن» — the gate's second half, and the edge immutable rule 4 is about.
 *
 * Refuses when the campaign is not `APPROVED`, and refuses again — after the transition
 * is known to be legal — when either of the two columns is missing. The second check is
 * not paranoia about the first: it is the check a row that reached `ACTIVE` by any
 * other path still cannot pass, and it is the assertion the schema-level invariant is
 * written in.
 *
 * @throws PermissionError — no `manage_campaigns`.
 * @throws DomainError — the campaign is not approved, or holds no approval facts.
 */
export async function activateCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')

  const current = await loadOwnCampaign(args.tx, args.ctx, args.campaignId)
  assertApprovalFacts(current, args.campaignId)
  return transitionCampaign(args, CampaignStatus.Active)
}

/** «توقف موقت» — holds an active campaign's schedule without closing it. */
export async function pauseCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')
  return transitionCampaign(args, CampaignStatus.Paused)
}

/**
 * «از سرگیری» — resumes a paused campaign.
 *
 * Re-asserts the approval facts, for the same reason `activateCampaign` does: a paused
 * campaign is one that was sending, and resuming is the same edge the gate is about.
 */
export async function resumeCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')

  const current = await loadOwnCampaign(args.tx, args.ctx, args.campaignId)
  assertApprovalFacts(current, args.campaignId)
  return transitionCampaign(args, CampaignStatus.Active)
}

/** «پایان» — closes a campaign. Terminal; the row stays for the results table. */
export async function finishCampaign(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly campaignId: string
}): Promise<CampaignRow> {
  requirePermission(args.ctx, 'manage_campaigns')
  return transitionCampaign(args, CampaignStatus.Finished)
}

/**
 * The one transition writer, so the legal edges are read from the catalog's table and
 * not restated per action.
 *
 * @throws DomainError — the edge is not one the machine allows.
 */
async function transitionCampaign(
  args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly campaignId: string
  },
  to: CampaignStatus,
): Promise<CampaignRow> {
  const current = await loadOwnCampaign(args.tx, args.ctx, args.campaignId)
  const allowed = STATUS_TRANSITIONS[current.status]
  if (!allowed.includes(to)) {
    throw new DomainError(
      `Campaign ${args.campaignId} cannot move from ${current.status} to ${to}.`,
      {
        messageKey: 'campaigns.notActive',
        detail: { campaignId: args.campaignId, from: current.status, to },
      },
    )
  }

  const row = await args.tx.campaign.update({
    where: { id: args.campaignId },
    data: { status: to },
    select: CAMPAIGN_SELECT,
  })
  return asRow(row)
}

/**
 * Asserts the schema-level invariant: an `ACTIVE` campaign holds an approver and a
 * timestamp. This is the server-side gate, and it is asked of every edge into the
 * sending state.
 *
 * @throws DomainError — the campaign holds no approval facts.
 */
export function assertApprovalFacts(campaign: CampaignRow, campaignId: string): void {
  if (campaign.approvedByUserId === null || campaign.approvedAt === null) {
    throw new DomainError(
      `Campaign ${campaignId} has no approval and cannot become active.`,
      {
        messageKey: 'campaigns.notApproved',
        detail: { campaignId, status: campaign.status },
      },
    )
  }
}

/**
 * The campaign's next run, advanced by the dispatch after a period's sends.
 *
 * `ONE_TIME` has no next run, and the dispatch closes the campaign instead. `DAILY_AT`
 * moves to the same local time tomorrow, and `MONTHLY_DAY` to the same day next month —
 * both through the Jalali calendar and the tenant's own offset, so a campaign scheduled
 * for «۱۰:۰۰» sends at «۱۰:۰۰» on the clinic's clock and not the server's.
 */
export function advanceSchedule(args: {
  readonly campaign: CampaignRow
  readonly utcOffsetMinutes: number
  readonly now: Date
}): Date | null {
  if (args.campaign.scheduleKind === CampaignScheduleKind.OneTime) return null
  if (args.campaign.scheduledAt === null) return null

  const instant = args.campaign.scheduledAt
  const local = fromUtcInstant(instant, args.utcOffsetMinutes)
  const time = args.campaign.scheduledTime ?? local.localTime

  const nextLocalDate =
    args.campaign.scheduleKind === CampaignScheduleKind.DailyAt
      ? addLocalDays(local.localDate, 1)
      : addLocalMonths(local.localDate, 1)

  return toUtcInstant(nextLocalDate, asLocalTime(time), args.utcOffsetMinutes)
}

/**
 * Validates the builder's input — the three a campaign cannot exist without, and the
 * two closed sets a forwarded form string could misspell.
 *
 * @throws ValidationError — no name, no text, no group, or no schedule.
 * @throws DomainError — the type or the schedule kind is not one the closed sets hold.
 */
export function validateCampaignInput(input: CampaignInput): void {
  if (input.name.trim().length === 0) {
    throw new ValidationError('A campaign needs a name.', {
      messageKey: 'campaigns.nameRequired',
    })
  }
  if (input.messageText.trim().length === 0) {
    throw new ValidationError('A campaign needs message text.', {
      messageKey: 'campaigns.textRequired',
    })
  }
  if (input.audienceGroupId.trim().length === 0) {
    throw new ValidationError('A campaign needs an audience group.', {
      messageKey: 'campaigns.groupRequired',
    })
  }
  if (input.scheduledAt === null) {
    throw new ValidationError('A campaign needs a schedule.', {
      messageKey: 'campaigns.scheduleRequired',
    })
  }
  if (!isMember(CampaignType, input.type)) {
    throw new DomainError(`Unknown campaign type ${input.type}.`, {
      messageKey: 'campaigns.typeUnknown',
      detail: { type: input.type },
    })
  }
  if (!isMember(CampaignScheduleKind, input.scheduleKind)) {
    throw new DomainError(`Unknown schedule kind ${input.scheduleKind}.`, {
      messageKey: 'campaigns.typeUnknown',
      detail: { scheduleKind: input.scheduleKind },
    })
  }
  if (!isMember(Channel, input.channel)) {
    throw new DomainError(`Unknown channel ${input.channel}.`, {
      messageKey: 'campaigns.typeUnknown',
      detail: { channel: input.channel },
    })
  }
}

/**
 * One campaign as the caller's tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant, for the
 *   404-not-403 rule the module's own catalog sentence serves.
 */
export async function loadOwnCampaign(
  tx: TransactionClient,
  ctx: TenantContext,
  campaignId: string,
): Promise<CampaignRow> {
  const row = await tx.campaign.findFirst({
    where: { id: campaignId, tenantId: ctx.tenantId },
    select: CAMPAIGN_SELECT,
  })
  if (row === null) {
    throw new NotFoundError(`Campaign ${campaignId} was not found in this tenant.`, {
      messageKey: 'campaigns.notFound',
      detail: { campaignId },
    })
  }
  return asRow(row)
}

/** The row as the module's own shape. */
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
    type: row.type as CampaignType,
    channel: row.channel as Channel,
    messageText: row.messageText,
    audienceLockedAt: row.audienceLockedAt,
    isRecurring: row.isRecurring,
    scheduleKind: row.scheduleKind as CampaignScheduleKind,
    scheduledAt: row.scheduledAt,
    scheduledTime: row.scheduledTime,
    dailyCap: row.dailyCap,
    status: row.status as CampaignStatus,
    sentCount: row.sentCount,
    resultingAppointmentCount: row.resultingAppointmentCount,
    createdAt: row.createdAt,
  })
}

/** Re-exported so the page composes the offset the schedule arithmetic reads. */
export { fromUtcInstant }
