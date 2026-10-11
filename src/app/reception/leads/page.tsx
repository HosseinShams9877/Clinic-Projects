/**
 * The lead cartable — `02-architecture.md` §9's `reception/leads.html`.
 *
 * The desk's own working surface: the people who contacted the clinic and have not had
 * a service yet. A lead is not an entity (`02-architecture.md` §9's note: "a Lead is
 * not a separate entity … it is **one entity with a lifecycle**, owned by `customers`"),
 * so the cartable is a filtered read of the customer file, and the four states it
 * filters by are the module's own `LeadStatus`.
 *
 * ## Why the KPI row and the chips read the same four states
 *
 * The four counts and the four chips are the cartable's own vocabulary restated as a
 * number and as a filter, and the two are kept in step by naming the same `LeadStatus`
 * set at both — the copy block's four labels are the module's `LEAD_STATUS_LABELS`
 * restated, and a fifth state the module does not hold is a state neither renders.
 *
 * ## Why the page does not convert a lead itself
 *
 * A lead converts on its first booking (DoD 2), and a booking is the appointment
 * surface's write. The cartable's «نوبت» is a link to the desk's own grid, which is
 * where the conversion happens inside the dedupe the booking path already runs; a
 * convert button here would be a second conversion and the one that drops the
 * acquisition source.
 *
 * ## Why nothing removes a row
 *
 * «از دست رفته» is a state change and nothing more. The acquisition report counts the
 * leads the clinic lost (`03-data-model.md` §2.1), and a deleted row is a row the
 * report cannot count — the same rule that keeps a customer undeletable.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { ACQUISITION_SOURCE_LABELS, LEAD_STATUS_LABELS } from '@/modules/customers'
import {
  AcquisitionSource,
  LeadStatus,
  isMember,
} from '@/core/constants'
import {
  dateToLocalDate,
  formatDate,
  formatPercent,
  toPersianDigits,
} from '@/core/localization'
import { cx } from '@/core/lib'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'

import { LEADS_PAGE, RECEPTION_LEADS } from '@/app/catalog'
import { loadLeadsCartable } from '@/app/_customers/page-data'
import {
  LeadRowActions,
  NewLeadDialog,
} from '@/app/_customers/lead-forms'
import { requireStaffPanel } from '@/app/_shell/session'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'

export const metadata: Metadata = { title: LEADS_PAGE.title }

/** The page's own route, as the filter chips link to. */
const BASE_PATH = '/reception/leads'

/** The search param the chip bar writes, as the four states' key. */
const STATUS_PARAM = 'status'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The cartable, its four counts, and the chip the URL carries.
 */
