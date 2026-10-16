/**
 * The desk's campaigns surface — the reception panel's own `/reception/campaigns`.
 *
 * The page is the manager's own `admin/campaigns` read through the secretary's
 * permission set: `manage_campaigns` is one of the sixteen, a manager may grant it to
 * a secretary, and the page is the surface that grant opens. The layout of the
 * reception panel already resolved the role that belongs in it, and this page's
 * `requireStaffPanel('reception')` resolves the membership again — so a secretary
 * who holds the permission sees the page, and one who does not is redirected before
 * the reads run.
 *
 * ## Why the copy is the manager's own
 *
 * The campaign surface has no desk-specific vocabulary: a campaign is a campaign,
 * its types are the module's eight, and its statuses are the row's own six. The
 * admin catalog is imported rather than duplicated, because two catalogs for one
 * surface would be two places a sentence is spelled and one place it drifts.
 *
 * ## Why the route is its own
 *
 * The reception layout resolves the reception panel, and a link from the reception
 * sidebar has to land inside the panel it was clicked from — so the page is under
 * `/reception` and not a redirect to `/admin/campaigns`. A shared route that both
 * panels used would be a route whose panel header could not be one thing.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { toPersianDigits } from '@/core/localization'
import type { IconName } from '@/core/components/icons'
import type { AudienceGroupKey, CampaignType } from '@/core/constants'

import { CAMPAIGNS_PAGE } from '@/app/catalog'
import { ADMIN_CAMPAIGNS } from '@/app/admin/catalog'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import {
  CAMPAIGN_STATUS_HINTS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_DESCRIPTIONS,
  CAMPAIGN_TYPE_LABELS,
  CHANNEL_LABELS,
  campaignResults,
  listCampaigns,
} from '@/modules/campaigns'
import {
  AUDIENCE_GROUP_DESCRIPTIONS,
  AUDIENCE_GROUP_LABELS,
  ensureBuiltInGroups,
} from '@/modules/audience-groups'
import { ASSISTANT_LOW_CONFIDENCE_HINT } from '@/modules/campaign-assistant'
import { requireStaffPanel } from '@/app/_shell/session'

import { AudienceGroupsCard, type GroupCard } from '@/app/admin/campaigns/_components/AudienceGroupsCard'
import { CampaignsKpi } from '@/app/admin/campaigns/_components/CampaignsKpi'
import { CampaignsTable, type CampaignRowView } from '@/app/admin/campaigns/_components/CampaignsTable'
import {
  CampaignWorkspace,
  type GroupOption,
  type TypeCard,
} from '@/app/admin/campaigns/_components/CampaignWorkspace'
import { NewCampaignButton } from '@/app/admin/campaigns/_components/NewCampaignButton'
import { StatusChips, type StatusChip } from '@/app/admin/campaigns/_components/StatusChips'

export const metadata: Metadata = { title: CAMPAIGNS_PAGE.title }

/** Forced dynamic for the same reason the manager's page is — see its header. */
export const dynamic = 'force-dynamic'

/** The page's own route, as the chips, the pagination and the wizard's close link to. */
const BASE_PATH = '/reception/campaigns'

const STATE_PARAM = 'state'
const NEW_PARAM = 'new'
const TYPE_PARAM = 'type'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/** The icon each of the eight type cards renders. */
const TYPE_ICONS: Readonly<Record<string, IconName>> = {
  BIRTHDAY: 'calendar',
  WINBACK: 'retry',
  NEXT_SESSION: 'appointment',
  OCCASION: 'notification',
  NEW_SERVICE: 'services',
  DEBT_REMINDER: 'debt',
  SURVEY: 'reports',
  LOYALTY: 'customers',
}

const TYPE_CARDS: readonly TypeCard[] = (
  Object.entries(CAMPAIGN_TYPE_LABELS) as readonly [CampaignType, string][]
).map(([value, label]) => ({
  value,
  label,
  description: CAMPAIGN_TYPE_DESCRIPTIONS[value],
  icon: TYPE_ICONS[value] ?? 'message',
}))

const TYPE_OPTIONS = TYPE_CARDS.map((card) => ({ value: card.value, label: card.label }))
const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({
  value,
  label,
}))

function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

