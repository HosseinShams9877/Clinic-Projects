/**
 * The day grid — one column per doctor, one row per time.
 *
 * ## The per-doctor slot granularity
 *
 * The axis is the union of every doctor's own slot *starts*, at the doctor's own
 * `slotMinutes`. A doctor with 30-minute slots contributes 9:00, 9:30, 10:00 …; a
 * doctor with a 45-minute override contributes 10:00, 10:45 …; a doctor with a
 * 120-minute override contributes 11:00 only. The rows are the union, and a slot's
 * cell spans the rows between its start and the next start.
 *
 * A 120-minute slot in a 30-minute axis is four rows; a 45-minute slot is one and a
 * half rows and is drawn with a `rowSpan` of two — the slot's own end is what the
 * cell's height reflects, not a whole number of 30-minute rows. The cell's content
 * is the slot, and the axis is only the grid's own scaffold.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import {
  addLocalDays,
  asLocalTime,
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
import type { IconName } from '@/core/components/icons'
import type { BookingDialogProps } from './booking-dialog'
import { BookingDialog, type CustomerOption, type ServiceOption } from './booking-dialog'
import { BlockDialog } from './block-dialog'
import { RowActions, type RowEditContext } from './row-actions'

/** The grid's own props: the day's facts and what the page may do with them. */
export interface DayGridProps {
  readonly localDate: LocalDate
  readonly doctors: readonly DoctorColumn[]
  readonly windows?: readonly DoctorDayWindow[]
  readonly rows: readonly AppointmentRow[]
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  readonly panel: BookingDialogProps['panel']
  readonly writable: boolean
  readonly servicesByDoctorId?: Readonly<Record<string, readonly string[]>>
  readonly workingDaysByDoctorId?: Readonly<Record<string, readonly number[]>>
  readonly slotMinutesByDoctorId?: Readonly<Record<string, number | null>>
}

/** The default slot length, in minutes. */
const DEFAULT_SLOT_MINUTES = 30

