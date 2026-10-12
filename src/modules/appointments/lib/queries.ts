/**
 * The reads the three scheduling pages render.
 *
 * `03-data-model.md` §2.2 names the queries the schema's indexes exist to serve, and
 * this file is where each one lives:
 *
 * | Query | Page | Index |
 * |---|---|---|
 * | `doctorDay` | «برنامه من» — the doctor's own day | `appt_tenant_doctor_date_idx` |
 * | `clinicDay` | the reception desk and the manager's oversight | `appt_tenant_clinic_date_idx` |
 * | `unrecordedCartable` | the «نتیجه ثبت نشده» cartable, reception only | `appt_tenant_status_sched_idx` |
 *
 * ## The one rule the pages differ on
 *
 * `RESULT_NOT_RECORDED` surfaces **only** in the reception cartable — never on the
 * manager or doctor dashboard, per the workflow rule the specification states beside
 * §2.2's table. The three functions are shaped by it: `doctorDay` and `clinicDay`
 * exclude the alarm state by construction, and `unrecordedCartable` is the only
 * function in the module that selects it. A page that renders the alarm is a page
 * that imports the cartable, and the import is what keeps the rule.
 *
 * ## Every row is shaped for the grid
 *
 * A day grid is one column per doctor and one row per time, so the queries return
 * rows already carrying the Jalali date and time the grid compares. Nothing here
 * formats a value for the screen: the pages call `formatTime`, `formatDate` and
 * `formatMoney`, because a formatter in a query would be a second formatter a report
 * could not reuse, and a number rendered as Persian digits in the database layer is a
 * number the arithmetic can no longer read.
 *
 * ## The shift-range override
 *
 * `DoctorShiftRange` is the per-doctor, per-weekday override of `DoctorWorkingHours`.
 * When a doctor has rows in it for a weekday, `doctorsOnDay` and `doctorWindowsOnDay`
 * read *those* and not the default row: the doctor is a column, and the column's
 * working ranges are the override's ranges. A weekday with no override rows is the
 * default behaviour, exactly as before.
 */

import type { Prisma } from '@/generated/prisma/client'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { jalaliWeek, type LocalDate } from '@/core/localization'

import { AppointmentStatus } from '@/core/constants'
import { CARTABLE_STATUSES } from './status'
import { workingRange } from './slots'

/**
 * The cartable's filter, as Prisma's `in:` clause needs it: a mutable `string[]` of
 * the same values `CARTABLE_STATUSES` holds. The readonly constant is the module's
 * own source of truth; this array is the query's shape.
 */
const CARTABLE_STATUS_FILTER: string[] = [...CARTABLE_STATUSES]

/** The relations a grid cell renders, selected once so every query reads the same. */
const APPOINTMENT_INCLUDE = {
  customer: { select: { id: true, firstName: true, lastName: true, mobile: true } },
  service: { select: { id: true, name: true } },
  doctor: { select: { id: true, firstName: true, lastName: true } },
} as const satisfies Prisma.AppointmentInclude

/**
 * The row the queries produce, stated structurally rather than as a Prisma payload.
 */
interface AppointmentWithRelations {
  readonly id: string
  readonly doctorId: string
  readonly doctor: { readonly id: string; readonly firstName: string; readonly lastName: string }
  readonly customer: {
    readonly id: string
    readonly firstName: string
    readonly lastName: string | null
    readonly mobile: string | null
  } | null
  readonly service: { readonly id: string; readonly name: string } | null
  readonly status: string
  readonly localDate: string
  readonly localTime: string
  readonly durationMinutes: number
  readonly isSlotBlock: boolean
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly cancelReason: string | null
  readonly source: string | null
}

/**
 * The statuses a grid renders as a live cell — the alarm excluded by construction.
 */
const GRID_STATUSES: string[] = [
  AppointmentStatus.Booked,
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.Arrived,
  AppointmentStatus.Completed,
  AppointmentStatus.NoShow,
]

/** One row of any day grid, shaped as the cell renders it. */
export interface AppointmentRow {
  readonly id: string
  readonly doctorId: string
  readonly doctorName: string
  readonly customerId: string | null
  readonly customerName: string | null
  readonly customerMobile: string | null
  readonly serviceId: string | null
  readonly serviceName: string | null
  readonly status: string
  readonly localDate: string
  readonly localTime: string
  readonly durationMinutes: number
  readonly isSlotBlock: boolean
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly cancelReason: string | null
  readonly source: string | null
}

/**
 * A Persian person's full name, joined the way the product writes it.
 */
function personName(firstName: string, lastName: string | null): string {
  return lastName === null ? firstName : `${firstName} ${lastName}`
}

/** Flattens a Prisma row into the grid's own shape, in one place. */
function asRow(raw: AppointmentWithRelations): AppointmentRow {
  return {
    id: raw.id,
    doctorId: raw.doctorId,
    doctorName: personName(raw.doctor.firstName, raw.doctor.lastName),
    customerId: raw.customer?.id ?? null,
    customerName: raw.customer === null ? null : personName(raw.customer.firstName, raw.customer.lastName),
    customerMobile: raw.customer?.mobile ?? null,
    serviceId: raw.service?.id ?? null,
    serviceName: raw.service?.name ?? null,
    status: raw.status,
    localDate: raw.localDate,
    localTime: raw.localTime,
    durationMinutes: raw.durationMinutes,
    isSlotBlock: raw.isSlotBlock,
    priceAtBooking: raw.priceAtBooking,
    depositAmount: raw.depositAmount,
    cancelReason: raw.cancelReason,
    source: raw.source,
  }
}

