/**
 * The day grid — one column per doctor, one row per time, as
 * `02-architecture.md` §9's `reception/appointments.html` renders it.
 *
 * The columns are the doctors who work the weekday (`doctorsOnDay`), and the rows are
 * the times the day's appointments actually hold. A full slot axis — every slot the
 * engine would offer, empty or not — is the public booking surface's grid, and it
 * needs a `SlotDay` per doctor per service; this grid is the desk's view of the rows
 * that exist, and its empty cells are where the popup is opened from.
 *
 * ## Why there are two render paths and not one scrolled table
 *
 * A table with `overflow-x-auto` keeps its header and never overflows, but a desk's
 * four-doctor day at 320px wide is four columns a receptionist has to scroll through
 * blind — the row's time is the first column and the person's name is three swipes
 * away. Below the one breakpoint (`08-ui-design-system.md` §43's 1000px) the same
 * rows are a stacked list, one card per appointment, and above it they are the table.
 * The two read one source, so a row that is in one is in the other.
 *
 * ## Why the block rows are cells and not absences
 *
 * A slot block («بستن یک ساعت») is a row the calendar holds: it has a time and a
 * duration, and it is what keeps the slot from being booked. Rendering it as a cell
 * is what shows the desk *why* a time is not free, and rendering it as nothing would
 * make the same slot look like a time the doctor does not work.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import {
  addLocalDays,
  asLocalDate,
  asLocalTime,
  formatDate,
  formatTime,
  minutesToTime,
  timeToMinutes,
  type LocalDate,
} from '@/core/localization'
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentRow,
  type DoctorColumn,
  type DoctorDayWindow,
} from '@/modules/appointments'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import { Icon } from '@/core/components/icons'
import type { BookingDialogProps } from './booking-dialog'
import { BookingDialog, type CustomerOption, type ServiceOption } from './booking-dialog'
import { RowActions } from './row-actions'

/** The grid's own props: the day's facts and what the page may do with them. */
export interface DayGridProps {
  /** The day the grid is showing, as a Jalali date. */
  readonly localDate: LocalDate
  /** The columns: the doctors who work this weekday. */
  readonly doctors: readonly DoctorColumn[]
  /** Each column's working window, for the off-schedule vs free-slot axis. Optional: a
   * surface that does not load windows (the doctor's own single-column day) omits it,
   * and a column with no window is schedule-unknown — a bookable «+» rather than a
   * struck off-schedule cell, which is never shown without a window to judge it. */
  readonly windows?: readonly DoctorDayWindow[]
  /** The day's rows, from the module's own query. */
  readonly rows: readonly AppointmentRow[]
  /** The services the booking popup offers. */
  readonly services: readonly ServiceOption[]
  /** The customers the booking popup searches. */
  readonly customers: readonly CustomerOption[]
  /** Which panel is rendering — the action's own resolution. */
  readonly panel: BookingDialogProps['panel']
  /** Whether the caller may write. Admin's grid is read-only. */
  readonly writable: boolean
}

/** The grid's hour step, in minutes — the resolution the empty axis is drawn at. */
const AXIS_STEP = 30