/** The day grid, as the two breakpoints each render it. */
export function DayGrid(props: DayGridProps) {
  const windows = props.windows ?? []
  const columns: readonly DoctorColumn[] =
    windows.length > 0 ? windows.map((w) => ({ id: w.id, name: w.name })) : props.doctors

  if (columns.length === 0) {
    return <p className="text-sm text-ink-3">{APPOINTMENTS_PAGE.empty.day}</p>
  }

  const times = axisMinutes(windows, props.rows)
  const windowOf = new Map(windows.map((w) => [w.id, w]))

  /**
   * The row-span a cell at `minute` takes in a given doctor's column, or 0 when the
   * minute is inside a slot a previous row already covers.
   *
   * The doctor's own slot starts at each range's `startMinute` plus a multiple of
   * `slotMinutes`, and the slot is the number of axis rows between its start and the
   * next start (or the range's end).
   */
  function rowSpanAt(window: DoctorDayWindow | null, minute: number): number {
    const slot = window?.slotMinutes ?? DEFAULT_SLOT_MINUTES
    const ranges = window?.ranges ?? []
    const range = ranges.find((r) => minute >= r.startMinute && minute < r.endMinute)
    if (range === undefined) return 1
    const offset = minute - range.startMinute
    if (offset % slot !== 0) return 0
    // The slot's end: the smaller of its own length and the range's remaining time.
    const slotEnd = Math.min(minute + slot, range.endMinute)
    const rows = times.filter((m) => m >= minute && m < slotEnd).length
    return Math.max(1, rows)
  }

  return (
    <>
      <div className="hidden max-h-[70vh] overflow-auto panel:block">
        <table className="inline-size-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky inset-inline-start-0 top-0 z-20 border-b border-line bg-surface px-3 py-2 text-start text-xs font-semibold text-ink-3"
              >
                {APPOINTMENTS_PAGE.timeColumn}
              </th>
              {columns.map((doctor) => {
                const window = windowOf.get(doctor.id) ?? null
                return (
                  <th
                    key={doctor.id}
                    scope="col"
                    className="sticky top-0 z-10 min-w-[140px] border-b border-l border-line bg-surface px-3 py-2 text-start align-bottom"
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
            {times.map((minute) => {
              if (isBreakRow(columns, windowOf, props.rows, minute)) {
                return (
                  <tr key={minute} className="brk">
                    <td
                      colSpan={columns.length + 1}
                      className="border-b border-line bg-surface-sunken px-3 py-2 text-center text-xs text-ink-3"
                    >
                      {APPOINTMENTS_PAGE.controls.blockHours}
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={minute}>
                  <th
                    scope="row"
                    className="sticky inset-inline-start-0 z-10 border-b border-line bg-surface px-3 py-2 text-start font-semibold text-ink-2 tabular-nums"
                  >
                    {formatTime(minutesToTime(minute))}
                  </th>
                  {columns.map((doctor) => {
                    const window = windowOf.get(doctor.id) ?? null
                    const span = rowSpanAt(window, minute)
                    if (span === 0) return null
                    const row = rowAtMinute(props.rows, doctor.id, minute)
                    const offSchedule = window !== null && !inAnyRange(window, minute)
                    return (
                      <td
                        key={doctor.id}
                        rowSpan={span}
                        className="min-w-[140px] border-b border-l border-line p-2 align-top"
                      >
                        {row !== null ? (
                          <BookedCell
                            row={row}
                            writable={props.writable}
                            panel={props.panel}
                            services={props.services}
                            doctorOptions={columns}
                          />
                        ) : offSchedule ? (
                          <OffScheduleCell />
                        ) : (
                          <FreeCell
                            doctor={doctor}
                            localDate={props.localDate}
                            time={minutesToTime(minute)}
                            services={props.services}
                            customers={props.customers}
                            panel={props.panel}
                            writable={props.writable}
                            servicesByDoctorId={props.servicesByDoctorId}
                            workingDaysByDoctorId={props.workingDaysByDoctorId}
                            slotMinutesByDoctorId={props.slotMinutesByDoctorId}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
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
                <RowActions
                  appointmentId={row.id}
                  status={row.status}
                  panel={props.panel}
                  edit={editContext(row, props.services, columns)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

function BookedCell({
  row,
  writable,
  panel,
  services,
  doctorOptions,
}: {
  readonly row: AppointmentRow
  readonly writable: boolean
  readonly panel: BookingDialogProps['panel']
  readonly services: readonly ServiceOption[]
  readonly doctorOptions: readonly DoctorColumn[]
}) {
  return (
    <div
      className={cx(
        'flex h-full flex-col gap-2 rounded-sm p-2 [border-inline-start:3px_solid]',
        CELL_BG[row.status] ?? CELL_BG.default,
        BORDER_CLASSES[row.status] ?? BORDER_CLASSES.default,
      )}
    >
      <Cell row={row} writable={writable} panel={panel} services={services} doctorOptions={doctorOptions} />
    </div>
  )
}

const CELL_BG: Readonly<Record<string, string>> = {
  default: 'bg-brand-50',
  BOOKED: 'bg-brand-50',
  AWAITING_ARRIVAL: 'bg-brand-50',
  ARRIVED: 'bg-warn-bg',
  COMPLETED: 'bg-ok-bg',
  NO_SHOW: 'bg-neutral-bg',
  RESULT_NOT_RECORDED: 'bg-danger-bg',
}

function FreeCell({
  doctor,
  localDate,
  time,
  services,
  customers,
  panel,
  writable,
  servicesByDoctorId,
  workingDaysByDoctorId,
  slotMinutesByDoctorId,
}: {
  readonly doctor: DoctorColumn
  readonly localDate: LocalDate
  readonly time: string
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  readonly panel: BookingDialogProps['panel']
  readonly writable: boolean
  readonly servicesByDoctorId?: Readonly<Record<string, readonly string[]>>
  readonly workingDaysByDoctorId?: Readonly<Record<string, readonly number[]>>
  readonly slotMinutesByDoctorId?: Readonly<Record<string, number | null>>
}) {
  if (!writable) {
    return (
      <span className="grid h-full min-h-9 place-items-center rounded-sm [border:1px_dashed_var(--line-2)] text-ink-3">
        <Icon name="add" size="compact" />
      </span>
    )
  }
  return (
    <span className="block h-full [&_button]:h-full [&_button]:w-full [&_button]:justify-center [&_button]:[border-style:dashed]">
      <BookingDialog
        variant="book"
        panel={panel}
        triggerLabel="+"
        triggerVariant="outline"
        triggerIcon={null}
        doctorId={doctor.id}
        doctorName={doctor.name}
        localDate={localDate}
        defaultTime={time}
        services={services}
        customers={customers}
        allowedServiceIds={servicesByDoctorId?.[doctor.id]}
        workingWeekdays={workingDaysByDoctorId?.[doctor.id]}
        slotMinutes={slotMinutesByDoctorId?.[doctor.id] ?? null}
      />
      <span className="[&_button]:[border-style:solid]">
        <BlockDialog panel={panel} doctorId={doctor.id} localDate={localDate} time={time} />
      </span>
    </span>
  )
}

function OffScheduleCell() {
  return (
    <span
      className="grid h-full min-h-9 place-items-center rounded-sm text-xs text-ink-3 [background:repeating-linear-gradient(135deg,var(--neutral-bg),var(--neutral-bg)_6px,transparent_6px,transparent_12px)]"
    >
      {APPOINTMENTS_PAGE.offSchedule}
    </span>
  )
}

function Cell({
  row,
  writable,
  panel,
  services,
  doctorOptions,
}: {
  readonly row: AppointmentRow
  readonly writable: boolean
  readonly panel: BookingDialogProps['panel']
  readonly services: readonly ServiceOption[]
  readonly doctorOptions: readonly DoctorColumn[]
}) {
  const srcIcon = sourceIcon(row.source)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 font-semibold text-ink">
          {srcIcon === null ? null : <Icon name={srcIcon} size="compact" className="text-ink-3" />}
          {rowDescription(row)}
        </span>
        <StatusChip status={row.status} />
      </div>
      {row.serviceName === null ? null : (
        <span className="text-xs text-ink-3">{row.serviceName}</span>
      )}
      {row.isSlotBlock ? (
        <span className="text-xs text-ink-3">{APPOINTMENTS_PAGE.controls.blockHours}</span>
      ) : null}
      {writable ? (
        <RowActions
          appointmentId={row.id}
          status={row.status}
          panel={panel}
          edit={editContext(row, services, doctorOptions)}
        />
      ) : null}
    </div>
  )
}

function editContext(
  row: AppointmentRow,
  services: readonly ServiceOption[],
  doctorOptions: readonly DoctorColumn[],
): RowEditContext {
  return {
    doctorId: row.doctorId,
    serviceId: row.serviceId,
    localDate: row.localDate,
    localTime: row.localTime,
    isSlotBlock: row.isSlotBlock,
    services,
    doctorOptions,
  }
}

function sourceIcon(source: string | null): IconName | null {
  switch (source) {
    case 'WEBSITE':
    case 'INSTAGRAM':
    case 'CAMPAIGN':
      return 'treatment'
    case 'RECEPTION':
    case 'PHONE':
      return 'phone'
    default:
      return null
  }
}

function inAnyRange(window: DoctorDayWindow, minute: number): boolean {
  return window.ranges.some((r) => minute >= r.startMinute && minute < r.endMinute)
}

function isBreakRow(
  doctors: readonly DoctorColumn[],
  windowOf: ReadonlyMap<string, DoctorDayWindow>,
  rows: readonly AppointmentRow[],
  minute: number,
): boolean {
  if (doctors.length === 0) return false
  return doctors.every((doctor) => {
    if (rowAtMinute(rows, doctor.id, minute) !== null) return false
    const window = windowOf.get(doctor.id)
    return window !== undefined && !inAnyRange(window, minute)
  })
}

function rowDescription(row: AppointmentRow): string {
  if (row.isSlotBlock) return APPOINTMENTS_PAGE.controls.blockHours
  return row.customerName ?? APPOINTMENTS_PAGE.controls.blockHours
}

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

const BORDER_CLASSES: Readonly<Record<string, string>> = {
  default: '[border-inline-start-color:var(--line-2)]',
  BOOKED: '[border-inline-start-color:var(--info)]',
  AWAITING_ARRIVAL: '[border-inline-start-color:var(--warn)]',
  ARRIVED: '[border-inline-start-color:var(--info)]',
  COMPLETED: '[border-inline-start-color:var(--ok)]',
  NO_SHOW: '[border-inline-start-color:var(--line-2)]',
  CANCELLED: '[border-inline-start-color:var(--danger)]',
  RESCHEDULED: '[border-inline-start-color:var(--ink-3)]',
  RESULT_NOT_RECORDED: '[border-inline-start-color:var(--danger)]',
}

/**
 * The grid's time axis, in minutes — the union of every doctor's own slot starts.
 *
 * The starts are exactly the slots each doctor has, at their own `slotMinutes`: a
 * 30-minute doctor contributes 9:00, 9:30, 10:00 …; a 45-minute doctor contributes
 * 10:00, 10:45 …; a 120-minute doctor contributes 11:00 only. A row's own time is
 * added too, so an off-step booking still gets a row.
 */
function axisMinutes(
  windows: readonly DoctorDayWindow[],
  rows: readonly AppointmentRow[],
): readonly number[] {
  const set = new Set<number>()

  if (windows.length === 0) {
    for (const row of rows) set.add(timeToMinutes(asLocalTime(row.localTime)))
    return [...set].sort((a, b) => a - b)
  }

  for (const w of windows) {
    const slot = w.slotMinutes ?? DEFAULT_SLOT_MINUTES
    for (const r of w.ranges) {
      for (let m = r.startMinute; m < r.endMinute; m += slot) set.add(m)
    }
  }
  for (const row of rows) set.add(timeToMinutes(asLocalTime(row.localTime)))
  return [...set].sort((a, b) => a - b)
}

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

export function DayNav({ localDate, basePath }: { readonly localDate: LocalDate; readonly basePath: string }) {
  const previous = shiftDay(localDate, -1)
  const next = shiftDay(localDate, 1)
  const chip =
    'rounded-xs border border-line-2 bg-surface px-3 py-[6px] text-xs text-ink-2 no-underline hover:bg-surface-2'

  return (
    <nav className="flex items-center gap-2" aria-label={APPOINTMENTS_PAGE.timeColumn}>
      <Link href={`${basePath}?day=${previous}`} className={chip}>
        {APPOINTMENTS_PAGE.controls.previousDay}
      </Link>
      <Link href={`${basePath}?day=${next}`} className={chip}>
        {APPOINTMENTS_PAGE.controls.nextDay}
      </Link>
      <Link href={basePath} className={chip}>
        {APPOINTMENTS_PAGE.controls.today}
      </Link>
    </nav>
  )
}

function shiftDay(localDate: LocalDate, days: number): LocalDate {
  return addLocalDays(localDate, days)
}

function timeAsLocal(value: string): ReturnType<typeof asLocalTime> {
  return asLocalTime(value)
}