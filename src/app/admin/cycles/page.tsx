/**
 * The manager's cycle oversight — `02-architecture.md` §9's `admin/cycles.html`.
 *
 * The manager's default holds all sixteen permissions, and the page the manager reads is
 * the clinic's whole course book: the two terminal statuses the completion rate counts,
 * the three open ones the due table reads, and the per-course plan the active table
 * compares against the service's own defaults. It is a read — the demo's own badge is
 * «فقط مشاهده» — because the two writes that close a course are the row's, on the row the
 * manager is looking at, and not a button this page holds.
 *
 * ## Why the due table derives its own four states
 *
 * The module's `CycleStatus` is the engine's own state, and the desk's list is the
 * question «چه کسی برای تماس در صف است؟». The manager's question is a different one —
 * «دوره‌ها کجا دارند از دست می‌روند؟» — which is a distance in days and not an engine
 * state, so the due column derives it from the row's own next-due day and the clinic's
 * own clock. The two vocabularies are kept apart on purpose: a second definition of the
 * module's five statuses would drift the day the sweep changed one.
 *
 * ## What this page deliberately does not render
 *
 * The active table's edit button. Changing a course's interval or session count is not a
 * write the module exposes — the cycle's spacing is set when a session is recorded and
 * the defaults belong to the service — so a pencil that opened nothing would be a button
 * the page cannot back, and the page renders the comparison and not the change.
 *
 * The active table's «دلیل تغییر» column, for the same reason: the schema holds no note
 * on why a course deviates from its service's defaults, and a column of dashes is not a
 * column a manager reads. The comparison the two columns make is the fact the page has.
 *
 * The due table's send log («پیامک رفت» / «در صف»). A per-cycle notification history is
 * not a thing the schema keeps; the honest fact the row holds is whether the desk
 * followed it up, and that is what the «اطلاع‌رسانی» cell answers.
 *
 * The due card's «فهرست تماس منشی» foot link. The desk's contact list is the reception
 * panel's own page, and a manager who opens a reception route is sent back to their own
 * panel (`_shell/session.ts`'s wrong-role redirect), so the link is a door the manager
 * cannot walk through and the card foot carries the count alone.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import {
  asLocalDate,
  dateToLocalDate,
  formatDate,
  formatNumber,
  formatPercent,
  formatPhone,
  fromUtcInstant,
  jalaliParts,
  monthName,
  toPersianDigits,
} from '@/core/localization'
import { CycleStatus } from '@/core/constants'
import { cx } from '@/core/lib'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'

import { ADMIN_CYCLES } from '@/app/admin/catalog'
import { CYCLES_PAGE } from '@/app/catalog'
import { loadCustomerMobiles } from '@/app/_customers/page-data'
import {
  clinicCycles,
  OPEN_CYCLE_STATUSES,
  readUtcOffsetMinutes,
  type CycleRow,
} from '@/modules/cycles'
import { listServices } from '@/modules/services'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { ProgressBar } from '@/app/_components/ProgressBar'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CYCLES_PAGE.admin.title }

/** The page's own route, as the tabs and the chips link back to. */
const BASE_PATH = '/admin/cycles'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/** The two views the tabs switch between, as the `?tab=` param names them. */
type CyclesTab = 'due' | 'active'

/** The three states the due table's chip bar filters by. */
type DueFilter = 'all' | 'overdue' | 'near'

/** The day distance that separates the due table's four states. */
const NEAR_DAYS = 7
const IN_WINDOW_DAYS = 30

/** The week a month count begins at, as the interval's own label reads it. */
const DAYS_PER_MONTH = 30

/**
 * «چرخه درمان» — the clinic's course book, as the manager reads it.
 */
