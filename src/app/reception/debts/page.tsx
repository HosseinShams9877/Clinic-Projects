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
 * ## Why the search, the doctor filter and the total are one block
 *
 * The desk asks three questions of the same list — "which one is this customer", "is
 * this my doctor's", and "how much is this in total" — and the three are answered from
 * the same rows. The total under the table follows the search and the filter, so the
 * desk can read a single customer's balance by searching their mobile and reading the
 * number beneath. The server does the filtering; the client only types.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { formatMoney } from '@/core/localization'
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

export const metadata: Metadata = { title: DEBTS_PAGE.reception.title }

/**
 * «ثبت پرداخت»'s two closed lists, labelled from the module that owns them.
 *
 * Built here, on the server, because the `payments` barrel is a server-only surface —
 * it writes receipts — and the two labels are the only thing the client form needs from
 * it. Reading them here and handing them down keeps the writer's graph out of the
 * browser bundle, and keeps the two sets spelled in the one place the receipt's own
 * catalog spells them.
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
 * search, a doctor filter, one flat table, and the running total beneath it.
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
  const filteredRows = applyFilters(tabRows, search, doctorFilter)

  const visibleTotal = filteredRows.reduce((total, row) => total + row.balance, 0n)
  const isFiltered = search !== '' || doctorFilter !== ''
  const totalLabel = isFiltered ? DEBTS_PAGE.total.filteredLabel : DEBTS_PAGE.total.label

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(filteredRows, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (tab !== DEFAULT_TAB) sp.set('tab', tab)
    if (search !== '') sp.set('q', search)
    if (doctorFilter !== '') sp.set('doctor', doctorFilter)
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

      <DebtsTabs active={tab} basePath={BASE_PATH} search={search} doctor={doctorFilter} />

      <DebtsFilters
        activeTab={tab}
        search={search}
        doctor={doctorFilter}
        doctorOptions={doctorOptions}
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
}: {
  readonly active: DebtsTab
  readonly basePath: string
  readonly search: string
  readonly doctor: string
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
 * The search field and the doctor filter, as a GET form that preserves the tab.
 *
 * A real `<form>` with `method="get"` and no `action`, so a browser without
 * JavaScript still submits it, and the search param is a URL fact the same way every
 * other filter in the product is. The hidden `tab` input is what keeps the person on
 * the tab they were on when the search runs.
 */
function DebtsFilters({
  activeTab,
  search,
  doctor,
  doctorOptions,
  basePath,
}: {
  readonly activeTab: DebtsTab
  readonly search: string
  readonly doctor: string
  readonly doctorOptions: readonly { readonly value: string; readonly label: string }[]
  readonly basePath: string
}) {
  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
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

/**
 * The rows a tab holds, from the four buckets the read returned.
 *
 * `everyone` is the whole list — every open debt, in the order the read returned them
 * (most severe first). It is the default because the first question the desk asks is
 * "what is owed" and not "what have I called about", and the search and the doctor
 * filter narrow it the same way they narrow the other three.
 *
 * `today` is the debts whose next contact is *today in the clinic's own calendar* —
 * not "within 24 hours", because a contact the desk promised for «فردا» belongs in
 * tomorrow's tab, and one promised for «امروز» belongs in today's. The comparison is
 * on the local day, in the tenant's own offset, which is what the offset parameter is
 * for.
 *
 * `all` is every debt the desk has called about, ordered by the nearest next contact
 * first, and the overdue follow-ups (a next contact in the past) rise above the
 * future ones — those are the calls the desk promised and then missed.
 *
 * `unfollowed` is every debt the desk has never called about — `lastFollowUp === null`.
 */
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

/**
 * A day's identity, as the local day the tenant reads it.
 *
 * `YYYY-MM-DD` in the tenant's own calendar, offset by the tenant's minutes, so two
 * instants on the same local day share the key and two instants on different local
 * days do not — the same comparison the `localDate` column makes in the database, done
 * here for the follow-up column, which stores an instant and has no companion.
 */
function dayKey(instant: Date, utcOffsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/** Sort debts by nearest next contact, with a null date last. */
function compareByNextContact(a: DebtRow, b: DebtRow, now: Date): number {
  if (a.nextContactAt === null && b.nextContactAt === null) return 0
  if (a.nextContactAt === null) return 1
  if (b.nextContactAt === null) return -1
  const aTime = a.nextContactAt.getTime() - now.getTime()
  const bTime = b.nextContactAt.getTime() - now.getTime()
  // A next contact in the past sorts above a next contact in the future: the past
  // one is a promise the desk missed.
  const aPast = aTime < 0
  const bPast = bTime < 0
  if (aPast && !bPast) return -1
  if (!aPast && bPast) return 1
  return aTime - bTime
}

/* ── The search and doctor predicates ──────────────────────────────────────── */

/**
 * The rows a search and a doctor filter leave.
 *
 * The search matches the customer's name, mobile, or both, normalised on both sides:
 * the desk types Persian digits and letters, the column stores Latin digits and an
 * already-normalised search name, and the comparison has to be against the same
 * normalised form on both sides. There is no fuzzy match: the desk either has the
 * mobile or the name, and the result set is small enough that the local substring is
 * the right predicate.
 */
function applyFilters(
  rows: readonly DebtRow[],
  search: string,
  doctorFilter: string,
): readonly DebtRow[] {
  const query = search === '' ? '' : search
  return rows.filter((row) => {
    if (doctorFilter !== '' && row.doctorId !== doctorFilter) return false
    if (query === '') return true
    const haystack = `${row.customerFirstName} ${row.customerLastName ?? ''} ${row.customerMobile}`
    return haystack.toLowerCase().includes(query.toLowerCase())
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