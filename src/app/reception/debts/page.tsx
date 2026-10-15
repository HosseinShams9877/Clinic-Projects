/**
 * The desk's debt list — `02-architecture.md` §9's `reception/debts.html`.
 *
 * The secretary's default holds `view_debts` and `follow_up_debt`
 * (`04-roles-permissions.md` §2.1's 1–12), and the list the desk reads is the product's
 * follow-up queue: the appointments whose balance is open, stacked by how late they are.
 * The balance is computed by the read and never stored, so the list a receptionist opens
 * is the list the ledger just made — and the one a receipt empties in the request that
 * recorded it.
 *
 * ## The four tabs, and what each one is for
 *
 * The desk's work is a follow-up queue, and a queue is only useful if it says what to
 * do *next*. The four tabs are the four answers to that:
 *
 * - **همه بدهکاران** — every open debt, no follow-up filter. This is the tab the desk
 *   opens to see the whole picture, and the default because the first thing a
 *   receptionist asks is "what is owed" and not "what have I called about".
 * - **پیگیری امروز** — the debts whose `debtNextContactAt` is today. The tab a
 *   follow-up lands in the moment its date is recorded for today.
 * - **همه پیگیری‌ها** — every debt the desk has called about, sorted by the nearest
 *   next-contact date. Overdue follow-ups rise to the top, because those are the calls
 *   the desk promised and then missed.
 * - **بدون پیگیری** — the debts the desk has never called about. This is the tab that
 *   grows when the desk stops calling, and the one whose emptiness is the design goal.
 *
 * ## The follow-up date filter, and how it differs from the «پیگیری امروز» tab
 *
 * The «پیگیری امروز» tab is *today* — the day the desk opens the page. The
 * follow-up date filter is *any day the desk names*: the 27th of Mordad, the
 * 3rd of Shahrivar, whichever. The two are one predicate with two sources of
 * truth — the tab's "today" and the filter's chosen day — and the filter wins
 * when both are present, because a desk that has typed a date is asking about
 * that date and not about today. The field is the shell's own `JalaliDatePicker`
 * (the one the appointment's day picker uses), so the date the desk picks and
 * the date the grid drew are one control and one calendar.
 *
 * ## Why the search, the doctor filter, the date filter and the total are one block
 *
 * The desk asks four questions of the same list — "which one is this customer",
 * "is this my doctor's", "which day is this follow-up for", and "how much is this
 * in total" — and the four are answered from the same rows. The total under the
 * table follows all three filters, so the desk can read a single day's worth by
 * picking the day and reading the number beneath. The server does the filtering;
 * the client only types and picks.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { formatMoney, isValidLocalDate } from '@/core/localization'
import { isMember } from '@/core/constants'

import { DEBTS_PAGE } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import {
  contactList,
  readDebtSettings,
  type DebtRow,
} from '@/modules/debts'
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { DebtsKpi } from './_components/debts-kpi'
import { DebtsFollowUpDateField } from './_components/debts-follow-up-date-field'

export const metadata: Metadata = { title: DEBTS_PAGE.reception.title }

/**
 * «ثبت پرداخت»'s two closed lists, labelled from the module that owns them.
 */
const PAYMENT_OPTIONS = {
  method: [
    { value: 'CASH', label: PAYMENT_METHOD_LABELS.CASH },
    { value: 'CARD', label: PAYMENT_METHOD_LABELS.CARD },
    { value: 'ONLINE', label: PAYMENT_METHOD_LABELS.ONLINE },
  ],
  kind: [
    { value: 'PARTIAL', label: PAYMENT_KIND_LABELS.PARTIAL },
    { value: 'FINAL', label: PAYMENT_KIND_LABELS.FINAL },
  ],
} as const

/** The page's own route, as the tab links link back to. */
const BASE_PATH = '/reception/debts'

/** The four views the tab bar offers, keyed as the search param is. */
type DebtsTab = 'everyone' | 'today' | 'all' | 'unfollowed'

/** The tab values, in the order the tab bar renders them. */
const TAB_VALUES: readonly DebtsTab[] = ['everyone', 'today', 'all', 'unfollowed']

/** The default tab, which is the whole picture the desk opens to first. */
const DEFAULT_TAB: DebtsTab = 'everyone'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * «مانده حساب» — the debts the desk owes a call about, as a KPI row, four tabs, a
 * search, a doctor filter, a follow-up date filter, one flat table, and the running
 * total beneath it.
 */