/** The day grid, as the two breakpoints each render it. */
export function DayGrid(props: DayGridProps) {
  if (props.doctors.length === 0) {
    return <p className="text-sm text-ink-3">{APPOINTMENTS_PAGE.empty.day}</p>
  }

  const windows = props.windows ?? []
  const times = axisMinutes(windows, props.rows)
  const windowOf = new Map(windows.map((w) => [w.id, w]))

  return (
    <>
      <div className="hidden overflow-x-auto panel:block">
        <table className="inline-size-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-line bg-surface px-3 py-2 text-start text-xs font-semibold text-ink-3"
              >
                {APPOINTMENTS_PAGE.timeColumn}
              </th>
              {props.doctors.map((doctor) => {
                const window = windowOf.get(doctor.id) ?? null
                return (
                  <th
                    key={doctor.id}
                    scope="col"
                    className="border-b border-l border-line bg-surface px-3 py-2 text-start align-bottom"
                  >
                    <span className="block font-semibold text-ink">{doctor.name}</span>
                    {window === null ? null : (
                      <span className="mt-1 block text-xs text-ink-3 tabular-nums">
                        {formatTime(minutesToTime(window.startMinute))}
                        {` ${APPOINTMENTS_PAGE.windowTo} `}
                        {formatTime(minutesToTime(window.endMinute))}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {times.map((minute) => (
              <tr key={minute}>
                <th
                  scope="row"
                  className="border-b border-line px-3 py-2 text-start font-semibold text-ink-2 tabular-nums"
                >
                  {formatTime(minutesToTime(minute))}
                </th>
                {props.doctors.map((doctor) => {
                  const row = rowAtMinute(props.rows, doctor.id, minute)
                  const window = windowOf.get(doctor.id) ?? null
                  const offSchedule =
                    window !== null && (minute < window.startMinute || minute >= window.endMinute)
                  return (
                    <td key={doctor.id} className="border-b border-l border-line p-2 align-top">
                      {row !== null ? (
                        <BookedCell row={row} writable={props.writable} panel={props.panel} />
                      ) : offSchedule ? (
                        <OffScheduleCell />
                      ) : (
                        <FreeCell
                          doctor={doctor}
                          localDate={props.localDate}
                          services={props.services}
                          customers={props.customers}
                          panel={props.panel}
                          writable={props.writable}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 panel:hidden">
        {props.rows.map((row) => (
          <li key={row.id} className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-ink tabular-nums">{formatTime(timeAsLocal(row.localTime))}</span>
              <StatusChip status={row.status} />
            </div>
            <p className="mt-1 text-ink-2">{rowDescription(row)}</p>
            <p className="mt-1 text-xs text-ink-3">{row.doctorName}</p>
            {props.writable ? (
              <div className="mt-3">
                <RowActions appointmentId={row.id} status={row.status} panel={props.panel} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * A booked cell — the row's own facts on a soft brand surface with a status-coloured
 * inline-start border, as the demo renders a taken slot.
 */
function BookedCell({
  row,
  writable,
  panel,
}: {
  readonly row: AppointmentRow
  readonly writable: boolean
  readonly panel: BookingDialogProps['panel']
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-2 rounded-sm bg-brand-50 p-2 [border-inline-start:3px_solid]',
        BORDER_CLASSES[row.status] ?? BORDER_CLASSES.default,
      )}
    >
      <Cell row={row} writable={writable} panel={panel} />
    </div>
  )
}

/**
 * An empty but bookable cell — the dashed «+» the desk opens the booking popup from.
 *
 * The popup is the module's own three-step dialog, pre-filled with the column's doctor
 * and the grid's day; a read-only grid (admin's oversight) renders the same dashed cell
 * without the trigger, because there is nothing it could book.
 */
function FreeCell({
  doctor,
  localDate,
  services,
  customers,
  panel,
  writable,
}: {
  readonly doctor: DoctorColumn
  readonly localDate: LocalDate
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  readonly panel: BookingDialogProps['panel']
  readonly writable: boolean
}) {
  if (!writable) {
    return (
      <span className="grid min-h-9 place-items-center rounded-sm [border:1px_dashed_var(--line-2)] text-ink-3">
        <Icon name="add" size="compact" />
      </span>
    )
  }
  return (
    <span className="block [&_button]:w-full [&_button]:justify-center [&_button]:[border-style:dashed]">
      <BookingDialog
        variant="book"
        panel={panel}
        triggerLabel="+"
        doctorId={doctor.id}
        doctorName={doctor.name}
        localDate={localDate}
        services={services}
        customers={customers}
      />
    </span>
  )
}

/** A cell at a time the doctor is off the schedule — the struck «خارج از برنامه» tile. */
function OffScheduleCell() {
  return (
    <span
      className="grid min-h-9 place-items-center rounded-sm text-xs text-ink-3 [background:repeating-linear-gradient(135deg,var(--neutral-bg),var(--neutral-bg)_6px,transparent_6px,transparent_12px)]"
    >
      {APPOINTMENTS_PAGE.offSchedule}
    </span>
  )
}

/** One cell of the table, as the row's own facts. */
function Cell({
  row,
  writable,
  panel,
}: {
  readonly row: AppointmentRow
  readonly writable: boolean
  readonly panel: BookingDialogProps['panel']
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{rowDescription(row)}</span>
        <StatusChip status={row.status} />
      </div>
      {row.serviceName === null ? null : (
        <span className="text-xs text-ink-3">{row.serviceName}</span>
      )}
      {row.isSlotBlock ? (
        <span className="text-xs text-ink-3">{APPOINTMENTS_PAGE.controls.blockHours}</span>
      ) : null}
      {writable ? <RowActions appointmentId={row.id} status={row.status} panel={panel} /> : null}
    </div>
  )
}

/**
 * The row's own description: the customer's name, or the block's marker.
 *
 * A slot block has no customer by construction — it is the calendar holding a time —
 * and a block rendered as «—» would look like a booking whose person was lost.
 */
function rowDescription(row: AppointmentRow): string {
  if (row.isSlotBlock) return APPOINTMENTS_PAGE.controls.blockHours
  return row.customerName ?? APPOINTMENTS_PAGE.controls.blockHours
}

/**
 * The status chip, in the status colour the token block defines for it.
 *
 * The colour is a cue and never the only signal: the label is beside it, which is
 * what keeps a status readable by a person who does not see the cue and by the axe
 * rule that makes colour alone a violation.
 */
function StatusChip({ status }: { readonly status: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-pill px-2 py-[2px] text-xs font-semibold',
        CHIP_CLASSES[status] ?? CHIP_CLASSES.default,
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? status}
    </span>
  )
}

/**
 * The chip's colour per status, from the status-colour tokens.
 *
 * Written as a record rather than a `switch` because the statuses are a closed set
 * the module's catalog labels, and a `default` arm is what a status outside the
 * label set falls into rather than an error the grid raises on a row it already
 * holds.
 */
const CHIP_CLASSES: Readonly<Record<string, string>> = {
  default: 'bg-neutral-bg text-ink-2',
  BOOKED: 'bg-info-bg text-info',
  AWAITING_ARRIVAL: 'bg-warn-bg text-warn',
  ARRIVED: 'bg-info-bg text-info',
  COMPLETED: 'bg-ok-bg text-ok',
  NO_SHOW: 'bg-neutral-bg text-ink-3',
  CANCELLED: 'bg-danger-bg text-danger',
  RESCHEDULED: 'bg-neutral-bg text-ink-3',
  RESULT_NOT_RECORDED: 'bg-danger-bg text-danger',
}

/**
 * The inline-start border colour of a booked cell, per status.
 *
 * The same closed status set as `CHIP_CLASSES`, in the border token rather than the
 * chip's background, so the cell's edge carries the status at a glance while the chip
 * carries the label the colour never stands in for.
 */
const BORDER_CLASSES: Readonly<Record<string, string>> = {
  default: '[border-inline-start-color:var(--line-2)]',
  BOOKED: '[border-inline-start-color:var(--info)]',
  AWAITING_ARRIVAL: '[border-inline-start-color:var(--warn)]',
  ARRIVED: '[border-inline-start-color:var(--info)]',
  COMPLETED: '[border-inline-start-color:var(--ok)]',
  NO_SHOW: '[border-inline-start-color:var(--ink-3)]',
  CANCELLED: '[border-inline-start-color:var(--danger)]',
  RESCHEDULED: '[border-inline-start-color:var(--ink-3)]',
  RESULT_NOT_RECORDED: '[border-inline-start-color:var(--danger)]',
}

/**
 * The grid's time axis, in minutes: the stepped slots inside every doctor's window,
 * plus the exact times the day's rows hold.
 *
 * A booked row at an off-step time (a ۹:۱۵ reschedule) still needs a row of its own, so
 * the axis is the union of the regular grid and the rows' own times rather than a plain
 * stepped range — a time a row sits on is a time the grid must show.
 */
function axisMinutes(
  windows: readonly DoctorDayWindow[],
  rows: readonly AppointmentRow[],
): readonly number[] {
  const set = new Set<number>()
  for (const w of windows) {
    for (let m = w.startMinute; m < w.endMinute; m += AXIS_STEP) set.add(m)
  }
  for (const row of rows) set.add(timeToMinutes(asLocalTime(row.localTime)))
  return [...set].sort((a, b) => a - b)
}

/** The row at one doctor's column and one axis minute, or `null` when the cell is empty. */
function rowAtMinute(
  rows: readonly AppointmentRow[],
  doctorId: string,
  minute: number,
): AppointmentRow | null {
  return (
    rows.find(
      (row) => row.doctorId === doctorId && timeToMinutes(asLocalTime(row.localTime)) === minute,
    ) ?? null
  )
}

/**
 * The day navigation — yesterday and tomorrow around the day's own date.
 *
 * Links and not buttons because the day is a URL, and a URL is what a browser's back
 * button and a shared desk shift both speak. The grid re-reads the day on the
 * navigation, which is the same query the page ran.
 */
export function DayNav({ localDate, basePath }: { readonly localDate: LocalDate; readonly basePath: string }) {
  const previous = shiftDay(localDate, -1)
  const next = shiftDay(localDate, 1)

  return (
    <nav className="flex items-center gap-2" aria-label={APPOINTMENTS_PAGE.timeColumn}>
      <Link
        href={`${basePath}?day=${previous}`}
        className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-surface-2"
      >
        {APPOINTMENTS_PAGE.controls.previousDay}
      </Link>
      <span className="font-semibold text-ink tabular-nums">{formatDate(asLocalDate(localDate), 'long')}</span>
      <Link
        href={`${basePath}?day=${next}`}
        className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-surface-2"
      >
        {APPOINTMENTS_PAGE.controls.nextDay}
      </Link>
      <Link
        href={basePath}
        className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-surface-2"
      >
        {APPOINTMENTS_PAGE.controls.today}
      </Link>
    </nav>
  )
}


/**
 * One Jalali day shifted, as the stored `YYYY-MM-DD` string.
 *
 * Through `addLocalDays` and never through a `Date`, because the stored string is a
 * Jalali date and a `Date` constructor reads it as Gregorian — a day added that way
 * is a day added to the wrong calendar, and the grid would drift by the offset
 * between the two.
 */
function shiftDay(localDate: LocalDate, days: number): LocalDate {
  return addLocalDays(localDate, days)
}

/** A stored `HH:mm` as the branded `LocalTime` the formatters take. */
function timeAsLocal(value: string): ReturnType<typeof asLocalTime> {
  return asLocalTime(value)
}
