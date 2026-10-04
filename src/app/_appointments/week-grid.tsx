/**
 * The week view — seven Jalali days, each a card of its own rows.
 *
 * `02-architecture.md` §9's `reception/appointments.html` carries the day and the week
 * side by side, and the week is not a wider grid: a seven-column grid at a desk's
 * width is seven columns too narrow to hold a name, and a horizontally scrolled week
 * loses the one thing a week is read for, which is the day a slot is on. The seven are
 * therefore cards in a wrap, each carrying the day's own rows the way the day grid's
 * stacked list does — the same rows, the same `RowActions`, one day per card.
 *
 * ## Why each card carries its own doctors
 *
 * A weekday's columns are the doctors who work *that* weekday, and the anchor's
 * doctors are the anchor's. The week's seven are read with a `doctorsOnDay` each
 * (`page-data.ts`), so a card's header names the doctors who work it and a card whose
 * weekday nobody works says so rather than rendering seven empty columns.
 *
 * ## Why the empty day is not rendered smaller
 *
 * A day with no rows is still a day of the week, and rendering it at the same size as
 * its neighbours is what keeps the seven readable as a week. The empty state is the
 * sentence the day grid uses, so the two views agree about what an empty day looks
 * like.
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
  /** The week's seven days, from `weekDays`, each with its own doctors and rows. */
  readonly days: readonly WeekDayData[]
  /** The services the booking popup offers. */
  readonly services: BookingDialogProps['services']
  /** The customers the booking popup searches. */
  readonly customers: BookingDialogProps['customers']
  /** Which panel is rendering. */
  readonly panel: BookingDialogProps['panel']
  /** Whether the caller may write. */
  readonly writable: boolean
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
}: {
  readonly day: WeekDayData
  readonly services: WeekGridProps['services']
  readonly customers: WeekGridProps['customers']
  readonly panel: WeekGridProps['panel']
  readonly writable: boolean
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
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The row's one-line description for the week, which is the person's name and the
 * service rather than the block marker the day grid's cells carry.
 *
 * A week card is dense, and the block's own marker is already the day grid's way of
 * saying the hour is closed; the week says the same thing by naming nothing.
 */
function weekRowDescription(row: WeekDayData['rows'][number]): string {
  if (row.customerName !== null) return row.customerName
  return row.serviceName ?? APPOINTMENTS_PAGE.controls.blockHours
}
