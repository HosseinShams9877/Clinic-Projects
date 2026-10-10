/**
 * The reception desk's appointments page — `02-architecture.md` §9's
 * `reception/appointments.html`.
 *
 * The desk's three views of one day — the day grid, the week, and the cartable of
 * results not recorded — behind the tab bar the page carries. The grid is the desk's
 * own: its columns are the doctors who work the weekday, and the row actions are the
 * sentence a receptionist works through — arrival, outcome, no-show, cancel — with the
 * state machine deciding which a row offers.
 *
 * ## Why the page is writable and the manager's page is not
 *
 * `04-roles-permissions.md` §2.1 gives the secretary `manage_appointments`, and this
 * page's `writable` is the prop the grid reads to decide whether a column carries a
 * «نوبت جدید» and a row carries its actions. The manager's oversight page reads the
 * same module functions and passes `false`, which is the one difference between the two
 * surfaces and the reason the two are separate pages rather than one with a role check
 * — the oversight page is a page whose every affordance would be a refusal, and the
 * honest version of it renders none.
 *
 * ## Why the sweep runs on the way to rendering
 *
 * The cartable is raised by the clock and not by a person (`lib/lifecycle.ts`), and the
 * two transitions the sweep makes are idempotent — a row already in the target state is
 * not returned by either query. Running the sweep here is what makes the desk's page
 * show the day already promoted whether or not the worker's tick has landed, and it is
 * the same function the worker calls rather than a second implementation.
 *
 * ## Why the day is a param and not a clock read
 *
 * The grid is navigable — yesterday, tomorrow, a day three weeks out — and the day is
 * `?day=`, which is what the back button and a shared desk shift both speak. The param
 * is parsed and validated here rather than handed to the module, because a malformed
 * date is a URL fact and the module's contract is a `LocalDate`.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  asLocalTime,
  formatDate,
  formatNumber,
  formatTime,
  isValidLocalDate,
  todayLocalDate,
  type LocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { readBookingSettings, runLifecycleSweep } from '@/modules/appointments'

import { Button } from '@/core/components/button'
import { APPOINTMENTS_PAGE } from '@/app/catalog'
import { BookingDialog } from '@/app/_appointments/booking-dialog'
import { DayAlert } from '@/app/_appointments/day-alert'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import {
  loadAppointmentsPage,
  type AppointmentsPageData,
  type AppointmentsView,
} from '@/app/_appointments/page-data'
import { RemindersPanel } from '@/app/_appointments/reminders-panel'
import { RowActions } from '@/app/_appointments/row-actions'
import { ViewTabs } from '@/app/_appointments/view-tabs'
import { WeekGrid } from '@/app/_appointments/week-grid'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: APPOINTMENTS_PAGE.reception.title }

/** The page's own route, as the tab bar and the day navigation link to. */
const BASE_PATH = '/reception/appointments'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The day grid, the week, and the cartable, for the desk that holds
 * `manage_appointments`.
 */
