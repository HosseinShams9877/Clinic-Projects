/**
 * The manager's appointments oversight page — `02-architecture.md` §9's
 * `admin/appointments.html`.
 *
 * The manager sees the same clinic the desk sees, and — because the manager holds
 * `manage_appointments` (`04-roles-permissions.md` §2.1) — may book, edit, cancel and
 * block from it too. `writable` is `true`: the grid's empty cells open the booking
 * popup for any doctor's column, and a booked cell carries the row actions. The manager
 * booking for any doctor is the one thing the desk's own grid (one clinic, every
 * doctor) and the manager's oversight share, so they share the one grid.
 *
 * ## Why the filters are the page's and not the module's
 *
 * The two filters — doctor and status — are the oversight surface's own question, and
 * no other page asks it: the desk's grid is one day wide, and the doctor's home is one
 * doctor. Filtering here is composition the app tier does on the rows the module
 * already read, which is what keeps the module's three grid queries the three the pages
 * render and not a fourth per filter combination.
 *
 * ## Why the day picker is beside the day navigation
 *
 * The desk's page has carried a `DayPicker` since the beginning — a calendar the desk
 * opens to jump any day without stepping the arrows one day at a time. The manager
 * needs the same affordance: the oversight grid is the surface the manager reads a
 * week from, and stepping it one day per click is the wrong tool for that read. The
 * picker writes the same `?day=` param the navigation does, so the two are one
 * control with two ways in and not a second day state.
 *
 * ## Why the page does not run the sweep
 *
 * The sweep's alarm surfaces **only** in the reception cartable
 * (`03-data-model.md` §2.2), and this page does not render the cartable. Running the
 * sweep here would raise alarms a manager never sees, which is a write with no reader;
 * the desk runs it, and the worker runs it.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  isValidLocalDate,
  todayLocalDate,
  type LocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import { BookingDialog } from '@/app/_appointments/booking-dialog'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import { DayPicker } from '@/app/_appointments/day-picker'
import { FilterBar } from '@/app/_appointments/filter-bar'
import { loadDayGrid, type DayRows } from '@/app/_appointments/page-data'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: APPOINTMENTS_PAGE.admin.title }

/** The page's own route, as the day navigation and the filters link to. */
const BASE_PATH = '/admin/appointments'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The clinic's day, read-only, with the two filters the oversight page carries.
 */
export default async function AdminAppointmentsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const localDate = dateFromParam(params.day)

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadDayGrid({
      tx,
      ctx: session.permissions,
      clinicId: session.permissions.clinicId,
      localDate,
    }),
  )

  const rows = applyFilters(data.rows, params)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{APPOINTMENTS_PAGE.admin.title}</h1>
          <p className="text-sm text-ink-2">{APPOINTMENTS_PAGE.admin.lead}</p>
        </div>
        <BookingDialog
          variant="book"
          panel="admin"
          triggerLabel={APPOINTMENTS_PAGE.registerAppointment}
          triggerVariant="primary"
          triggerSize="default"
          triggerIcon="add"
          localDate={localDate}
          services={data.services}
          customers={data.customers}
          doctorsByServiceId={data.doctorsByServiceId}
          freeSlotsByDoctorId={data.freeSlotsByDoctorId}
        />
      </div>

      <FilterBar
        basePath={BASE_PATH}
        doctors={data.doctors}
        doctor={asString(params.doctor)}
        status={asString(params.status)}
        day={typeof params.day === 'string' ? params.day : null}
      />

      <section className="flex flex-col rounded-md border border-line bg-surface">
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
            doctors={data.doctors}
            windows={data.windows}
            rows={rows}
            services={data.services}
            customers={data.customers}
            servicesByDoctorId={data.servicesByDoctorId}
            workingDaysByDoctorId={data.workingDaysByDoctorId}
            panel="admin"
            writable={true}
          />
        </div>
      </section>
    </div>
  )
}

/**
 * The rows the URL's two filters leave, in one place.
 */
function applyFilters(rows: DayRows, params: Awaited<PageSearchParams>): DayRows {
  const doctor = asString(params.doctor)
  const status = asString(params.status)
  if (doctor === '' && status === '') return rows

  return rows.filter(
    (row) => (doctor === '' || row.doctorId === doctor) && (status === '' || row.status === status),
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The day the URL names, or today.
 */
function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}