/**
 * «برنامه من» — one doctor's own day, the most-executed query in the product.
 */
export async function doctorDay(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly doctorId: string
  readonly localDate: LocalDate
}): Promise<readonly AppointmentRow[]> {
  const rows = await args.tx.appointment.findMany({
    where: {
      tenantId: args.tenantId,
      doctorId: args.doctorId,
      localDate: args.localDate,
      status: { in: GRID_STATUSES },
    },
    orderBy: { localTime: 'asc' },
    include: APPOINTMENT_INCLUDE,
  })

  return rows.map(asRow)
}

/**
 * The clinic-wide day grid — the reception desk and the manager's oversight page.
 */
export async function clinicDay(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
}): Promise<readonly AppointmentRow[]> {
  const rows = await args.tx.appointment.findMany({
    where: {
      tenantId: args.ctx.tenantId,
      clinicId: args.clinicId ?? undefined,
      localDate: args.localDate,
      status: { in: GRID_STATUSES },
    },
    orderBy: [{ doctor: { firstName: 'asc' } }, { localTime: 'asc' }],
    include: APPOINTMENT_INCLUDE,
  })

  return rows.map((row) => asRow(row))
}

/** A grid column header: the doctor's id for the cell's query, their name for the header. */
export interface DoctorColumn {
  readonly id: string
  readonly name: string
}

/**
 * The clinic's doctors who work on a day, as the grid's column headers render them.
 *
 * Reads `DoctorShiftRange` for the weekday and merges those doctors in: a doctor who
 * has only override rows (and no `DoctorWorkingHours` row) is still a column, because
 * the override is what their schedule is. A doctor with neither is not a column.
 */
