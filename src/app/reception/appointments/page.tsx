/**
 * The reception desk's appointments page — `02-architecture.md` §9's
 * `reception/appointments.html`.
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
  jalaliWeekday,
  minutesToTime,
  timeToMinutes,
  todayLocalDate,
  weekdayName,
  type LocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { readBookingSettings, runLifecycleSweep, type AppointmentRow, type DoctorDayWindow } from '@/modules/appointments'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import { APPOINTMENTS_PAGE, RECEPTION_APPOINTMENTS } from '@/app/catalog'
import { BookingDialog } from '@/app/_appointments/booking-dialog'
import { DayAlert } from '@/app/_appointments/day-alert'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import { DayPicker } from '@/app/_appointments/day-picker'
import {
  loadAppointmentsPage,
  type AppointmentsPageData,
  type AppointmentsView,
} from '@/app/_appointments/page-data'
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
  const liveRows = data.day.rows.filter(
    (row) => !row.isSlotBlock && row.status !== 'CANCELLED' && row.status !== 'RESCHEDULED',
  )
  const doctorCount = new Set<string>([
    ...data.day.windows.map((w) => w.id),
    ...liveRows.map((row) => row.doctorId),
  ]).size
  const subtitle = `${weekdayName(jalaliWeekday(localDate))} ${formatDate(asLocalDate(localDate), 'long')} — ${formatNumber(liveRows.length)} ${APPOINTMENTS_PAGE.countAppointments} ${APPOINTMENTS_PAGE.countConnector} ${formatNumber(doctorCount)} ${APPOINTMENTS_PAGE.countDoctors}`
  const firstFree = firstFreeSlot(data.day.windows, data.day.rows)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{APPOINTMENTS_PAGE.reception.title}</h1>
          <p className="text-sm text-ink-2">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {firstFree === null ? (
            <Button variant="outline" leadingIcon="clock" disabled>
              {APPOINTMENTS_PAGE.firstFreeSlot}
            </Button>
          ) : (
            <BookingDialog
              variant="book"
              panel="reception"
              triggerLabel={APPOINTMENTS_PAGE.firstFreeSlot}
              triggerVariant="outline"
              triggerSize="default"
              triggerIcon="clock"
              doctorId={firstFree.doctorId}
              doctorName={firstFree.doctorName}
              localDate={localDate}
              defaultTime={firstFree.time}
              services={data.day.services}
              customers={data.day.customers}
              doctorsByServiceId={data.day.doctorsByServiceId}
              freeSlotsByDoctorId={data.day.freeSlotsByDoctorId}
            />
          )}
          <BookingDialog
            variant="book"
            panel="reception"
            triggerLabel={APPOINTMENTS_PAGE.registerAppointment}
            triggerVariant="primary"
            triggerSize="default"
            triggerIcon="add"
            localDate={localDate}
            services={data.day.services}
            customers={data.day.customers}
            doctorsByServiceId={data.day.doctorsByServiceId}
            freeSlotsByDoctorId={data.day.freeSlotsByDoctorId}
          />
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
        <section className="flex min-w-0 flex-col rounded-md border border-line bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <DayNav localDate={localDate} basePath={BASE_PATH} />
              <DayPicker localDate={localDate} basePath={BASE_PATH} />
            </div>
            <h2 className="font-bold text-ink">{APPOINTMENTS_PAGE.gridTitle}</h2>
          </header>
          <div className="overflow-x-auto p-4">
            <DayGrid
  localDate={localDate}
  doctors={data.day.doctors}
  windows={data.day.windows}
  rows={data.day.rows}
  services={data.day.services}
  customers={data.day.customers}
  servicesByDoctorId={data.day.servicesByDoctorId}
  workingDaysByDoctorId={data.day.workingDaysByDoctorId}
  freeSlotsByDoctorId={data.day.freeSlotsByDoctorId}
  panel="reception"
  writable
/>
          </div>
          <div className="flex flex-wrap items-center gap-5 border-t border-line px-4 py-3 text-xs text-ink-3">
            <span className="flex items-center gap-1">
              <Icon name="treatment" size="compact" />
              {RECEPTION_APPOINTMENTS.legend.platform}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="phone" size="compact" />
              {RECEPTION_APPOINTMENTS.legend.secretary}
            </span>
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * The earliest free slot of the day.
 */
function firstFreeSlot(
  windows: readonly DoctorDayWindow[],
  rows: readonly AppointmentRow[],
): { readonly doctorId: string; readonly doctorName: string; readonly time: string } | null {
  const AXIS_STEP = 30
  let best: { readonly doctorId: string; readonly doctorName: string; readonly minute: number } | null = null
  for (const w of windows) {
    for (let minute = w.startMinute; minute < w.endMinute; minute += AXIS_STEP) {
      const taken = rows.some(
        (row) => row.doctorId === w.id && timeToMinutes(asLocalTime(row.localTime)) === minute,
      )
      if (taken) continue
      if (best === null || minute < best.minute) {
        best = { doctorId: w.id, doctorName: w.name, minute }
      }
      break
    }
  }
  if (best === null) return null
  return { doctorId: best.doctorId, doctorName: best.doctorName, time: minutesToTime(best.minute) }
}

/**
 * The cartable — the rows whose outcome the desk has not recorded.
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

function cartableWhen(row: AppointmentsPageData['cartable'][number]): string {
  return `${formatDate(asLocalDate(row.localDate), 'short')} ${formatTime(asLocalTime(row.localTime))}`
}

function viewFromParam(value: string | string[] | undefined): AppointmentsView {
  if (typeof value === 'string' && (value === 'day' || value === 'week' || value === 'cartable')) {
    return value
  }
  return 'day'
}

function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}

function carriedSearch(params: Awaited<PageSearchParams>): string {
  const kept = Object.entries(params).filter(([key]) => key !== 'view' && key !== 'day')
  return kept.map(([key, value]) => `&${key}=${String(value)}`).join('')
}