export default async function AdminCyclesPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const tab = tabFromParam(params.tab)
  const filter = filterFromParam(params.filter)
  const now = realClock()

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [rows, offset, services] = await Promise.all([
      clinicCycles({ tx, ctx: session.permissions }),
      readUtcOffsetMinutes(tx, session.tenantId),
      listServices({ tx, ctx: session.permissions }),
    ])
    return {
      rows,
      offset,
      serviceDefaults: new Map(
        services.map((service) => [
          service.id,
          { intervalDays: service.defaultIntervalDays, totalSessions: service.defaultSessions },
        ]),
      ),
      mobiles: await loadCustomerMobiles(
        tx,
        session.tenantId,
        rows.map((row) => row.customerId),
      ),
    } as const
  })

  const today = fromUtcInstant(now, data.offset).localDate
  const open = data.rows.filter((row) => (OPEN_CYCLE_STATUSES as readonly string[]).includes(row.status))
  const dueRows = open
    .filter((row) => row.nextDueDate !== null)
    .sort((a, b) => (a.nextDueDate!.getTime() < b.nextDueDate!.getTime() ? -1 : 1))
  const activeRows = open
    .slice()
    .sort((a, b) => (a.startedAt.getTime() < b.startedAt.getTime() ? 1 : -1))

  const visible =
    tab === 'due'
      ? dueRows.filter((row) => matchesFilter(row, filter, today, data.offset))
      : activeRows
  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(visible, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    sp.set('tab', tab)
    if (tab === 'due' && filter !== 'all') sp.set('filter', filter)
    if (next > 1) sp.set('page', String(next))
    return `${BASE_PATH}?${sp.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.admin.title}</h1>
          <p className="text-sm text-ink-2">
            {formatNumber(open.length)} {ADMIN_CYCLES.subActive} · {formatNumber(dueOverdue(dueRows, today, data.offset).length)}{' '}
            {ADMIN_CYCLES.subDue}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-3 py-[6px] text-xs font-semibold text-ink-3">
            <Icon name="view" size="compact" />
            {ADMIN_CYCLES.readOnly}
          </span>
          <Link
            href="/admin/campaigns"
            className="inline-flex items-center gap-2 rounded-sm border border-brand-btn bg-brand-btn p-[10px_18px] text-sm font-semibold text-ink-inverse no-underline shadow-brand hover:bg-brand-600"
          >
            <Icon name="message" size="compact" />
            {ADMIN_CYCLES.makeCampaign}
          </Link>
        </div>
      </div>

      <div
        role="status"
        className="flex items-start gap-3 rounded-md bg-info-bg px-4 py-3 text-sm text-info [border:1px_solid_var(--info)]"
      >
        <Icon name="info" size="card" />
        <span>
          {ADMIN_CYCLES.alert}{' '}
          <Link href="/admin/settings" className="font-semibold underline underline-offset-2">
            {ADMIN_CYCLES.alertSettings}
          </Link>
        </span>
      </div>

      <CyclesKpi
        overdueCount={dueOverdue(dueRows, today, data.offset).length}
        dueThisWeekCount={dueThisWeek(dueRows, today, data.offset).length}
        activeCount={open.length}
        completionRate={completionRate(data.rows)}
      />

      <CyclesTabs tab={tab} dueCount={dueRows.length} activeCount={activeRows.length} />

      {tab === 'due' ? (
        <DueTable
          rows={slice}
          mobiles={data.mobiles}
          utcOffsetMinutes={data.offset}
          today={today}
          filter={filter}
          total={dueRows.length}
          overdueCount={dueOverdue(dueRows, today, data.offset).length}
          nearCount={dueThisWeek(dueRows, today, data.offset).length}
        />
      ) : (
        <ActiveTable rows={slice} serviceDefaults={data.serviceDefaults} />
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-3">
          {ADMIN_CYCLES.showingPrefix}
          {formatNumber(slice.length)}
          {ADMIN_CYCLES.showingSuffix}
        </span>
        <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
      </footer>
    </div>
  )
}

/* ── The KPI row ─────────────────────────────────────────────────────────────── */

/**
 * The four tiles — the demo's KPI row, from the real rows the page already read.
 *
 * Presentational: the page derives the four figures and hands them here, so a tile cannot
 * disagree with the table underneath it. The rate is a percent and the other three are
 * counts, which is the one unit difference the row has.
 */
function CyclesKpi({
  overdueCount,
  dueThisWeekCount,
  activeCount,
  completionRate,
}: {
  readonly overdueCount: number
  readonly dueThisWeekCount: number
  readonly activeCount: number
  readonly completionRate: number
}) {
  const tiles: readonly { readonly label: string; readonly value: string; readonly icon: IconName; readonly tone: string }[] = [
    {
      label: ADMIN_CYCLES.kpi.overdue,
      value: toPersianDigits(overdueCount),
      icon: 'alert',
      tone: 'bg-danger-bg text-danger',
    },
    {
      label: ADMIN_CYCLES.kpi.dueThisWeek,
      value: toPersianDigits(dueThisWeekCount),
      icon: 'clock',
      tone: 'bg-warn-bg text-warn',
    },
    {
      label: ADMIN_CYCLES.kpi.active,
      value: toPersianDigits(activeCount),
      icon: 'treatment',
      tone: 'bg-info-bg text-info',
    },
    {
      label: ADMIN_CYCLES.kpi.completionRate,
      value: formatPercent(completionRate),
      icon: 'success',
      tone: 'bg-ok-bg text-ok',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3"
        >
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tile.tone)}>
            <Icon name={tile.icon} size="card" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-ink-3">{tile.label}</span>
            <span className="text-lg font-bold text-ink tabular-nums">{tile.value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── The tabs ────────────────────────────────────────────────────────────────── */

/** The two views, as links and not buttons — a view is a URL, the way the desk's are. */
function CyclesTabs({
  tab,
  dueCount,
  activeCount,
}: {
  readonly tab: CyclesTab
  readonly dueCount: number
  readonly activeCount: number
}) {
  const tabs: readonly { readonly view: CyclesTab; readonly label: string; readonly count: number }[] = [
    { view: 'due', label: ADMIN_CYCLES.tabs.due, count: dueCount },
    { view: 'active', label: ADMIN_CYCLES.tabs.active, count: activeCount },
  ]

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={CYCLES_PAGE.admin.title}>
      {tabs.map((item) => {
        const active = item.view === tab
        return (
          <Link
            key={item.view}
            href={item.view === 'due' ? `${BASE_PATH}?tab=due` : `${BASE_PATH}?tab=active`}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              active
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {item.label}
            <span className="ms-1 text-[0.7em] opacity-70 tabular-nums">{formatNumber(item.count)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* ── The due table ───────────────────────────────────────────────────────────── */

/** The demo's first pane — the courses whose next session has a day, filtered by state. */
function DueTable({
  rows,
  mobiles,
  utcOffsetMinutes,
  today,
  filter,
  total,
  overdueCount,
  nearCount,
}: {
  readonly rows: readonly CycleRow[]
  readonly mobiles: Readonly<Record<string, string>>
  readonly utcOffsetMinutes: number
  readonly today: string
  readonly filter: DueFilter
  readonly total: number
  readonly overdueCount: number
  readonly nearCount: number
}) {
  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 panel:flex-row panel:items-center panel:justify-between">
        <span className="grow" />
        <DueChips filter={filter} total={total} overdueCount={overdueCount} nearCount={nearCount} />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">{ADMIN_CYCLES.empty.due}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{ADMIN_CYCLES.tabs.due}</caption>
            <thead>
              <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
                <Th>{ADMIN_CYCLES.dueColumns.customer}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.service}</Th>
                <Th className="text-end">{ADMIN_CYCLES.dueColumns.sessions}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.lastVisit}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.nextDue}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.interval}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.status}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.notification}</Th>
                <Th>{ADMIN_CYCLES.dueColumns.doctor}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <DueRow
                  key={row.id}
                  row={row}
                  mobile={mobiles[row.customerId] ?? null}
                  utcOffsetMinutes={utcOffsetMinutes}
                  today={today}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <span className="text-xs text-ink-3">
          {ADMIN_CYCLES.showingPrefix}
          {formatNumber(rows.length)}
          {ADMIN_CYCLES.showingSuffix}
        </span>
      </footer>
    </section>
  )
}

/** One course, as the due table renders it. */
function DueRow({
  row,
  mobile,
  utcOffsetMinutes,
  today,
}: {
  readonly row: CycleRow
  readonly mobile: string | null
  readonly utcOffsetMinutes: number
  readonly today: string
}) {
  const due = row.nextDueDate === null ? null : dueLocalDate(row, utcOffsetMinutes)
  const state = due === null ? null : dueState(due, today)

  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700"
            aria-hidden="true"
          >
            {row.customerName.slice(0, 1)}
          </span>
          <span className="flex flex-col">
            <span className="font-semibold text-ink">{row.customerName}</span>
            {mobile === null ? null : (
              <span className="text-xs text-ink-3 tabular-nums" dir="ltr">
                {formatPhone(mobile)}
              </span>
            )}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-ink-2">{row.serviceName}</td>
      <td className="px-4 py-3 text-end tabular-nums">
        <span className="font-bold text-ink">{toPersianDigits(row.completedSessions)}</span>
        {row.totalSessions === 0 ? null : (
          <span className="text-ink-3">
            {' '}
            {CYCLES_PAGE.columns.of} {toPersianDigits(row.totalSessions)}
          </span>
        )}
        {row.totalSessions === 0 ? null : (
          <ProgressBar done={row.completedSessions} total={row.totalSessions} />
        )}
      </td>
      <td className="px-4 py-3 text-ink-3 tabular-nums">
        {row.lastSessionAt === null ? '—' : formatDate(dateToLocalDate(row.lastSessionAt), 'short')}
      </td>
      <td className="px-4 py-3 font-semibold text-ink tabular-nums">{due === null ? '—' : formatDayMonth(due)}</td>
      <td className="px-4 py-3 text-ink-3 tabular-nums">{intervalLabel(row.intervalDays)}</td>
      <td className="px-4 py-3">{state === null ? <span className="text-ink-3">—</span> : <DueStateBadge state={state} />}</td>
      <td className="px-4 py-3">
        {row.lastContactAt === null ? (
          <span className="inline-flex rounded-pill bg-neutral-bg px-2 py-1 text-xs font-semibold text-ink-3">
            {ADMIN_CYCLES.notNotified}
          </span>
        ) : (
          <span className="inline-flex rounded-pill bg-ok-bg px-2 py-1 text-xs font-semibold text-ok">
            {ADMIN_CYCLES.notified}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-ink-3">{row.doctorName}</td>
    </tr>
  )
}

/** The chip bar — «همه» and the two states the due table filters by. */
function DueChips({
  filter,
  total,
  overdueCount,
  nearCount,
}: {
  readonly filter: DueFilter
  readonly total: number
  readonly overdueCount: number
  readonly nearCount: number
}) {
  const chips: readonly { readonly key: DueFilter; readonly label: string; readonly count: number }[] = [
    { key: 'all', label: ADMIN_CYCLES.filterAll, count: total },
    { key: 'overdue', label: ADMIN_CYCLES.filterOverdue, count: overdueCount },
    { key: 'near', label: ADMIN_CYCLES.filterNear, count: nearCount },
  ]

  return (
    <nav className="flex flex-wrap gap-2" aria-label={ADMIN_CYCLES.dueColumns.status}>
      {chips.map((chip) => {
        const active = chip.key === filter
        return (
          <Link
            key={chip.key}
            href={chip.key === 'all' ? `${BASE_PATH}?tab=due` : `${BASE_PATH}?tab=due&filter=${chip.key}`}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              active
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {chip.label}
            <span className="ms-1 text-[0.7em] opacity-70 tabular-nums">{formatNumber(chip.count)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* ── The active table ────────────────────────────────────────────────────────── */

/**
 * The demo's second pane — each open course against its service's own defaults.
 *
 * The comparison is the page's and not the module's: `CycleRow` carries the course's own
 * spacing and the services barrel carries the catalogue's, and the two beside each other
 * is the fact that tells the manager which definition to change.
 */
function ActiveTable({
  rows,
  serviceDefaults,
}: {
  readonly rows: readonly CycleRow[]
  readonly serviceDefaults: ReadonlyMap<string, { readonly intervalDays: number; readonly totalSessions: number }>
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        {ADMIN_CYCLES.empty.active}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{ADMIN_CYCLES.tabs.active}</caption>
        <thead>
          <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
            <Th>{ADMIN_CYCLES.activeColumns.customer}</Th>
            <Th>{ADMIN_CYCLES.activeColumns.service}</Th>
            <Th className="text-end">{ADMIN_CYCLES.activeColumns.serviceDefault}</Th>
            <Th className="text-end">{ADMIN_CYCLES.activeColumns.customerPlan}</Th>
            <Th>{ADMIN_CYCLES.activeColumns.status}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const defaults = serviceDefaults.get(row.serviceId) ?? null
            const customized =
              defaults !== null &&
              (defaults.intervalDays !== row.intervalDays || defaults.totalSessions !== row.totalSessions)
            return (
              <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-surface-2">
                <td className="px-4 py-3 font-semibold text-ink">{row.customerName}</td>
                <td className="px-4 py-3 text-ink-2">{row.serviceName}</td>
                <td className="px-4 py-3 text-end text-ink-3 tabular-nums">
                  {defaults === null ? '—' : planLabel(defaults.intervalDays, defaults.totalSessions)}
                </td>
                <td
                  className={cx(
                    'px-4 py-3 text-end font-bold tabular-nums',
                    customized ? 'text-brand-700' : 'text-ink-3',
                  )}
                >
                  {planLabel(row.intervalDays, row.totalSessions)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cx(
                      'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
                      customized ? 'bg-brand-50 text-brand-700' : 'bg-neutral-bg text-ink-3',
                    )}
                  >
                    {customized ? ADMIN_CYCLES.customized : ADMIN_CYCLES.defaultPlan}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── The shared bits ─────────────────────────────────────────────────────────── */

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

/** One due state's badge, as the four ladder steps render it. */
function DueStateBadge({ state }: { readonly state: 'overdue' | 'near' | 'inWindow' | 'far' }) {
  const tone =
    state === 'overdue'
      ? 'bg-danger-bg text-danger'
      : state === 'near'
        ? 'bg-warn-bg text-warn'
        : state === 'inWindow'
          ? 'bg-info-bg text-info'
          : 'bg-neutral-bg text-ink-3'
  const label = ADMIN_CYCLES.dueState[state]
  return (
    <span className={cx('inline-flex rounded-pill px-2 py-1 text-xs font-semibold', tone)}>{label}</span>
  )
}

/** The tab the URL names, or the due table when it names neither. */
function tabFromParam(value: string | string[] | undefined): CyclesTab {
  return value === 'active' ? 'active' : 'due'
}

/** The filter the URL names, or «همه» when it names one the page does not hold. */
function filterFromParam(value: string | string[] | undefined): DueFilter {
  if (value === 'overdue' || value === 'near') return value
  return 'all'
}

/** Whether a row is in the filter the chip bar names. */
function matchesFilter(row: CycleRow, filter: DueFilter, today: string, utcOffsetMinutes: number): boolean {
  if (filter === 'all') return true
  const due = row.nextDueDate === null ? null : dueLocalDate(row, utcOffsetMinutes)
  if (due === null) return false
  const days = daysBetween(today, due)
  return filter === 'overdue' ? days < 0 : days >= 0 && days <= NEAR_DAYS
}

/** The rows whose due day has passed. */
function dueOverdue(rows: readonly CycleRow[], today: string, utcOffsetMinutes: number): readonly CycleRow[] {
  return rows.filter((row) => {
    if (row.nextDueDate === null) return false
    return daysBetween(today, dueLocalDate(row, utcOffsetMinutes)) < 0
  })
}

/** The rows whose due day is inside the coming week. */
function dueThisWeek(rows: readonly CycleRow[], today: string, utcOffsetMinutes: number): readonly CycleRow[] {
  return rows.filter((row) => {
    if (row.nextDueDate === null) return false
    const days = daysBetween(today, dueLocalDate(row, utcOffsetMinutes))
    return days >= 0 && days <= NEAR_DAYS
  })
}

/**
 * The four steps of the due ladder, as the row's own day distance reads them.
 *
 * Negative is past due, the week ahead is «نزدیک», the month ahead is «در بازه» and
 * anything later is «دور» — the one a manager schedules against and the one they do not.
 */
function dueState(due: string, today: string): 'overdue' | 'near' | 'inWindow' | 'far' {
  const days = daysBetween(today, due)
  if (days < 0) return 'overdue'
  if (days <= NEAR_DAYS) return 'near'
  if (days <= IN_WINDOW_DAYS) return 'inWindow'
  return 'far'
}

/** The day the row's next session is due, in the clinic's own clock. */
function dueLocalDate(row: CycleRow, utcOffsetMinutes: number): string {
  return fromUtcInstant(row.nextDueDate as Date, utcOffsetMinutes).localDate
}

/** Whole days between two `LocalDate` strings (proleptic Gregorian ISO). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

/** The completed share of the courses that have ended, as a rate the tile reads. */
function completionRate(rows: readonly CycleRow[]): number {
  const closed = rows.filter((row) => row.status === CycleStatus.Completed || row.status === CycleStatus.Abandoned)
  if (closed.length === 0) return 0
  const completed = closed.filter((row) => row.status === CycleStatus.Completed).length
  return completed / closed.length
}

/** One course's spacing, as the week or the month the interval counts. */
function intervalLabel(intervalDays: number): string {
  if (intervalDays % 7 === 0) return `${toPersianDigits(intervalDays / 7)} ${ADMIN_CYCLES.units.weeks}`
  if (intervalDays % DAYS_PER_MONTH === 0) return `${toPersianDigits(intervalDays / DAYS_PER_MONTH)} ${ADMIN_CYCLES.units.months}`
  return `${toPersianDigits(intervalDays)} ${ADMIN_CYCLES.units.days}`
}

/** One plan — a spacing and a session count — as the two columns render it. */
function planLabel(intervalDays: number, totalSessions: number): string {
  const sessions = totalSessions === 0 ? ADMIN_CYCLES.units.openEnded : toPersianDigits(totalSessions)
  return `${intervalLabel(intervalDays)} · ${sessions} ${ADMIN_CYCLES.units.sessions}`
}

/** A Jalali day and month, which is the form the demo's two date columns read. */
function formatDayMonth(localDate: string): string {
  const { month, day } = jalaliParts(asLocalDate(localDate))
  return `${toPersianDigits(day)} ${monthName(month)}`
}
