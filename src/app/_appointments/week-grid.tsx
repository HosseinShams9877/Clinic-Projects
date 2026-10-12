/**
 * The week view — seven Jalali days, each a card of its own rows.
 */

import {
  asLocalDate,
  asLocalTime,
  formatDate,
  formatTime,
  weekdayName,
  jalaliWeekday,
  toPersianDigits,
  jalaliParts,
  type LocalDate,
} from '@/core/localization'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import type { BookingDialogProps } from './booking-dialog'
import { BookingDialog } from './booking-dialog'
import type { WeekDayData } from './page-data'
import { RowActions } from './row-actions'

/** The week grid's own props: the seven days and what the page may do with them. */
export interface WeekGridProps {
  readonly days: readonly WeekDayData[]
  readonly services: BookingDialogProps['services']
  readonly customers: BookingDialogProps['customers']
  readonly panel: BookingDialogProps['panel']
  readonly writable: boolean
  /** The slot step for each doctor on the day, keyed by doctor id. */
  readonly slotMinutesByDoctorId?: Readonly<Record<string, number | null>>
}

/** The week, as seven cards. */
export function WeekGrid(props: WeekGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 panel:grid-cols-2">
      {props.days.map((day) => (
        <WeekCard
          key={day.localDate}
          day={day}
          services={props.services}
          customers={props.customers}
          panel={props.panel}
          writable={props.writable}
          slotMinutesByDoctorId={props.slotMinutesByDoctorId}
        />
      ))}
    </div>
  )
}

/** One day of the week, as a card of its rows. */
function WeekCard({
  day,
  services,
  customers,
  panel,
  writable,
  slotMinutesByDoctorId,
}: {
  readonly day: WeekDayData
  readonly services: WeekGridProps['services']
  readonly customers: WeekGridProps['customers']
  readonly panel: WeekGridProps['panel']
  readonly writable: boolean
  readonly slotMinutesByDoctorId?: Readonly<Record<string, number | null>>
}) {
  return (
    <section className="flex flex-col rounded-md border border-line bg-surface p-4">
      <header className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h3 className="font-bold text-ink">
          {weekdayName(jalaliWeekday(asLocalDate(day.localDate)))}{' '}
          {toPersianDigits(jalaliParts(asLocalDate(day.localDate)).day)}
        </h3>
        <span className="text-xs text-ink-3">{formatDate(asLocalDate(day.localDate), 'short')}</span>
      </header>

      {day.doctors.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{APPOINTMENTS_PAGE.noDoctors}</p>
      ) : day.rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{APPOINTMENTS_PAGE.empty.day}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {day.rows.map((row) => (
            <li key={row.id} className="rounded-sm border border-line-2 bg-bg p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink tabular-nums">
                  {formatTime(asLocalTime(row.localTime))}
                </span>
                <span className="text-xs text-ink-2">{row.doctorName}</span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{weekRowDescription(row)}</p>
              {writable ? (
                <div className="mt-2">
                  <RowActions appointmentId={row.id} status={row.status} panel={panel} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {writable && day.doctors.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {day.doctors.map((doctor) => (
            <BookingDialog
              key={doctor.id}
              variant="book"
              panel={panel}
              triggerLabel={APPOINTMENTS_PAGE.controls.newAppointment}
              doctorId={doctor.id}
              doctorName={doctor.name}
              localDate={day.localDate as LocalDate}
              services={services}
              customers={customers}
              slotMinutes={slotMinutesByDoctorId?.[doctor.id] ?? null}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function weekRowDescription(row: WeekDayData['rows'][number]): string {
  if (row.customerName !== null) return row.customerName
  return row.serviceName ?? APPOINTMENTS_PAGE.controls.blockHours
}