export default async function LeadsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const status = asString(params[STATUS_PARAM]) || undefined

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadLeadsCartable({ tx, ctx: session.permissions, status }),
  )

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(data.rows, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (status !== undefined && status !== '') sp.set(STATUS_PARAM, status)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 panel:flex-row panel:items-end panel:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-ink">{LEADS_PAGE.title}</h1>
          <p className="text-sm text-ink-2">{LEADS_PAGE.lead}</p>
        </div>
        <NewLeadDialog />
      </div>

      <CountsRow counts={data.counts} />

      <ChipBar status={status ?? ''} />

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {LEADS_PAGE.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
                <Th>{LEADS_PAGE.columns.name}</Th>
                <Th>{LEADS_PAGE.columns.mobile}</Th>
                <Th>{LEADS_PAGE.columns.source}</Th>
                <Th>{LEADS_PAGE.columns.status}</Th>
                <Th>{LEADS_PAGE.columns.nextContact}</Th>
                <Th>{LEADS_PAGE.columns.createdAt}</Th>
                <Th>{LEADS_PAGE.columns.actions}</Th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ink">{leadName(row)}</td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
                    {row.mobile}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{sourceLabel(row.acquisitionSource)}</td>
                  <td className="px-4 py-3">
                    {row.leadStatus === null ? (
                      '—'
                    ) : (
                      <StatusBadge status={row.leadStatus} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums">
                    {row.leadNextContactAt === null
                      ? '—'
                      : formatRowDate(row.leadNextContactAt)}
                  </td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums">
                    {formatRowDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <LeadRowActions leadId={row.id} status={row.leadStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

/* ── The KPI row ───────────────────────────────────────────────────────────── */

/** The four KPI tiles, derived from the lead counts over the whole cartable. */
function CountsRow({
  counts,
}: {
  readonly counts: {
    readonly newCount: number
    readonly followingCount: number
    readonly convertedCount: number
    readonly lostCount: number
  }
}) {
  const total = counts.newCount + counts.followingCount + counts.convertedCount + counts.lostCount
  const rate = total === 0 ? 0 : counts.convertedCount / total
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      <CountCard label={RECEPTION_LEADS.kpi.unanswered} value={toPersianDigits(counts.newCount)} icon="phone" tone="bg-warn-bg text-warn" />
      <CountCard label={RECEPTION_LEADS.kpi.conversionRate} value={formatPercent(rate)} icon="success" tone="bg-ok-bg text-ok" />
      <CountCard label={RECEPTION_LEADS.kpi.total} value={toPersianDigits(total)} icon="customers" tone="bg-info-bg text-info" />
      <CountCard label={RECEPTION_LEADS.kpi.following} value={toPersianDigits(counts.followingCount)} icon="message" tone="bg-brand-50 text-brand" />
    </div>
  )
}

/** One count, as an icon tile matching the cycles/debts KPI style. */
function CountCard({
  label,
  value,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly icon: IconName
  readonly tone: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tone)}>
        <Icon name={icon} size="card" />
      </span>
      <span className="flex flex-col">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="text-xl font-bold tabular-nums text-ink">{value}</span>
      </span>
    </div>
  )
}

/* ── The filter chips ──────────────────────────────────────────────────────── */

/** The five chips — all four states and the one that shows them all. */
function ChipBar({ status }: { readonly status: string }) {
  const chips: readonly { readonly key: string; readonly label: string }[] = [
    { key: '', label: LEADS_PAGE.chips.all },
    ...Object.values(LeadStatus).map((value) => ({
      key: value,
      label: LEAD_STATUS_LABELS[value],
    })),
  ]

  return (
    <nav className="flex flex-wrap gap-2" aria-label={LEADS_PAGE.title}>
      {chips.map((chip) => {
        const active = chip.key === status
        const href = chip.key === '' ? BASE_PATH : `${BASE_PATH}?${STATUS_PARAM}=${chip.key}`
        return (
          <Link
            key={chip.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              active
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {chip.label}
          </Link>
        )
      })}
    </nav>
  )
}

/* ── The cartable's own small pieces ───────────────────────────────────────── */

/** One of the four states, as a badge the status column renders. */
function StatusBadge({ status }: { readonly status: string }) {
  if (!isMember(LeadStatus, status)) return <span className="text-ink-3">—</span>
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        status === LeadStatus.Converted
          ? 'bg-ok-bg text-ok'
          : status === LeadStatus.Lost
            ? 'bg-neutral-bg text-ink-3'
            : 'bg-surface-sunken text-ink-2',
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}

/** One lead's full name, joined the way the product writes it. */
function leadName(row: { readonly firstName: string; readonly lastName: string | null }): string {
  return row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
}

/** One acquisition source, or the dash a lead the form never named renders. */
function sourceLabel(source: string | null): string {
  if (source === null) return '—'
  if (!isMember(AcquisitionSource, source)) return source
  return ACQUISITION_SOURCE_LABELS[source]
}

/** One of the cartable's own instants, as the Jalali day the desk reads it as. */
function formatRowDate(at: Date): string {
  return formatDate(dateToLocalDate(at), 'short')
}

/** One column header, with the alignment the design system's tables keep. */
function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