export default async function ReceptionDebtsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const now = realClock()
  const tab = tabFromParam(params.tab)
  const search = asString(params.q).trim()
  const doctorFilter = asString(params.doctor)
  const followUpDate = asLocalDateParam(params.due)

  const { buckets, collectedRial, offset, doctors } = await runInTenantScope(
    session.permissions,
    prisma(),
    async (tx) => {
      const settings = await readDebtSettings(tx, session.tenantId)
      const [buckets, collectedRial, doctors] = await Promise.all([
        contactList({ tx, ctx: session.permissions, now }),
        paymentsThisMonth(tx, session.tenantId, now, settings.utcOffsetMinutes),
        tx.user.findMany({
          where: { tenantId: session.tenantId, isActive: true },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
        }),
      ])
      return { buckets, collectedRial, offset: settings.utcOffsetMinutes, doctors }
    },
  )

  const allRows = [
    ...buckets.overdue30,
    ...buckets.overdue7,
    ...buckets.overdue,
    ...buckets.dueSoon,
  ]
  const pastDue = [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue]
  const totalRial = allRows.reduce((total, row) => total + row.balance, 0n)

  const tabRows = rowsForTab(allRows, tab, now, offset)
  const filteredRows = applyFilters(tabRows, search, doctorFilter, followUpDate, offset)

  const visibleTotal = filteredRows.reduce((total, row) => total + row.balance, 0n)
  const isFiltered = search !== '' || doctorFilter !== '' || followUpDate !== null
  const totalLabel = isFiltered ? DEBTS_PAGE.total.filteredLabel : DEBTS_PAGE.total.label

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(filteredRows, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (tab !== DEFAULT_TAB) sp.set('tab', tab)
    if (search !== '') sp.set('q', search)
    if (doctorFilter !== '') sp.set('doctor', doctorFilter)
    if (followUpDate !== null) sp.set('due', followUpDate)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  const doctorOptions = [
    { value: '', label: DEBTS_PAGE.filter.allDoctors },
    ...doctors.map((doctor) => ({
      value: doctor.id,
      label:
        doctor.lastName === '' ? doctor.firstName : `${doctor.firstName} ${doctor.lastName}`,
    })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.reception.lead}</p>
      </div>

      <DebtsKpi
        collectedRial={collectedRial}
        overdueCount={pastDue.length}
        totalRial={totalRial}
      />

      <DebtsTabs
        active={tab}
        basePath={BASE_PATH}
        search={search}
        doctor={doctorFilter}
        followUpDate={followUpDate}
      />

      <DebtsFilters
        activeTab={tab}
        search={search}
        doctor={doctorFilter}
        doctorOptions={doctorOptions}
        followUpDate={followUpDate}
        basePath={BASE_PATH}
      />

      <DebtsTable rows={slice} showActions paymentOptions={PAYMENT_OPTIONS} />

      <p className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-ink-3">{totalLabel}</span>
        <span className="font-semibold text-ink tabular-nums">{formatMoney(visibleTotal)}</span>
      </p>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

/* ── The four tabs ─────────────────────────────────────────────────────────── */

/** The tab bar — the four views the desk's follow-up queue offers. */
function DebtsTabs({
  active,
  basePath,
  search,
  doctor,
  followUpDate,
}: {
  readonly active: DebtsTab
  readonly basePath: string
  readonly search: string
  readonly doctor: string
  readonly followUpDate: string | null
}) {
  const labels: Readonly<Record<DebtsTab, string>> = {
    everyone: DEBTS_PAGE.tabs.everyone,
    today: DEBTS_PAGE.tabs.today,
    all: DEBTS_PAGE.tabs.all,
    unfollowed: DEBTS_PAGE.tabs.unfollowed,
  }
  return (
    <nav
      className="flex items-center gap-2 max-panel:flex-nowrap max-panel:overflow-x-auto panel:flex-wrap"
      aria-label={DEBTS_PAGE.reception.title}
    >
      {TAB_VALUES.map((tab) => {
        const isActive = tab === active
        const sp = new URLSearchParams()
        if (tab !== DEFAULT_TAB) sp.set('tab', tab)
        if (search !== '') sp.set('q', search)
        if (doctor !== '') sp.set('doctor', doctor)
        if (followUpDate !== null) sp.set('due', followUpDate)
        const qs = sp.toString()
        const href = qs === '' ? basePath : `${basePath}?${qs}`
        return (
          <Link
            key={tab}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {labels[tab]}
          </Link>
        )
      })}
    </nav>
  )
}

/* ── The filters ───────────────────────────────────────────────────────────── */

/**
 * The search field, the doctor filter, and the follow-up date filter, as a GET form
 * that preserves the tab.
 *
 * A real `<form>` with `method="get"` and no `action`, so a browser without
 * JavaScript still submits it, and the search param is a URL fact the same way every
 * other filter in the product is. The hidden `tab` input is what keeps the person on
 * the tab they were on when the search runs.
 *
 * The follow-up date field is the shell's own `JalaliDatePicker`, wrapped in a
 * `Field` so it inherits the form shell's label and wiring. The picker writes a
 * `name="due"` hidden input the browser submits with the form, so the field is
 * the same shape as the search input beside it and the form does not need a
 * JavaScript handler.
 */
function DebtsFilters({
  activeTab,
  search,
  doctor,
  doctorOptions,
  followUpDate,
  basePath,
}: {
  readonly activeTab: DebtsTab
  readonly search: string
  readonly doctor: string
  readonly doctorOptions: readonly { readonly value: string; readonly label: string }[]
  readonly followUpDate: string | null
  readonly basePath: string
}) {
  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface px-4 py-3"
    >
      {activeTab !== DEFAULT_TAB ? <input type="hidden" name="tab" value={activeTab} /> : null}
      <label className="flex min-w-64 flex-1 flex-col gap-1">
        <span className="text-xs font-semibold text-ink-3">{DEBTS_PAGE.search.label}</span>
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder={DEBTS_PAGE.search.placeholder}
          className="rounded-xs border border-line-2 bg-surface px-3 py-[6px] text-sm text-ink placeholder:text-ink-3 focus:border-brand-300 focus:outline-none"
        />
      </label>
      <label className="flex min-w-48 flex-col gap-1">
        <span className="text-xs font-semibold text-ink-3">{DEBTS_PAGE.filter.doctor}</span>
        <select
          name="doctor"
          defaultValue={doctor}
          className="rounded-xs border border-line-2 bg-surface px-3 py-[6px] text-sm text-ink focus:border-brand-300 focus:outline-none"
        >
          {doctorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <DebtsFollowUpDateField defaultValue={followUpDate} />
      <button
        type="submit"
        className="mt-5 shrink-0 rounded-xs border border-brand-300 bg-brand-50 px-4 py-[6px] text-xs font-semibold text-brand-700 hover:bg-brand-100"
      >
        {DEBTS_PAGE.search.label}
      </button>
    </form>
  )
}

/* ── The four tab predicates ───────────────────────────────────────────────── */

function rowsForTab(
  rows: readonly DebtRow[],
  tab: DebtsTab,
  now: Date,
  utcOffsetMinutes: number,
): readonly DebtRow[] {
  if (tab === 'everyone') return rows
  if (tab === 'unfollowed') return rows.filter((row) => row.lastFollowUp === null)
  if (tab === 'today') return rows.filter((row) => isToday(row.nextContactAt, now, utcOffsetMinutes))
  return [...rows]
    .filter((row) => row.lastFollowUp !== null)
    .sort((a, b) => compareByNextContact(a, b, now))
}

/** Whether the given instant is the same clinic-local day as `now`. */
function isToday(instant: Date | null, now: Date, utcOffsetMinutes: number): boolean {
  if (instant === null) return false
  return dayKey(instant, utcOffsetMinutes) === dayKey(now, utcOffsetMinutes)
}

function dayKey(instant: Date, utcOffsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

function compareByNextContact(a: DebtRow, b: DebtRow, now: Date): number {
  if (a.nextContactAt === null && b.nextContactAt === null) return 0
  if (a.nextContactAt === null) return 1
  if (b.nextContactAt === null) return -1
  const aTime = a.nextContactAt.getTime() - now.getTime()
  const bTime = b.nextContactAt.getTime() - now.getTime()
  const aPast = aTime < 0
  const bPast = bTime < 0
  if (aPast && !bPast) return -1
  if (!aPast && bPast) return 1
  return aTime - bTime
}

/* ── The search, doctor and date predicates ────────────────────────────────── */

/**
 * The rows a search, a doctor filter, and a follow-up date leave.
 *
 * The follow-up date is a *day identity*, not an instant: the row's
 * `nextContactAt` is stored as a UTC instant, and the desk's chosen day is a
 * Jalali `YYYY-MM-DD`. The two are compared through the tenant's own offset —
 * the same `dayKey` the «پیگیری امروز» tab uses — so the day the desk picked
 * and the day the row carries are one day and not an off-by-one.
 */
function applyFilters(
  rows: readonly DebtRow[],
  search: string,
  doctorFilter: string,
  followUpDate: string | null,
  utcOffsetMinutes: number,
): readonly DebtRow[] {
  return rows.filter((row) => {
    if (doctorFilter !== '' && row.doctorId !== doctorFilter) return false
    if (followUpDate !== null) {
      if (row.nextContactAt === null) return false
      if (dayKey(row.nextContactAt, utcOffsetMinutes) !== followUpDate) return false
    }
    if (search === '') return true
    const haystack = `${row.customerFirstName} ${row.customerLastName ?? ''} ${row.customerMobile}`
    return haystack.toLowerCase().includes(search.toLowerCase())
  })
}

/* ── The params ────────────────────────────────────────────────────────────── */

/** The tab the URL names, or the default. */
function tabFromParam(value: string | string[] | undefined): DebtsTab {
  const name = typeof value === 'string' ? value : ''
  return isMember(TAB_VALUES, name) ? name : DEFAULT_TAB
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The `?due=` param as a Jalali `LocalDate`, or `null` when it is absent or not a
 * date.
 *
 * `isValidLocalDate` is the same guard every page uses on a day param, so a URL a
 * hand-edited `?due=foo` reaches the page as "no filter" and not as an error. A
 * malformed date is the desk's mistake, and the honest answer is the unfiltered
 * list, not a crash.
 */
function asLocalDateParam(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  if (value === '') return null
  return isValidLocalDate(value) ? value : null
}