export async function doctorsOnDay(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly weekday: number
}): Promise<readonly DoctorColumn[]> {
  const [hoursRows, rangeRows] = await Promise.all([
    args.tx.doctorWorkingHours.findMany({
      where: {
        tenantId: args.tenantId,
        weekday: args.weekday,
        doctor: { memberships: { some: { tenantId: args.tenantId, isActive: true } } },
      },
      distinct: ['doctorId'],
      select: {
        doctorId: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    args.tx.doctorShiftRange.findMany({
      where: {
        tenantId: args.tenantId,
        weekday: args.weekday,
        doctor: { memberships: { some: { tenantId: args.tenantId, isActive: true } } },
      },
      distinct: ['doctorId'],
      select: {
        doctorId: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ])

  const byId = new Map<string, DoctorColumn>()
  for (const row of hoursRows) {
    byId.set(row.doctor.id, {
      id: row.doctor.id,
      name: personName(row.doctor.firstName, row.doctor.lastName),
    })
  }
  for (const row of rangeRows) {
    byId.set(row.doctor.id, {
      id: row.doctor.id,
      name: personName(row.doctor.firstName, row.doctor.lastName),
    })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * One doctor's working window on a weekday, as the grid's hour axis reads it.
 */
export interface DoctorDayWindow {
  readonly id: string
  readonly name: string
  /** Minutes since midnight the doctor's working window opens (spanning min across ranges). */
  readonly startMinute: number
  /** Minutes since midnight the window closes (spanning max; half-open). */
  readonly endMinute: number
  /**
   * The individual working ranges, one per shift the doctor holds that weekday.
   */
  readonly ranges: readonly { readonly startMinute: number; readonly endMinute: number }[]
  /**
   * The doctor's own slot step for the weekday, or `null` when they have no override.
   *
   * `null` is the default: the grid's own `AXIS_STEP`. A number is the doctor's own
   * override and the grid's row axis uses it for this column.
   */
  readonly slotMinutes: number | null
}

/**
 * The working window of each doctor who works a weekday, for the grid's hour axis.
 *
 * Reads `DoctorShiftRange` when the doctor has any rows for the weekday: the ranges
 * are *those* (each intersected with the clinic's shift), the spanning envelope is the
 * override's, and `slotMinutes` is the smallest step across the override's ranges — so
 * a doctor who works 10–12 in 30-minute slots and 14–17 in 60-minute slots gets the
 * finer axis, and the column can hold both. A doctor with no override rows falls back
 * to `DoctorWorkingHours`, as before.
 */
export async function doctorWindowsOnDay(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly clinicId: string | null
  readonly weekday: number
}): Promise<readonly DoctorDayWindow[]> {
  const [shifts, hoursRows, rangeRows] = await Promise.all([
    args.tx.clinicShift.findMany({
      where: { tenantId: args.tenantId, clinicId: args.clinicId ?? undefined, weekday: args.weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorWorkingHours.findMany({
      where: {
        tenantId: args.tenantId,
        weekday: args.weekday,
        doctor: { memberships: { some: { tenantId: args.tenantId, isActive: true } } },
      },
      select: {
        startTime: true,
        endTime: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    args.tx.doctorShiftRange.findMany({
      where: {
        tenantId: args.tenantId,
        weekday: args.weekday,
        doctor: { memberships: { some: { tenantId: args.tenantId, isActive: true } } },
      },
      select: {
        startTime: true,
        endTime: true,
        slotMinutes: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ])

  const shift = shifts[0] ?? null
  if (shift === null) return []

  const byDoctor = new Map<
    string,
    {
      name: string
      ranges: { startMinute: number; endMinute: number }[]
      slotMinutes: number | null
    }
  >()

  // The override wins: a doctor with `DoctorShiftRange` rows for the weekday has
  // *those* as their schedule, and the default row is not read.
  const doctorsWithOverride = new Set(rangeRows.map((row) => row.doctor.id))
  for (const row of rangeRows) {
    const range = workingRange({ shift, hours: { startTime: row.startTime, endTime: row.endTime } })
    if (range === null) continue
    const existing = byDoctor.get(row.doctor.id)
    const next = { startMinute: range.start, endMinute: range.end }
    if (existing === undefined) {
      byDoctor.set(row.doctor.id, {
        name: personName(row.doctor.firstName, row.doctor.lastName),
        ranges: [next],
        slotMinutes: row.slotMinutes,
      })
    } else {
      existing.ranges.push(next)
      existing.slotMinutes =
        existing.slotMinutes === null ? row.slotMinutes : Math.min(existing.slotMinutes, row.slotMinutes)
    }
  }

  // The default row, for doctors who have no override for the weekday.
  for (const row of hoursRows) {
    if (doctorsWithOverride.has(row.doctor.id)) continue
    const range = workingRange({ shift, hours: { startTime: row.startTime, endTime: row.endTime } })
    if (range === null) continue
    const existing = byDoctor.get(row.doctor.id)
    const next = { startMinute: range.start, endMinute: range.end }
    if (existing === undefined) {
      byDoctor.set(row.doctor.id, {
        name: personName(row.doctor.firstName, row.doctor.lastName),
        ranges: [next],
        slotMinutes: null,
      })
    } else {
      existing.ranges.push(next)
    }
  }

  return [...byDoctor.entries()].map(([id, w]) => {
    const ordered = [...w.ranges].sort((a, b) => a.startMinute - b.startMinute)
    return {
      id,
      name: w.name,
      startMinute: Math.min(...ordered.map((r) => r.startMinute)),
      endMinute: Math.max(...ordered.map((r) => r.endMinute)),
      ranges: ordered,
      slotMinutes: w.slotMinutes,
    }
  })
}

/**
 * The day's `RESULT_NOT_RECORDED` rows for one clinic — the alarm, scoped to a day.
 */
export async function unrecordedOnDay(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
}): Promise<readonly AppointmentRow[]> {
  const rows = await args.tx.appointment.findMany({
    where: {
      tenantId: args.ctx.tenantId,
      clinicId: args.clinicId ?? undefined,
      localDate: args.localDate,
      isSlotBlock: false,
      status: AppointmentStatus.ResultNotRecorded,
    },
    orderBy: [{ doctor: { firstName: 'asc' } }, { localTime: 'asc' }],
    include: APPOINTMENT_INCLUDE,
  })

  return rows.map((row) => asRow(row))
}

/**
 * The «نتیجه ثبت نشده» cartable — reception only.
 */
export async function unrecordedCartable(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
}): Promise<readonly AppointmentRow[]> {
  const rows = await args.tx.appointment.findMany({
    where: {
      tenantId: args.tenantId,
      isSlotBlock: false,
      status: { in: CARTABLE_STATUS_FILTER },
    },
    orderBy: [{ localDate: 'asc' }, { localTime: 'asc' }],
    include: APPOINTMENT_INCLUDE,
  })

  return rows.map((row) => asRow(row))
}

/**
 * The week's days as the grid renders them, in the product's own week order.
 */
export function weekDays(startOfWeek: LocalDate): readonly LocalDate[] {
  return jalaliWeek(startOfWeek)
}

/**
 * The doctors who offer a service, as the booking popup's own list.
 */
export async function doctorsForService(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly serviceId: string
}): Promise<readonly DoctorColumn[]> {
  const rows = await args.tx.serviceDoctor.findMany({
    where: { tenantId: args.tenantId, serviceId: args.serviceId },
    select: {
      doctorId: true,
      doctor: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  return rows.map((row) => ({
    id: row.doctor.id,
    name: personName(row.doctor.firstName, row.doctor.lastName),
  }))
}

/**
 * The weekdays a doctor works, as the popup's week strip reads them.
 */
export async function workingWeekdaysForDoctor(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly doctorId: string
}): Promise<readonly number[]> {
  const rows = await args.tx.doctorWorkingHours.findMany({
    where: { tenantId: args.tenantId, doctorId: args.doctorId },
    select: { weekday: true },
    distinct: ['weekday'],
    orderBy: { weekday: 'asc' },
  })
  return rows.map((row) => row.weekday)
}