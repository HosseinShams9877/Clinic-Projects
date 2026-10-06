/**
 * The campaign reads — the list the results table renders, the row the builder edits, and
 * the counts the same table names.
 *
 * `evaluateGroup` is the one place an audience becomes customers, and the preview below
 * goes through it for the same reason the dispatch does: the count a manager reads in the
 * builder is the count the campaign sends to, and a second path to the number would be a
 * second number.
 */

import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import { evaluateGroup, loadAudienceGroup } from '@/modules/audience-groups'

import type { CampaignResults, CampaignRow } from '../types'
import { loadOwnCampaign } from './manage'
import { countCampaignAppointments } from './attribution'

/** The campaigns the results table lists, newest first. */
export async function listCampaigns(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly CampaignRow[]> {
  const rows = await tx.campaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: CAMPAIGN_SELECT,
  })
  return rows.map(asRow)
}

/** One campaign with its live results, for the results table's own row. */
export async function campaignDetail(
  tx: TransactionClient,
  ctx: TenantContext,
  campaignId: string,
): Promise<{ readonly campaign: CampaignRow; readonly results: CampaignResults }> {
  const campaign = await loadOwnCampaign(tx, ctx, campaignId)
  const results = await campaignResults(tx, ctx.tenantId, campaignId)
  return { campaign, results }
}

/**
 * The campaign's results, counted from the ledger and the appointments table.
 *
 * Counted and not stored, because the two tables are the facts and the results are their
 * function — a stored tally is a number a concurrent send could move twice, and the count
 * a manager reads should be the count the ledger holds.
 */
export async function campaignResults(
  tx: TransactionClient,
  tenantId: string,
  campaignId: string,
): Promise<CampaignResults> {
  const [grouped, total, appointments] = await Promise.all([
    tx.messageSend.groupBy({
      by: ['status'],
      where: { tenantId, campaignId },
      _count: { _all: true },
    }),
    tx.messageSend.count({ where: { tenantId, campaignId } }),
    countCampaignAppointments(tx, tenantId, campaignId),
  ])

  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]))
  return Object.freeze({
    campaignId,
    total,
    sent: byStatus.get('SENT') ?? 0,
    queued: byStatus.get('QUEUED') ?? 0,
    suppressed: byStatus.get('SUPPRESSED') ?? 0,
    failed: byStatus.get('FAILED') ?? 0,
    resultingAppointments: appointments,
  })
}

/**
 * The live size of the audience a campaign would reach, as the builder's preview renders.
 *
 * Re-evaluated and not read from a stored count, because a stored count is a number from
 * a clock the campaign has not run on — a customer who became eligible between the last
 * refresh and the builder's open is a customer the preview should name.
 */
export async function previewCampaignAudience(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly audienceGroupId: string
  readonly now: Date
}): Promise<number> {
  const group = await loadAudienceGroup(args.tx, args.tenantId, args.audienceGroupId)
  if (!group.isActive) return 0

  const customerIds = await evaluateGroup({
    tx: args.tx,
    tenantId: args.tenantId,
    predicate: group.predicate,
    now: args.now,
  })
  return customerIds.length
}

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
