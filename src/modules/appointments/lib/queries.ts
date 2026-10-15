/**
 * The reads the three scheduling pages render.
 *
 * ## The paid total on every row
 *
 * Every row carries `paidTotal`, the sum of the payment ledger's rows for the
 * appointment. The grid does not join the ledger — a day grid of N rows would be N
 * extra joins — so the four queries here read the payments in one pass, keyed by
 * the appointment ids the rows they just read hold, and stamp each row's own total.
 * The row's `priceAtBooking` is `charged`; `paidTotal` is what the desk has
 * already collected; and `charged − paidTotal − discount` is the balance
 * `03-data-model.md` §4.1 names.
 */

import type { Prisma } from '@prisma/client'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { jalaliWeek, type LocalDate } from '@/core/localization'

import { AppointmentStatus } from '@/core/constants'
import { CARTABLE_STATUSES } from './status'
import { workingRange } from './slots'

const CARTABLE_STATUS_FILTER: string[] = [...CARTABLE_STATUSES]

const APPOINTMENT_INCLUDE = {
  customer: { select: { id: true, firstName: true, lastName: true, mobile: true } },
  service: { select: { id: true, name: true } },
  doctor: { select: { id: true, firstName: true, lastName: true } },
} as const satisfies Prisma.AppointmentInclude

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
  readonly resultNote: string | null
  readonly source: string | null
}

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
  /** The sum of every payment already recorded on this appointment. */
  readonly paidTotal: bigint
  readonly cancelReason: string | null
  readonly resultNote: string | null
  readonly source: string | null
}

function personName(firstName: string, lastName: string | null): string {
  return lastName === null ? firstName : `${firstName} ${lastName}`
}

/**
 * The paid total of every appointment named, in one indexed scan.
 *
 * The `payments_tenant_appointment_idx` index the ledger declares is what makes
 * this an index-only read: one `groupBy` over the ids the query just returned,
 * keyed by `appointmentId`.
 */
async function paidTotalsFor(
  tx: TransactionClient,
  tenantId: string,
  appointmentIds: readonly string[],
): Promise<Readonly<Record<string, bigint>>> {
  if (appointmentIds.length === 0) return {}
  const rows = await tx.payment.groupBy({
    by: ['appointmentId'],
    where: { tenantId, appointmentId: { in: [...appointmentIds] } },
    _sum: { amount: true, discountAmount: true },
  })
  const map: Record<string, bigint> = {}
  for (const row of rows) {
    const paid = row._sum.amount ?? 0n
    const discount = row._sum.discountAmount ?? 0n
    map[row.appointmentId] = paid + discount
  }
  return map
}

function asRow(raw: AppointmentWithRelations, paidTotal: bigint): AppointmentRow {
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
    paidTotal,
    cancelReason: raw.cancelReason,
    resultNote: raw.resultNote,
    source: raw.source,
  }
}

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
  const totals = await paidTotalsFor(args.tx, args.tenantId, rows.map((r) => r.id))
  return rows.map((row) => asRow(row, totals[row.id] ?? 0n))
}

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
  const totals = await paidTotalsFor(args.tx, args.ctx.tenantId, rows.map((r) => r.id))
  return rows.map((row) => asRow(row, totals[row.id] ?? 0n))
}

export interface DoctorColumn {
  readonly id: string
  readonly name: string
}

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
      select: { doctorId: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
    }),
    args.tx.doctorShiftRange.findMany({
      where: {
        tenantId: args.tenantId,
        weekday: args.weekday,
        doctor: { memberships: { some: { tenantId: args.tenantId, isActive: true } } },
      },
      distinct: ['doctorId'],
      select: { doctorId: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ])
  const byId = new Map<string, DoctorColumn>()
  for (const row of hoursRows) {
    byId.set(row.doctor.id, { id: row.doctor.id, name: personName(row.doctor.firstName, row.doctor.lastName) })
  }
  for (const row of rangeRows) {
    byId.set(row.doctor.id, { id: row.doctor.id, name: personName(row.doctor.firstName, row.doctor.lastName) })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export interface DoctorDayRange {
  readonly startMinute: number
  readonly endMinute: number
  readonly slotMinutes: number
}

export interface DoctorDayWindow {
  readonly id: string
  readonly name: string
  readonly startMinute: number
  readonly endMinute: number
  readonly ranges: readonly DoctorDayRange[]
}

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
      select: { startTime: true, endTime: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
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

  const byDoctor = new Map<string, { name: string; ranges: DoctorDayRange[] }>()
  const doctorsWithOverride = new Set(rangeRows.map((row) => row.doctor.id))

  for (const row of rangeRows) {
    const range = workingRange({ shift, hours: { startTime: row.startTime, endTime: row.endTime } })
    if (range === null) continue
    const existing = byDoctor.get(row.doctor.id)
    const next: DoctorDayRange = { startMinute: range.start, endMinute: range.end, slotMinutes: row.slotMinutes }
    if (existing === undefined) {
      byDoctor.set(row.doctor.id, { name: personName(row.doctor.firstName, row.doctor.lastName), ranges: [next] })
    } else {
      existing.ranges.push(next)
    }
  }

  for (const row of hoursRows) {
    if (doctorsWithOverride.has(row.doctor.id)) continue
    const range = workingRange({ shift, hours: { startTime: row.startTime, endTime: row.endTime } })
    if (range === null) continue
    const existing = byDoctor.get(row.doctor.id)
    const next: DoctorDayRange = { startMinute: range.start, endMinute: range.end, slotMinutes: 30 }
    if (existing === undefined) {
      byDoctor.set(row.doctor.id, { name: personName(row.doctor.firstName, row.doctor.lastName), ranges: [next] })
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
  const totals = await paidTotalsFor(args.tx, args.ctx.tenantId, rows.map((r) => r.id))
  return rows.map((row) => asRow(row, totals[row.id] ?? 0n))
}

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
  const totals = await paidTotalsFor(args.tx, args.tenantId, rows.map((r) => r.id))
  return rows.map((row) => asRow(row, totals[row.id] ?? 0n))
}

export function weekDays(startOfWeek: LocalDate): readonly LocalDate[] {
  return jalaliWeek(startOfWeek)
}

export async function doctorsForService(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly serviceId: string
}): Promise<readonly DoctorColumn[]> {
  const rows = await args.tx.serviceDoctor.findMany({
    where: { tenantId: args.tenantId, serviceId: args.serviceId },
    select: { doctorId: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { doctor: { firstName: 'asc' } },
  })
  return rows.map((row) => ({ id: row.doctor.id, name: personName(row.doctor.firstName, row.doctor.lastName) }))
}

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