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
  toPersianDigits,
} from '@/core/localization'
import { cx } from '@/core/lib'

import { LEADS_PAGE } from '@/app/catalog'
import { loadLeadsCartable } from '@/app/_customers/page-data'
import {
  LeadRowActions,
  NewLeadDialog,
} from '@/app/_customers/lead-forms'
import { requireStaffPanel } from '@/app/_shell/session'

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
              <tr className="border-b border-line bg-surface-2 text-ink-3">
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
              {data.rows.map((row) => (
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
    </div>
  )
}

/* ── The KPI row ───────────────────────────────────────────────────────────── */

/** The four counts, as the cartable's own cards render them. */
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
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      <CountCard label={LEADS_PAGE.counts.new} value={counts.newCount} tone="warn" />
      <CountCard label={LEADS_PAGE.counts.following} value={counts.followingCount} />
      <CountCard label={LEADS_PAGE.counts.converted} value={counts.convertedCount} tone="ok" />
      <CountCard label={LEADS_PAGE.counts.lost} value={counts.lostCount} tone="muted" />
    </div>
  )
}

/** One count, as a card with the tone the state's own weight carries. */
function CountCard({
  label,
  value,
  tone,
}: {
  readonly label: string
  readonly value: number
  readonly tone?: 'ok' | 'warn' | 'muted'
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4">
      <span
        className={cx(
          'text-xs font-medium',
          tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'muted' ? 'text-ink-3' : 'text-ink-2',
        )}
      >
        {label}
      </span>
      <span className="text-2xl font-bold tabular-nums text-ink">{toPersianDigits(value)}</span>
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
              'rounded-pill px-4 py-2 text-sm font-semibold no-underline',
              active
                ? 'bg-brand text-surface'
                : 'bg-surface-sunken text-ink-2 hover:bg-surface-2',
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
