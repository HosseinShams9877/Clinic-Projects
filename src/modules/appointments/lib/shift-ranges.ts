/**
 * A doctor's custom shift ranges — the multi-range, per-range-granularity override
 * of `DoctorWorkingHours`.
 *
 * `DoctorWorkingHours` is the default: one window per weekday, one slot length for
 * the whole clinic (30 minutes, the module's own default). This table is the
 * override: when a doctor has rows here for a weekday, they replace the default for
 * that weekday entirely, and each range carries its own `slotMinutes`. That is what
 * lets a doctor work 10–12 in 30-minute slots and 14–17 in 60-minute slots, with
 * 12–14 simply absent as a lunch break.
 *
 * ## Why the table is separate and not a column on `DoctorWorkingHours`
 *
 * A doctor who takes a two-hour break has *two* bookable ranges on that weekday, not
 * one range with a gap. A column cannot hold two ranges, and a nullable column plus a
 * second `DoctorWorkingHours` row per day would leave "which row is the break"
 * unanswerable. A separate table with one row per range is the shape the fact
 * actually has.
 *
 * ## Why the default stays
 *
 * A doctor who sets nothing keeps working exactly as the product always did: the
 * `DoctorWorkingHours` row, 30-minute slots. Nothing here is required for the
 * product to keep working; it is an override a manager opts into, and a doctor
 * whose row set is empty is a doctor on the default.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { AppointmentsMessageKey } from '../catalog'

/** One shift range for a doctor, as the form reads and writes it. */
export interface DoctorShiftRangeRow {
  /** 0 = شنبه … 6 = جمعه, the project's own weekday numbering. */
  readonly weekday: number
  /** Stored `HH:mm`, start of the range. */
  readonly startTime: string
  /** Stored `HH:mm`, end of the range. */
  readonly endTime: string
  /** The step the slot generator cuts this range to, in minutes. */
  readonly slotMinutes: number
}

/** The shape a write takes, without the row's own `id` and audit columns. */
export type DoctorShiftRangeInput = DoctorShiftRangeRow

/** The default a doctor with no shift-range rows is on. */
export const DEFAULT_SLOT_MINUTES = 30

/**
 * One doctor's shift ranges, all weekdays, ordered so the form renders them in
 * شنبه-first order and by start time inside a day.
 *
 * An empty array is the default state: the doctor works the `DoctorWorkingHours`
 * week, at 30-minute slots, and nothing about their schedule has been overridden.
 */
export async function readDoctorShiftRanges(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly doctorId: string
}): Promise<readonly DoctorShiftRangeRow[]> {
  const rows = await args.tx.doctorShiftRange.findMany({
    where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    select: { weekday: true, startTime: true, endTime: true, slotMinutes: true },
  })
  return rows
}

/**
 * Replaces a doctor's shift ranges with the set the form submitted.
 *
 * Wholesale replace, like `setDoctorWorkingHours`: the form is the doctor's whole
 * week at once, so the honest write is "these are the ranges now", and a
 * delete-then-insert in the caller's transaction is atomic. An empty set restores
 * the default — the doctor goes back to the `DoctorWorkingHours` week.
 *
 * @throws PermissionError — the caller holds no `manage_clinic_settings`.
 * @throws DomainError — a weekday is outside 0–6, a window ends before it starts,
 *   or a `slotMinutes` is not a positive whole number.
 */
export async function setDoctorShiftRanges(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly doctorId: string
  readonly rows: readonly DoctorShiftRangeInput[]
}): Promise<void> {
  requirePermission(args.ctx, 'manage_clinic_settings')

  for (const row of args.rows) {
    if (row.weekday < 0 || row.weekday > 6) {
      throw shiftRangeError('The weekday is not a day of the week.', { weekday: row.weekday })
    }
    if (row.startTime >= row.endTime) {
      throw shiftRangeError('A shift range must end after it starts.', {
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
      })
    }
    if (!Number.isInteger(row.slotMinutes) || row.slotMinutes <= 0) {
      throw shiftRangeError('A shift range must carry a positive whole slot length.', {
        weekday: row.weekday,
        slotMinutes: row.slotMinutes,
      })
    }
  }

  await args.tx.doctorShiftRange.deleteMany({
    where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId },
  })
  if (args.rows.length > 0) {
    await args.tx.doctorShiftRange.createMany({
      data: args.rows.map((row) => ({
        tenantId: args.ctx.tenantId,
        doctorId: args.doctorId,
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        slotMinutes: row.slotMinutes,
      })),
    })
  }
}

/**
 * The effective slot length for one doctor on one weekday.
 *
 * The doctor's own range set wins when it has rows for the weekday: the answer is the
 * *smallest* `slotMinutes` across the day's ranges, because the booking dialog and
 * the day grid both work in one step per column, and a column whose ranges disagree
 * takes the finer step — the slot that has to fit is the shortest one the doctor
 * offers, and rounding up would offer a slot the doctor's own finer range cannot
 * hold. A weekday with no range rows is the default 30.
 */
export async function slotMinutesForDoctor(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly doctorId: string
  readonly weekday: number
}): Promise<number> {
  const rows = await args.tx.doctorShiftRange.findMany({
    where: { tenantId: args.tenantId, doctorId: args.doctorId, weekday: args.weekday },
    select: { slotMinutes: true },
  })
  if (rows.length === 0) return DEFAULT_SLOT_MINUTES
  return Math.min(...rows.map((row) => row.slotMinutes))
}

/** A `DomainError` carrying the working-hours key, built once for the three refusals. */
function shiftRangeError(message: string, detail: Record<string, unknown>): never {
  throw new DomainError(message, {
    messageKey: 'appointment.invalidWorkingHours' satisfies AppointmentsMessageKey,
    detail,
  })
}