export default async function ReceptionCampaignsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const ctx = session.permissions
  const params = await searchParams
  const state = asString(params[STATE_PARAM])
  const page = pageFromParam(params.page)
  const presetType = asString(params[TYPE_PARAM])

  const { groups, campaigns, results } = await runInTenantScope(ctx, prisma(), async (tx) => {
    const [groups, campaigns] = await Promise.all([
      ensureBuiltInGroups({ tx, tenantId: ctx.tenantId }),
      listCampaigns(tx, ctx.tenantId),
    ])
    const results = await Promise.all(
      campaigns.map((campaign) => campaignResults(tx, ctx.tenantId, campaign.id)),
    )
    return { groups, campaigns, results } as const
  })

  const byId = new Map(groups.map((group) => [group.id, group]))

  const rows: readonly CampaignRowView[] = campaigns.map((campaign, index) => {
    const group = byId.get(campaign.audienceGroupId)
    const result = results[index]
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      recurring: campaign.isRecurring,
      typeLabel: CAMPAIGN_TYPE_LABELS[campaign.type],
      channelLabel: CHANNEL_LABELS[campaign.channel],
      audienceGroupName: group?.name ?? '',
      statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status],
      statusHint: CAMPAIGN_STATUS_HINTS[campaign.status],
      audienceCount: group?.lastCount ?? 0,
      sent: result?.sent ?? 0,
      visits: result?.resultingAppointments ?? 0,
      createdByCurrentUser: campaign.createdByUserId === ctx.userId,
    }
  })

  const visible = state === '' ? rows : rows.filter((row) => row.status === state)
  const { slice, totalPages } = paginate(visible, page)

  const chips: readonly StatusChip[] = Object.entries(CAMPAIGN_STATUS_LABELS).map(
    ([value, label]) => ({
      value,
      label,
      count: rows.filter((row) => row.status === value).length,
    }),
  )

  const stateHrefFor = (next: string | null): string => {
    const sp = new URLSearchParams()
    if (next !== null) sp.set(STATE_PARAM, next)
    return sp.toString() === '' ? BASE_PATH : `${BASE_PATH}?${sp.toString()}`
  }

  const pageHrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (state !== '') sp.set(STATE_PARAM, state)
    if (next > 1) sp.set('page', String(next))
    return sp.toString() === '' ? BASE_PATH : `${BASE_PATH}?${sp.toString()}`
  }

  const newHref = (() => {
    const sp = new URLSearchParams()
    sp.set(NEW_PARAM, '1')
    if (state !== '') sp.set(STATE_PARAM, state)
    if (page > 1) sp.set('page', String(page))
    return `${BASE_PATH}?${sp.toString()}`
  })()

  const closeHref = pageHrefFor(page)

  const activeRows = rows.filter((row) => row.status === 'ACTIVE')
  const visits = results.reduce((total, result) => total + result.resultingAppointments, 0)
  const sends = results.reduce((total, result) => total + result.sent, 0)

  const totalsByType = new Map<string, { readonly sent: number; readonly visits: number }>()
  for (const [index, campaign] of campaigns.entries()) {
    const result = results[index]
    if (result === undefined) continue
    const held = totalsByType.get(campaign.type) ?? { sent: 0, visits: 0 }
    totalsByType.set(campaign.type, {
      sent: held.sent + result.sent,
      visits: held.visits + result.resultingAppointments,
    })
  }

  const conversionsByType: Readonly<Record<string, number | null>> = Object.fromEntries(
    TYPE_CARDS.map((card) => {
      const held = totalsByType.get(card.value)
      if (held === undefined || held.sent === 0) return [card.value, null] as const
      return [card.value, held.visits / held.sent] as const
    }),
  )

  const groupCards: readonly GroupCard[] = (
    Object.keys(AUDIENCE_GROUP_LABELS) as readonly AudienceGroupKey[]
  ).map((key) => {
    const group = groups.find((row) => row.key === key)
    return {
      key,
      label: AUDIENCE_GROUP_LABELS[key],
      description: AUDIENCE_GROUP_DESCRIPTIONS[key],
      count: group === undefined ? 0 : group.lastCount,
    }
  })

  const groupOptions: readonly GroupOption[] = groups

  const workspaceKey =
    params[NEW_PARAM] !== undefined ? `open-${presetType}` : 'closed'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{CAMPAIGNS_PAGE.title}</h1>
          <p className="text-sm text-ink-2">
            {`${toPersianDigits(activeRows.length)} ${ADMIN_CAMPAIGNS.subActive} · ${toPersianDigits(
              visits,
            )} ${ADMIN_CAMPAIGNS.subVisits}`}
          </p>
        </div>
        <NewCampaignButton href={newHref} />
      </div>

      <CampaignsKpi
        active={activeRows.length}
        recurring={activeRows.filter((row) => row.recurring).length}
        visits={visits}
        sends={sends}
        conversion={sends === 0 ? null : visits / sends}
      />

      <CampaignWorkspace
        key={workspaceKey}
        typeCards={TYPE_CARDS}
        groups={groupOptions}
        typeOptions={TYPE_OPTIONS}
        channelOptions={CHANNEL_OPTIONS}
        conversionsByType={conversionsByType}
        lowConfidenceHint={ASSISTANT_LOW_CONFIDENCE_HINT}
        chrome={ADMIN_CAMPAIGNS.wizard}
        openFromUrl={params[NEW_PARAM] !== undefined}
        presetTypeFromUrl={presetType === '' ? null : presetType}
        closeHref={closeHref}
      />

      <section className="flex flex-col rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 panel:flex-row panel:items-center panel:justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            {ADMIN_CAMPAIGNS.resultsTitle}
            <span className="rounded-pill bg-brand-50 px-3 py-[4px] text-xs font-semibold text-brand-700 tabular-nums">
              {toPersianDigits(rows.length)}
            </span>
          </h2>
          <StatusChips
            chips={chips}
            active={state === '' ? null : state}
            basePath={BASE_PATH}
            hrefFor={stateHrefFor}
          />
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">{CAMPAIGNS_PAGE.results.empty}</p>
        ) : (
          <CampaignsTable campaigns={slice} />
        )}

        <div className="flex flex-col gap-3 border-t border-line px-4 py-3 panel:flex-row panel:items-center panel:justify-between">
          <p className="text-xs text-ink-3 tabular-nums">
            {`${ADMIN_CAMPAIGNS.showingPrefix}${toPersianDigits(
              slice.length,
            )}${ADMIN_CAMPAIGNS.showingSuffix}`}
          </p>
          <Pagination page={page} totalPages={totalPages} hrefFor={pageHrefFor} />
        </div>
      </section>

      <AudienceGroupsCard groups={groupCards} />
    </div>
  )
}