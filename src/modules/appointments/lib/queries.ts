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
 *
 * `Prisma.AppointmentGetPayload` would name the same fields, but the payload type is
 * the *generated* client's answer, and a row the query hands to `asRow` is the
 * client's too — the two agree today. Stating the shape structurally keeps the grid's
 * own vocabulary in the module that owns the grid, and it is what an override's
 * storage would satisfy as long as it answers the same questions.
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
  /** How the appointment was booked (`AppointmentSource`), or `null` for legacy rows. */
  readonly source: string | null
}

/**
 * The statuses a grid renders as a live cell — the alarm excluded by construction.
 *
 * A plain array and not `as const`: Prisma's `in:` filter takes a mutable `string[]`,
 * and the values are the constants' own, so the set stays tied to `AppointmentStatus`
 * without the tuple's `readonly` getting in the way.
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
  /** How the appointment was booked (`AppointmentSource`), or `null` for legacy rows. */
  readonly source: string | null
}

/**
 * A Persian person's full name, joined the way the product writes it.
 *
 * The `customers` module owns the canonical composition in Phase 3; this is the
 * scheduling grid's own need, and duplicating the join until then is the honest
 * alternative to importing a module that does not exist. A space rather than a ZWNJ,
 * because the two parts are already separate words and a ZWNJ joins the halves of one
 * compound.
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
 * «برنامه من» — one doctor's own day, the most-executed query in the product
 * (`03-data-model.md` §2.2).
 *
 * `doctorId` is not filtered against the caller's own id here. The check that makes a
 * doctor see only their own schedule is `view_own_schedule`, and it is applied by the
 * page that knows which doctor the caller is; this function is the query, and the
 * query answers the question it is asked. The two are separate for the reason
 * `04-roles-permissions.md` §3.2 gives — the same module function is called by a page
 * and by the worker, and the permission is the caller's to establish.
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
 *
 * `clinicId` narrows the grid to the branch the caller's membership resolved to; a
 * membership scoped to no clinic sees every branch of the tenant, which is
 * `02-architecture.md` §3.1's "unscoped, not all branches".
 *
 * Ordered by doctor and then time, so the grid's columns are stable from one render to
 * the next and a receptionist's eye stays on the same column.
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

/**
 * The clinic's doctors who work on a day, as the grid's column headers render them.
 *
 * The columns are the doctors with hours on that weekday; a doctor who does not work
 * the day is not a column, which is what keeps the grid from offering a whole empty
 * column of «خارج از برنامه» cells.
 */
/** A grid column header: the doctor's id for the cell's query, their name for the header. */
export interface DoctorColumn {
  readonly id: string
  readonly name: string
}

/**
 * The clinic's doctors who work on a day, as the grid's column headers render them.
 *
 * The columns are the doctors with hours on that weekday; a doctor who does not work
 * the day is not a column, which is what keeps the grid from offering a whole empty
 * column of «خارج از برنامه» cells.
 */
export async function doctorsOnDay(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly weekday: number
}): Promise<readonly DoctorColumn[]> {
  const rows = await args.tx.doctorWorkingHours.findMany({
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
  })

  return rows.map((row) => ({
    id: row.doctor.id,
    name: personName(row.doctor.firstName, row.doctor.lastName),
  }))
}

/**
 * One doctor's working window on a weekday, as the grid's hour axis reads it.
 *
 * The window is the intersection of the clinic's shift and the doctor's hours — the
 * same intersection `workingRange` computes for the slot generator and the booking
 * path — expressed in minutes since midnight. The grid uses it to decide, for a given
 * time cell, whether the doctor is on the schedule (an empty «+» the desk can book) or
 * off it (a struck «خارج از برنامه» cell), which is the one fact `DoctorColumn` does
 * not carry.
 */
export interface DoctorDayWindow {
  readonly id: string
  readonly name: string
  /** Minutes since midnight the doctor's working window opens (spanning min across shifts). */
  readonly startMinute: number
  /** Minutes since midnight the window closes (spanning max; half-open). */
  readonly endMinute: number
  /**
   * The individual working ranges, one per shift the doctor holds that weekday. A doctor
   * with a split day (morning + evening) has two, and the gap between them is a break the
   * grid draws rather than bookable time. `startMinute`/`endMinute` remain the spanning
   * envelope so existing readers that want one window keep working.
   */
  readonly ranges: readonly { readonly startMinute: number; readonly endMinute: number }[]
}

/**
 * The working window of each doctor who works a weekday, for the grid's hour axis.
 *
 * Reads the clinic's shift and the doctors' hours exactly as the booking path's own
 * `loadSlotDay` does, and reuses `workingRange` so the window the grid draws is the
 * window a booking is checked against. A doctor whose hours do not overlap the shift
 * is dropped — they are not a column, which is also what `doctorsOnDay` guarantees.
 * Split shifts (two rows for one doctor on one day) are merged into the spanning
 * window, because the axis is a single range per column.
 */
export async function doctorWindowsOnDay(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly clinicId: string | null
  readonly weekday: number
}): Promise<readonly DoctorDayWindow[]> {
  const [shifts, hours] = await Promise.all([
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
  ])

  const shift = shifts[0] ?? null
  if (shift === null) return []

  const byDoctor = new Map<string, { name: string; ranges: { startMinute: number; endMinute: number }[] }>()
  for (const row of hours) {
    const range = workingRange({ shift, hours: { startTime: row.startTime, endTime: row.endTime } })
    if (range === null) continue
    const existing = byDoctor.get(row.doctor.id)
    const next = { startMinute: range.start, endMinute: range.end }
    if (existing === undefined) {
      byDoctor.set(row.doctor.id, {
        name: personName(row.doctor.firstName, row.doctor.lastName),
        ranges: [next],
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
    }
  })
}

/**
 * The day's `RESULT_NOT_RECORDED` rows for one clinic — the alarm, scoped to a day.
 *
 * `clinicDay` excludes the alarm state by construction (it is not in `GRID_STATUSES`),
 * so a desk that wants to render the outstanding row *in the day's own grid* reads it
 * here and merges it. This is the only other function besides `unrecordedCartable` that
 * selects the state, and it is scoped to one `localDate` where the cartable spans every
 * open day — the grid wants today's, the cartable wants all of them.
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
 *
 * `03-data-model.md` §2.2: the alarm "surfaces **only** in the reception cartable —
 * never on the manager or doctor dashboard". This is the only function in the module
 * that selects `RESULT_NOT_RECORDED`, which is how that rule survives as code rather
 * than as a convention a later page breaks.
 *
 * The cartable also carries the day's expected and arrived, because the three are one
 * list to the desk: the alarm is "this person's outcome is missing", the expectation
 * is "this person is due today" and the arrival is "this person is here now", and a
 * receptionist works the list top to bottom rather than switching surfaces.
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
 *
 * The week starts on شنبه (`07-localization.md` §6.4), so a week anchored on any
 * other day is the week *containing* that day, and the columns are the seven days
 * from the week's شنبه. Kept here so the pages that show a week all show the same
 * seven days for the same input.
 */
export function weekDays(startOfWeek: LocalDate): readonly LocalDate[] {
  return jalaliWeek(startOfWeek)
}
