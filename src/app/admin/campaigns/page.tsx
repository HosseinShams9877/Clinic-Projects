/**
 * The manager's campaigns surface — `02-architecture.md` §9's `admin/campaigns.html`.
 *
 * The page is the builder, the assistant and the results table, and it is a read and a
 * render: the three writes the builder needs are server actions, so the page itself holds
 * no form state and no client boundary beyond the two components. The eight built-in
 * audience groups are seeded here rather than in a migration because a group is a query
 * the tenant owns, and a tenant seeded by a migration is a tenant whose eight a later
 * release cannot add a ninth to.
 *
 * The manager default holds `manage_campaigns` (`04-roles-permissions.md` §2.1), and the
 * page's permission is the panel's: `requireStaffPanel('admin')` resolves the membership
 * before the reads run, and the actions re-resolve it, so a write is never scoped by a
 * context a page assembled.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'

import { CAMPAIGNS_PAGE } from '@/app/catalog'
import { CampaignBuilder, type OptionList } from '@/app/_campaigns/campaign-builder'
import { CampaignsTable, type CampaignRowView } from '@/app/_campaigns/campaigns-table'
import { ensureBuiltInGroups, listAudienceGroups } from '@/modules/audience-groups'
import {
  CAMPAIGN_SCHEDULE_LABELS,
  CAMPAIGN_STATUS_HINTS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  CHANNEL_LABELS,
  campaignResults,
  listCampaigns,
} from '@/modules/campaigns'
import { ASSISTANT_LOW_CONFIDENCE_HINT } from '@/modules/campaign-assistant'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CAMPAIGNS_PAGE.title }

/** The two dropdown lists, built here because the module's barrel is server-only. */
const TYPE_OPTIONS: readonly OptionList[] = Object.entries(CAMPAIGN_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
)
const CHANNEL_OPTIONS: readonly OptionList[] = Object.entries(CHANNEL_LABELS).map(
  ([value, label]) => ({ value, label }),
)

/**
 * «کمپین‌ها» — the builder, the assistant, and the results.
 */
export default async function AdminCampaignsPage() {
  const session = await requireStaffPanel('admin')
  const ctx = session.permissions

  const { campaigns, groups } = await runInTenantScope(ctx, prisma(), async (tx) => {
    const groups = await ensureBuiltInGroups({ tx, tenantId: ctx.tenantId })
    const campaigns = await listCampaigns(tx, ctx.tenantId)
    return { campaigns, groups }
  })

  const byId = new Map(groups.map((group) => [group.id, group]))

  // The results are counted beside the rows rather than per-row, because the counts are
  // the ledger's and the appointments' and one read each is the cost of a table that does
  // not move under a concurrent send.
  const rows: readonly CampaignRowView[] = await Promise.all(
    campaigns.map(async (campaign) => {
      const results = await campaignResults(prisma() as never, ctx.tenantId, campaign.id)
      const group = byId.get(campaign.audienceGroupId)
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        typeLabel: CAMPAIGN_TYPE_LABELS[campaign.type],
        audienceGroupName: group?.name ?? '',
        statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status],
        statusHint: CAMPAIGN_STATUS_HINTS[campaign.status],
        scheduleLabel: CAMPAIGN_SCHEDULE_LABELS[campaign.scheduleKind],
        sent: results.sent,
        suppressed: results.suppressed,
        appointments: results.resultingAppointments,
        createdAt: campaign.createdAt,
        createdByCurrentUser: campaign.createdByUserId === ctx.userId,
      }
    }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CAMPAIGNS_PAGE.title}</h1>
        <p className="text-sm text-ink-2">{CAMPAIGNS_PAGE.lead}</p>
      </div>

      <CampaignBuilder
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        typeOptions={TYPE_OPTIONS}
        channelOptions={CHANNEL_OPTIONS}
        lowConfidenceHint={ASSISTANT_LOW_CONFIDENCE_HINT}
      />

      <CampaignsTable campaigns={rows} />
    </div>
  )
}