export default async function ReceptionAppointmentsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const view = viewFromParam(params.view)
  const localDate = dateFromParam(params.day)
  const rest = carriedSearch(params)

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    // The cartable is the alarm the sweep raises, and the sweep is idempotent, so the
    // desk's own page is one of the two things that run it. The offset is the tenant's
    // own, because both transitions are facts about the clinic-local day.
    const settings = await readBookingSettings(tx, session.tenantId)
    await runLifecycleSweep({
      tx,
      tenantId: session.tenantId,
      now: realClock(),
      utcOffsetMinutes: settings.utcOffsetMinutes,
    })
    return loadAppointmentsPage({
      tx,
      ctx: session.permissions,
      clinicId: session.permissions.clinicId,
      localDate,
      now: realClock(),
      utcOffsetMinutes: settings.utcOffsetMinutes,
    })
  })

  const hasUnrecorded = data.cartable.some((row) => row.status === 'RESULT_NOT_RECORDED')
  const headerDoctor = data.day.doctors[0] ?? null
  const subtitle = `${formatDate(asLocalDate(localDate), 'long')} — ${formatNumber(data.day.rows.length)} ${APPOINTMENTS_PAGE.countAppointments} ${APPOINTMENTS_PAGE.countConnector} ${formatNumber(data.day.doctors.length)} ${APPOINTMENTS_PAGE.countDoctors}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-ink">{APPOINTMENTS_PAGE.reception.title}</h1>
          <p className="text-sm text-ink-2">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" leadingIcon="search">
            {APPOINTMENTS_PAGE.firstFreeSlot}
          </Button>
          {headerDoctor === null ? null : (
            <BookingDialog
              variant="book"
              panel="reception"
              triggerLabel={APPOINTMENTS_PAGE.controls.newAppointment}
              doctorId={headerDoctor.id}
              doctorName={headerDoctor.name}
              localDate={localDate}
              services={data.day.services}
              customers={data.day.customers}
            />
          )}
        </div>
      </div>

      <DayAlert show={hasUnrecorded} />

      <ViewTabs
        view={view}
        cartableCount={data.cartable.length}
        basePath={BASE_PATH}
        search={rest}
      />

      {view === 'cartable' ? (
        <Cartable rows={data.cartable} />
      ) : view === 'week' ? (
        <div className="flex flex-col gap-4">
          <DayNav localDate={localDate} basePath={BASE_PATH} />
          <WeekGrid
            days={data.week}
            services={data.day.services}
            customers={data.day.customers}
            panel="reception"
            writable
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 panel:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex flex-col rounded-md border border-line bg-surface">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <DayNav localDate={localDate} basePath={BASE_PATH} />
              <h2 className="font-bold text-ink">{APPOINTMENTS_PAGE.gridTitle}</h2>
            </header>
            <div className="p-4">
              <DayGrid
                localDate={localDate}
                doctors={data.day.doctors}
                windows={data.day.windows}
                rows={data.day.rows}
                services={data.day.services}
                customers={data.day.customers}
                panel="reception"
                writable
              />
            </div>
          </section>
          <RemindersPanel reminders={data.reminders} />
        </div>
      )}
    </div>
  )
}

/**
 * The cartable — the rows whose outcome the desk has not recorded, plus the day's
 * expectation and arrivals.
 *
 * `03-data-model.md` §2.2: `RESULT_NOT_RECORDED` surfaces **only** in the reception
 * cartable, which is why the cartable is the module's only query that selects it and
 * the only view of this page that renders it. A row here is a row the sweep raised, and
 * the row's own actions are what clear it.
 */
function Cartable({ rows }: { readonly rows: AppointmentsPageData['cartable'] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-3">{APPOINTMENTS_PAGE.empty.cartable}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-ink">
              {row.customerName ?? APPOINTMENTS_PAGE.controls.blockHours}
            </span>
            <span className="text-xs text-ink-3 tabular-nums">{cartableWhen(row)}</span>
          </div>
          <p className="text-sm text-ink-2">
            {row.doctorName}
            {row.serviceName === null ? '' : ` — ${row.serviceName}`}
          </p>
          <RowActions appointmentId={row.id} status={row.status} panel="reception" />
        </li>
      ))}
    </ul>
  )
}

/**
 * The cartable row's own date and time, as one line.
 *
 * A cartable row can be any day — the alarm is raised two hours past a slot, and a slot
 * from a week ago that was never closed is still outstanding — so the date is shown
 * beside the time rather than elided into a relative phrase.
 */
function cartableWhen(row: AppointmentsPageData['cartable'][number]): string {
  return `${formatDate(asLocalDate(row.localDate), 'short')} ${formatTime(asLocalTime(row.localTime))}`
}

/**
 * The view the URL names, or the day.
 *
 * A value the tab bar did not write is the day view rather than an error, because a
 * bookmark to a view the product no longer holds should still open the page.
 */
function viewFromParam(value: string | string[] | undefined): AppointmentsView {
  if (typeof value === 'string' && (value === 'day' || value === 'week' || value === 'cartable')) {
    return value
  }
  return 'day'
}

/**
 * The day the URL names, or today.
 *
 * Validated through `isValidLocalDate` rather than caught, because the Jalali calendar
 * is the product's own and an invalid day is a mistyped bookmark rather than an error a
 * person should see. Today is the clock's own Jalali date and not a `Date`, for the
 * reason `day-grid.tsx`'s `shiftDay` states.
 */
function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}

/**
 * The search params the tab bar carries forward, minus the two it owns.
 *
 * Written once so a param the page adds later is carried by the tab bar without the tab
 * bar having to know its name; the two the navigation owns are rebuilt by the links
 * themselves.
 */
function carriedSearch(params: Awaited<PageSearchParams>): string {
  const kept = Object.entries(params).filter(([key]) => key !== 'view' && key !== 'day')
  return kept.map(([key, value]) => `&${key}=${String(value)}`).join('')
}
