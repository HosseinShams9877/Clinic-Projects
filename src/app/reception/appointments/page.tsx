// src/app/reception/appointments/page.tsx

/**
 * The reception desk's appointments page.
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
import {
  readBookingSettings,
  runLifecycleSweep,
  type AppointmentRow,
  type DoctorDayWindow,
} from '@/modules/appointments'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import { APPOINTMENTS_PAGE, RECEPTION_APPOINTMENTS } from '@/app/catalog'
import { BookingDialog } from '@/app/_appointments/booking-dialog'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import { DayPicker } from '@/app/_appointments/day-picker'
import { FilterBar } from '@/app/_appointments/filter-bar'
import {
  loadAppointmentsPage,
  type AppointmentsPageData,
  type AppointmentsView,
} from '@/app/_appointments/page-data'
import { RowActions } from '@/app/_appointments/row-actions'
import { ViewTabs } from '@/app/_appointments/view-tabs'
import { WeekGrid } from '@/app/_appointments/week-grid'
import { requireStaffPanel } from '@/app/_shell/session'
import { FullscreenWrapper } from '@/app/_appointments/fullscreen-wrapper'

export const metadata: Metadata = { title: APPOINTMENTS_PAGE.reception.title }

const BASE_PATH = '/reception/appointments'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

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

  const liveRows = data.day.rows.filter(
    (row) => !row.isSlotBlock && row.status !== 'CANCELLED' && row.status !== 'RESCHEDULED',
  )
  const doctorCount = new Set<string>([
    ...data.day.windows.map((w) => w.id),
    ...liveRows.map((row) => row.doctorId),
  ]).size
  const subtitle = `${weekdayName(jalaliWeekday(localDate))} ${formatDate(asLocalDate(localDate), 'long')} — ${formatNumber(liveRows.length)} ${APPOINTMENTS_PAGE.countAppointments} ${APPOINTMENTS_PAGE.countConnector} ${formatNumber(doctorCount)} ${APPOINTMENTS_PAGE.countDoctors}`
  const firstFree = firstFreeSlot(data.day.windows, data.day.rows)

  const doctorFilter = asString(params.doctor)
  const statusFilter = asString(params.status)

  const filteredRows = data.day.rows.filter(
    (row) =>
      (doctorFilter === '' || row.doctorId === doctorFilter) &&
      (statusFilter === '' || row.status === statusFilter),
  )

  const filteredDoctors = doctorFilter
    ? data.day.doctors.filter((doctor) => doctor.id === doctorFilter)
    : data.day.doctors

  const filteredWindows = doctorFilter
    ? data.day.windows.filter((window) => window.id === doctorFilter)
    : data.day.windows

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-3">
      {/* هدر صفحه (عنوان و دکمه‌ها) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-bold text-ink">{APPOINTMENTS_PAGE.reception.title}</h1>
          <p className="text-xs text-ink-2">{subtitle}</p>
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

      {/* کادر اصلی با قابلیت فول‌اسکرین */}
      <FullscreenWrapper>
        {/* هدر جدول: شامل تب‌ها، دکمه‌های تاریخ و فیلترها */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5 pl-12">
          <div className="flex flex-wrap items-center gap-3">
            <ViewTabs
              view={view}
              cartableCount={data.cartable.length}
              basePath={BASE_PATH}
              search={rest}
            />
            <div className="h-4 w-px bg-line-2" />
            <DayNav localDate={localDate} basePath={BASE_PATH} />
            <DayPicker localDate={localDate} basePath={BASE_PATH} />
            <FilterBar
              basePath={BASE_PATH}
              doctors={data.day.doctors}
              doctor={doctorFilter}
              status={statusFilter}
              day={typeof params.day === 'string' ? params.day : null}
            />
          </div>
        </div>

        {/* بدنه جدول */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {view === 'cartable' ? (
            <Cartable rows={data.cartable} />
          ) : view === 'week' ? (
            <WeekGrid
              days={data.week}
              services={data.day.services}
              customers={data.day.customers}
              panel="reception"
              writable
            />
          ) : (
            <DayGrid
              localDate={localDate}
              doctors={filteredDoctors}
              windows={filteredWindows}
              rows={filteredRows}
              services={data.day.services}
              customers={data.day.customers}
              servicesByDoctorId={data.day.servicesByDoctorId}
              workingDaysByDoctorId={data.day.workingDaysByDoctorId}
              panel="reception"
              writable
              fullHeight={true} // <-- بسیار مهم
            />
          )}
        </div>

        {/* فوتر (فقط برای حالت روز) */}
        {view === 'day' && (
          <div className="flex flex-wrap items-center gap-5 border-t border-line px-4 py-2 text-xs text-ink-3">
            <span className="flex items-center gap-1">
              <Icon name="treatment" size="compact" />
              {RECEPTION_APPOINTMENTS.legend.platform}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="phone" size="compact" />
              {RECEPTION_APPOINTMENTS.legend.secretary}
            </span>
          </div>
        )}
      </FullscreenWrapper>
    </div>
  )
}

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

function Cartable({ rows }: { readonly rows: AppointmentsPageData['cartable'] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-ink-3">{APPOINTMENTS_PAGE.empty.cartable}</p>
  }

  return (
    <ul className="flex flex-1 flex-col gap-3 overflow-auto p-4">
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
          <RowActions
            appointmentId={row.id}
            status={row.status}
            panel="reception"
            charged={row.priceAtBooking}
            alreadyPaid={row.paidTotal}
          />
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

function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function carriedSearch(params: Awaited<PageSearchParams>): string {
  const kept = Object.entries(params).filter(([key]) => key !== 'view' && key !== 'day')
  return kept.map(([key, value]) => `&${key}=${String(value)}`).join('')
}