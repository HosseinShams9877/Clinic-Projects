/**
 * The manager's appointments oversight page — `02-architecture.md` §9's
 * `admin/appointments.html`.
 *
 * The manager sees the same clinic the desk sees, read-only. `04-roles-permissions.md`
 * §2.1 gives the manager all sixteen permissions, which includes
 * `manage_appointments` — but the oversight surface's own contract
 * (`02-architecture.md` §9) is that it is the *view* of the clinic's schedule, and the
 * writes happen at the desk. `writable: false` is that contract: the grid renders no
 * «نوبت جدید» and no row actions, and a page whose every affordance would have been a
 * refusal renders none of them.
 *
 * ## Why the filters are the page's and not the module's
 *
 * The two filters — doctor and status — are the oversight surface's own question, and
 * no other page asks it: the desk's grid is one day wide, and the doctor's home is one
 * doctor. Filtering here is composition the app tier does on the rows the module
 * already read, which is what keeps the module's three grid queries the three the pages
 * render and not a fourth per filter combination.
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
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
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
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{APPOINTMENTS_PAGE.admin.title}</h1>
        <p className="text-sm text-ink-2">{APPOINTMENTS_PAGE.admin.lead}</p>
      </div>

      <FilterBar
        basePath={BASE_PATH}
        doctors={data.doctors}
        doctor={asString(params.doctor)}
        status={asString(params.status)}
        day={typeof params.day === 'string' ? params.day : null}
      />

      <div className="flex flex-col gap-4">
        <DayNav localDate={localDate} basePath={BASE_PATH} />
        <DayGrid
          localDate={localDate}
          doctors={data.doctors}
          rows={rows}
          services={data.services}
          customers={data.customers}
          panel="admin"
          writable={false}
        />
      </div>
    </div>
  )
}

/**
 * The rows the URL's two filters leave, in one place.
 *
 * The two are independent and both are a row's own column, so a single pass keeps the
 * pair from being applied in two places that could disagree about which one holds. A
 * URL with no filter values returns the rows the query read, which is every row the day
 * holds.
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
 *
 * The same parsing the desk's page uses, because the two pages share the day param and
 * a bookmark from one opens the other at the same day.
 */
function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}
