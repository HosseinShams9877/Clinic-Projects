/**
 * The manager's customer file — `02-architecture.md` §9's `admin/customers.html`.
 *
 * The manager holds `view_all_customers`, so the file is the clinic's whole file read
 * under the same permission the desk reads it with. The manager's file is the wider
 * of the two: the desk works the day and the manager works the practice, so the
 * columns here are the ones that answer a marketing question — where the person came
 * from, whether they may be messaged, what they still owe — and the desk's are the
 * ones that answer a booking one.
 *
 * ## Why the five chip filters are audience groups
 *
 * The demo's chips (بدهکاران، موعد رسیده‌ها، وفادارها، خوابیده‌ها، تازه‌واردها) are
 * not five new `where` clauses this page invents; they are five of the eight
 * built-in groups `03-data-model.md` §2.7 names, evaluated through the
 * `audience-groups` module's own evaluation. That is the rule that keeps the count
 * the manager approves on a campaign the count the campaign sends to: a page that
 * re-implemented «خوابیده‌ها» would be a second definition of the same group, and
 * the two would drift the day one of them changed.
 *
 * The label a chip renders is the group's own, from the module's catalog, and not
 * the page's restatement of it — the one place a group's name is written is the one
 * place a manager recognises it from the campaign builder.
 *
 * ## What this page does not render, and why
 *
 * The demo's checkbox column and the «N مشتری انتخاب شده» bar it opens. A group is
 * a saved *predicate* (`03-data-model.md` Decision 3) and not a stored member list,
 * so a selection of rows has no group to be saved as, and the campaign builder picks
 * its audience through its own group selector — the two actions the bar offers have
 * no write surface in the architecture, and two buttons that cannot act are two
 * buttons the page does not render.
 *
 * «آخرین خدمت», the service the person's last visit was for. The module's list row
 * carries the visit and not its service, and the page composes the reads the module
 * owns rather than a join the module did not write; the profile's own history holds
 * it, and the profile is one click away.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import {
  asLocalDate,
  dateToLocalDate,
  formatDate,
  fromUtcInstant,
  formatMoney,
  formatNumber,
  formatPhone,
  jalaliParts,
  monthName,
  toPersianDigits,
} from '@/core/localization'
import { AudienceGroupKey, AcquisitionSource, isMember } from '@/core/constants'
import { ACQUISITION_SOURCE_LABELS } from '@/modules/customers'
import { AUDIENCE_GROUP_LABELS, evaluateGroup } from '@/modules/audience-groups'
import { readReportOffset } from '@/modules/reports'
import { readManagerHome } from '@/modules/dashboard'
import type { CustomerListRow } from '@/modules/customers'
import { cx } from '@/core/lib'

import { ADMIN_CUSTOMERS } from '@/app/admin/catalog'
import { CUSTOMERS_PAGE } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { AddCustomerDialog } from './_components/AddCustomerDialog'
import { ExportButton } from './_components/ExportButton'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.admin.title }

/** The page's own route, as the search form submits to and the chips link to. */
const BASE_PATH = '/admin/customers'

/** The route the profile lives at, as the table's name cell links to. */
const PROFILE_BASE_PATH = '/admin/customer'

/** The search param the chip bar writes, as the group key or nothing. */
const GROUP_PARAM = 'group'

/**
 * The five built-ins the file's chips filter by, in the demo's own order.
 *
 * The set is the page's and not the module's because the module owns the eight and
 * the page asks five of them; a sixth chip would be a ninth group the module does
 * not hold, and the type names the five the evaluation accepts.
 */
const CHIP_KEYS = [
  AudienceGroupKey.Debtors,
  AudienceGroupKey.CycleDue,
  AudienceGroupKey.Loyal,
  AudienceGroupKey.Dormant,
  AudienceGroupKey.New,
] as const

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The clinic's customer file, searched by name or mobile and filtered by group.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])
  const group = groupFromParam(params[GROUP_PARAM])

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const today = fromUtcInstant(realClock(), await readReportOffset(tx, session.tenantId)).localDate
    const [list, month, groupIds] = await Promise.all([
      loadCustomersList({ tx, ctx: session.permissions, scope: 'all', query }),
      readManagerHome(tx, session.tenantId, today),
      group === null
        ? Promise.resolve(null)
        : evaluateGroup({
            tx,
            tenantId: session.tenantId,
            predicate: { kind: 'BUILT_IN', key: group },
            now: realClock(),
          }),
    ])
    return { list, month, groupIds } as const
  })

  const rows =
    data.groupIds === null ? data.list.rows : data.list.rows.filter((row) => data.groupIds!.includes(row.id))
  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(rows, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (query !== '') sp.set(CUSTOMER_QUERY_PARAM, query)
    if (group !== null) sp.set(GROUP_PARAM, group)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.admin.title}</h1>
          <p className="text-sm text-ink-2">
            {formatNumber(data.month.month.newCustomers)} {ADMIN_CUSTOMERS.subNewThisMonth}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton rows={rows} dateStamp={realClock().toISOString().slice(0, 10)} />
          <AddCustomerDialog />
        </div>
      </div>

      <section className="flex flex-col rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 panel:flex-row panel:items-center">
          <div className="w-full panel:w-72">
            <CustomerSearchForm query={query} basePath={BASE_PATH} />
          </div>
          <GroupChips active={group} basePath={BASE_PATH} />
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">
            {query === '' ? CUSTOMERS_PAGE.empty.noCustomers : CUSTOMERS_PAGE.empty.noResults}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{CUSTOMERS_PAGE.admin.title}</caption>
              <thead>
                <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
                  <Th>{ADMIN_CUSTOMERS.columns.name}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.birthday}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.source}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.lastVisit}</Th>
                  <Th className="text-center">{ADMIN_CUSTOMERS.columns.visits}</Th>
                  <Th className="text-end">{ADMIN_CUSTOMERS.columns.balance}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.message}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.profile}</Th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <CustomerRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="text-xs text-ink-3">
            {ADMIN_CUSTOMERS.showingPrefix}
            {formatNumber(slice.length)}
            {ADMIN_CUSTOMERS.showingOf}
            {formatNumber(rows.length)}
            {ADMIN_CUSTOMERS.showingSuffix}
          </span>
          <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
        </footer>
      </section>
    </div>
  )
}

