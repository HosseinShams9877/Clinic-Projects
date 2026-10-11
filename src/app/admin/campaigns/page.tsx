/**
 * The manager's campaigns surface — `02-architecture.md` §9's `admin/campaigns.html`.
 *
 * The page is a read and a render: the four writes the surface needs (create, submit,
 * approve, the pause/resume pair) are server actions, so the page holds no form and no
 * client boundary beyond the workspace and the table. The eight built-in audience
 * groups are ensured here rather than in a migration because a group is a query the
 * tenant owns, and a tenant whose eight a migration created is a tenant whose ninth a
 * later release cannot add.
 *
 * ## What the page counts, and what it does not
 *
 * The demo's header names a ninety-day window and its tiles name a month of sends.
 * Neither is a read the product holds — `campaignResults` counts a campaign's whole
 * ledger, and the messages module's per-customer cap is per day and not per month — so
 * the two sub-lines name the scope the number actually covers, which is the honest
 * sentence about the same count. The conversion the assistant's panel shows is the
 * clinic's own for the type the proposal picked, and a type that has never sent reads
 * `—`, because a rate the page invented for a type with no sends would be a rate the
 * clinic never had.
 *
 * ## What the page renders as the demo does not
 *
 * The demo's four filter chips collapse the module's six statuses into three, which
 * would name a state a row is not in; the six are the row's own vocabulary and the bar
 * holds them. The demo's report and edit row buttons are omitted, because a campaign's
 * detail is not a route the product holds and the module's edit sends a row back to
 * `DRAFT`, which is the builder's surface and not the row's. The demo's wizard fields
 * with no `CampaignInput` behind them — a doctor and a service limiter, a discount
 * code, an end date, the two suppression switches — are omitted rather than rendered
 * as controls that write nothing.
 *
 * The manager default holds `manage_campaigns` (`04-roles-permissions.md` §2.1), and
 * the page's permission is the panel's: `requireStaffPanel('admin')` resolves the
 * membership before the reads run, and the actions re-resolve it, so a write is never
 * scoped by a context a page assembled.
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

import { AudienceGroupsCard, type GroupCard } from './_components/AudienceGroupsCard'
import { CampaignsKpi } from './_components/CampaignsKpi'
import { CampaignsTable, type CampaignRowView } from './_components/CampaignsTable'
import {
  CampaignWorkspace,
  type GroupOption,
  type TypeCard,
} from './_components/CampaignWorkspace'
import { NewCampaignButton } from './_components/NewCampaignButton'
import { StatusChips, type StatusChip } from './_components/StatusChips'

export const metadata: Metadata = { title: CAMPAIGNS_PAGE.title }

/** The page's own route, as the chips, the pagination and the wizard's close link to. */
const BASE_PATH = '/admin/campaigns'

/** The three search params the page reads, as the framework hands them. */
const STATE_PARAM = 'state'
const NEW_PARAM = 'new'
const TYPE_PARAM = 'type'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The icon each of the eight type cards renders, as the set the icon component owns.
 *
 * The eight are the module's own and the icons are chosen from what the design system
 * holds: a birthday is a date, a winback is a return, a next session is an appointment,
 * and the five after are the five concepts the icons name directly.
 */
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

/** The eight type cards, as the workspace's own grid renders them. */
const TYPE_CARDS: readonly TypeCard[] = (
  Object.entries(CAMPAIGN_TYPE_LABELS) as readonly [CampaignType, string][]
).map(([value, label]) => ({
  value,
  label,
  description: CAMPAIGN_TYPE_DESCRIPTIONS[value],
  icon: TYPE_ICONS[value] ?? 'message',
}))

/** The two dropdown lists, built here because the module's barrel is server-only. */
const TYPE_OPTIONS = TYPE_CARDS.map((card) => ({ value: card.value, label: card.label }))
const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({
  value,
  label,
}))

/** One search param as a string, or '' when the URL does not name it. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * «کمپین‌ها» — the assistant, the eight types, the clinic's own campaigns, and the eight
 * groups the campaigns reach.
 */
export default async function AdminCampaignsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
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
    // The ledger is counted inside the scope, because a count beside a row is the same
    // transaction the row came from — a send that lands between the two would be a row
    // and a count that disagree about one campaign.
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

  /** The chips' six statuses, each the count of rows the state holds. */
  const chips: readonly StatusChip[] = Object.entries(CAMPAIGN_STATUS_LABELS).map(
    ([value, label]) => ({
      value,
      label,
      count: rows.filter((row) => row.status === value).length,
    }),
  )

  /** The href for a state, which is the page's own other params and the state. */
  const stateHrefFor = (next: string | null): string => {
    const sp = new URLSearchParams()
    if (next !== null) sp.set(STATE_PARAM, next)
    return sp.toString() === '' ? BASE_PATH : `${BASE_PATH}?${sp.toString()}`
  }

  /** The href for a page, which keeps the state the chips chose. */
  const pageHrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (state !== '') sp.set(STATE_PARAM, state)
    if (next > 1) sp.set('page', String(next))
    return sp.toString() === '' ? BASE_PATH : `${BASE_PATH}?${sp.toString()}`
  }

  /** The href that opens the wizard, which keeps the state and the page beneath it. */
  const newHref = (() => {
    const sp = new URLSearchParams()
    sp.set(NEW_PARAM, '1')
    if (state !== '') sp.set(STATE_PARAM, state)
    if (page > 1) sp.set('page', String(page))
    return `${BASE_PATH}?${sp.toString()}`
  })()

  /** The href that closes the wizard, which is the page's own params without the two. */
  const closeHref = pageHrefFor(page)

  // The three tiles' own figures: the active count, the ledger's two totals, and the
  // rate the two hold. Nothing has been sent reads `—`, because a rate the page computed
  // over zero sends is a rate the clinic does not have.
  const activeRows = rows.filter((row) => row.status === 'ACTIVE')
  const visits = results.reduce((total, result) => total + result.resultingAppointments, 0)
  const sends = results.reduce((total, result) => total + result.sent, 0)

  /** Σ the ledger's two counts per type, as the assistant's own conversion reads them. */
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

  /**
   * The clinic's own conversion per type — attributed visits over sends — keyed as the
   * enum spells it, or `null` for a type that has not sent yet.
   */
  const conversionsByType: Readonly<Record<string, number | null>> = Object.fromEntries(
    TYPE_CARDS.map((card) => {
      const held = totalsByType.get(card.value)
      if (held === undefined || held.sent === 0) return [card.value, null] as const
      return [card.value, held.visits / held.sent] as const
    }),
  )

  // The eight cards are the module's own catalog, and the count each carries is the
  // group's own `lastCount` — the number the nightly refresh recomputes from the same
  // evaluation the dispatch runs, and not a re-evaluation the page performs.
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
