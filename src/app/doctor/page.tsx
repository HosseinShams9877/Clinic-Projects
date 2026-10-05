/**
 * The doctor panel's home — `02-architecture.md` §7's «برنامه من」 and §9's
 * `doctor/dashboard.html`.
 *
 * The doctor's home is their own day: the rows the desk's grid holds for one column,
 * read through the same module query, with the one difference that the column is the
 * caller's own. `view_own_schedule` is the permission that makes a doctor see their own
 * schedule and nobody else's, and it is answered by `doctorDay`'s `doctorId` being the
 * membership's own user id — never a param, never a request body.
 *
 * ## Why the quick-book shortcut is a setting and not a permission
 *
 * `04-roles-permissions.md` §4 is explicit that a toggle "says how much authority they
 * have *inside* the page", and not whether they may be on it — so the shortcut's gate is
 * `DOCTOR_SELF_BOOKING` from the tenant's settings row and not a permission the doctor
 * holds. The toggle is read here and handed to the popup as a render decision; the
 * refusal that matters is the module's own, inside `bookOwnAppointment`, and it is
 * raised server-side whether or not the shortcut was ever rendered (DoD 9).
 *
 * ## Why the grid is writable and the oversight page is not
 *
 * A doctor books their own empty slots and records their own outcomes, which is the
 * `manage_appointments` the desk holds; the difference from the desk's page is which
 * doctor the rows are for. The manager's oversight page is the read-only one, and it is
 * a separate page for the reason its own header states.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, isValidLocalDate, todayLocalDate, type LocalDate } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { doctorDay, readBookingSettings } from '@/modules/appointments'

import { APPOINTMENTS_PAGE, PANEL_HOMES } from '@/app/catalog'
import { BookingDialog } from '@/app/_appointments/booking-dialog'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import { loadPopupOptions } from '@/app/_appointments/options'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: PANEL_HOMES.doctor }

/** The panel's own route, as the day navigation links to. */
const BASE_PATH = '/doctor'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The doctor's own day, with the quick-book shortcut its settings gate admits.
 */
export default async function DoctorHomePage({ searchParams }: { readonly searchParams: PageSearchParams }) {
  const session = await requireStaffPanel('doctor')
  const params = await searchParams
  const localDate = dateFromParam(params.day)

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [rows, options, settings] = await Promise.all([
      doctorDay({
        tx,
        tenantId: session.tenantId,
        doctorId: session.permissions.userId,
        localDate,
      }),
      loadPopupOptions({ tx, ctx: session.permissions }),
      readBookingSettings(tx, session.tenantId),
    ])
    return { rows, options, settings }
  })

  const doctorName = doctorDisplayName(data.rows)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{PANEL_HOMES.doctor}</h1>
        <p className="text-sm text-ink-2">{APPOINTMENTS_PAGE.doctor.lead}</p>
        {data.settings.doctorSelfBooking && data.options.services.length > 0 ? (
          <div>
            <BookingDialog
              variant="quickBook"
              panel="doctor"
              triggerLabel={APPOINTMENTS_PAGE.controls.newAppointment}
              doctorId={session.permissions.userId}
              doctorName={doctorName}
              localDate={localDate}
              services={data.options.services}
              customers={data.options.customers}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <DayNav localDate={localDate} basePath={BASE_PATH} />
        <DayGrid
          localDate={localDate}
          doctors={[{ id: session.permissions.userId, name: doctorName }]}
          rows={data.rows}
          services={data.options.services}
          customers={data.options.customers}
          panel="doctor"
          writable
        />
      </div>
    </div>
  )
}

/**
 * The doctor's own name, as the day's rows carry it.
 *
 * A doctor with no rows on the day has no row to take a name from, and the grid's column
 * header still needs one; the settings row is the tenant's and the membership's own name
 * is the `users` module's, which is not built. The name is therefore the rows' own when
 * the day holds any and the panel's lead otherwise — the column is the caller's own
 * either way, and a day with no rows is a day the header still names.
 */
function doctorDisplayName(rows: ReadonlyArray<{ readonly doctorName: string }>): string {
  return rows[0]?.doctorName ?? PANEL_HOMES.doctor
}

/**
 * The day the URL names, or today.
 *
 * The same parsing the two other scheduling pages use, because the three share the day
 * param and a bookmark from one opens another at the same day.
 */
function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}