/* ── The chip bar ─────────────────────────────────────────────────────────────── */

/** The chip bar — «همه» and the five built-ins, as `?group=` links. */
function GroupChips({
  active,
  basePath,
}: {
  readonly active: string | null
  readonly basePath: string
}) {
  const chips: readonly { readonly key: string; readonly label: string }[] = [
    { key: '', label: ADMIN_CUSTOMERS.filterAll },
    ...CHIP_KEYS.map((key) => ({ key, label: AUDIENCE_GROUP_LABELS[key] })),
  ]

  return (
    <nav className="flex flex-wrap gap-2" aria-label={CUSTOMERS_PAGE.admin.title}>
      {chips.map((chip) => {
        const isActive = chip.key === (active ?? '')
        return (
          <Link
            key={chip.key}
            href={chip.key === '' ? basePath : `${basePath}?${GROUP_PARAM}=${chip.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
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

/* ── The file's own row ──────────────────────────────────────────────────────── */

/** One customer, as the manager's file renders it. */
function CustomerRow({ row }: { readonly row: CustomerListRow }) {
  const name = row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
  const balance = row.chargedTotal - row.paidTotal

  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700"
            aria-hidden="true"
          >
            {row.firstName.slice(0, 1)}
          </span>
          <span className="flex flex-col">
            <Link
              href={`${PROFILE_BASE_PATH}/${row.id}`}
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              {name}
            </Link>
            <span className="text-xs text-ink-3 tabular-nums" dir="ltr">
              {formatPhone(row.mobile)}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-ink-3 tabular-nums">{formatBirthday(row.birthDate)}</td>
      <td className="px-4 py-3">{sourceTag(row.acquisitionSource)}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        {row.lastVisitAt === null ? '—' : formatDate(dateToLocalDate(row.lastVisitAt), 'short')}
      </td>
      <td className="px-4 py-3 text-center font-semibold text-ink tabular-nums">
        {toPersianDigits(row.completedSessions)}
      </td>
      <td className="px-4 py-3 text-end font-bold tabular-nums">
        {balance <= 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="text-warn">{formatMoney(balance)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={cx(
            'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
            row.consentWhatsApp ? 'bg-ok-bg text-ok' : 'bg-neutral-bg text-ink-3',
          )}
        >
          {row.consentWhatsApp ? ADMIN_CUSTOMERS.messageable.yes : ADMIN_CUSTOMERS.messageable.no}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`${PROFILE_BASE_PATH}/${row.id}`}
          className="inline-flex items-center rounded-xs border border-transparent bg-brand-50 px-3 py-[6px] text-xs font-semibold text-brand-700 no-underline hover:bg-brand-100"
        >
          {ADMIN_CUSTOMERS.columns.profile}
        </Link>
      </td>
    </tr>
  )
}

/**
 * One birthday, as the file writes it: the day and the month, and no year.
 *
 * The year is a fact the profile holds and the file does not need; a birthday column
 * is a campaign question and the campaign asks «متولدین این ماه», which the month
 * alone answers.
 */
function formatBirthday(birthDate: string | null): string {
  if (birthDate === null) return '—'
  const { month, day } = jalaliParts(asLocalDate(birthDate))
  return `${toPersianDigits(day)} ${monthName(month)}`
}

/** One acquisition source, as the small tag the file's column renders. */
function sourceTag(source: string | null): React.ReactNode {
  if (source === null) return <span className="text-ink-3">—</span>
  if (!isMember(AcquisitionSource, source)) return <span className="text-ink-2">{source}</span>
  return (
    <span className="inline-flex rounded-pill bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
      {ACQUISITION_SOURCE_LABELS[source]}
    </span>
  )
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

/** The group the URL names, or `null` when it names none the module holds. */
function groupFromParam(value: string | string[] | undefined): AudienceGroupKey | null {
  if (typeof value !== 'string') return null
  return isMember(AudienceGroupKey, value) ? value : null
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
