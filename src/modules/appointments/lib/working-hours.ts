/**
 * A doctor's weekly working hours — the read the grid's windows rest on, and the
 * write the manager's «ساعت کاری» form makes.
 *
 * The slot engine intersects the clinic's shift with each doctor's own hours
 * (`book.ts`'s `loadSlotDay`), and until now those hours were only ever seeded. This
 * is their editing surface's module half: one read of a doctor's seven-weekday set, and
 * one write that replaces it wholesale. The appointments module owns the
 * `DoctorWorkingHours` table (it is the only module that reads it), so the write lives
 * here rather than in `staff` — `02-architecture.md` §10 rule 2: a table has one owner.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { AppointmentsMessageKey } from '../catalog'

/** One weekday's window for a doctor, as the form reads and writes it. */
export interface DoctorHoursRow {
  /** 0 = شنبه … 6 = جمعه, the project's own weekday numbering. */
  readonly weekday: number
  /** Stored `HH:mm`, start of the day's window. */
  readonly startTime: string
  /** Stored `HH:mm`, end of the day's window. */
  readonly endTime: string
}

/**
 * One doctor's weekly hours, the seven-day set the form opens on.
 *
 * Ordered by weekday so the form renders شنبه-first without re-sorting, and scoped to
 * the caller's tenant so a doctor id from another tenant reads back empty rather than
 * another clinic's schedule.
 */
export async function readDoctorWorkingHours(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly doctorId: string
}): Promise<readonly DoctorHoursRow[]> {
  const rows = await args.tx.doctorWorkingHours.findMany({
    where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId },
    orderBy: { weekday: 'asc' },
    select: { weekday: true, startTime: true, endTime: true },
  })
  return rows
}

/**
 * Replaces a doctor's weekly hours with the set the form submitted.
 *
 * Wholesale replace, not a per-row diff: the form is the seven days at once, so the
 * honest write is "these are the doctor's hours now", and a delete-then-insert in the
 * caller's transaction is atomic. A day the form omits is a day the doctor does not
 * work, which is the absence of a row (the engine reads no window and offers no slot).
 *
 * @throws PermissionError — the caller holds no `manage_clinic_settings`.
 * @throws DomainError — a weekday is outside 0–6, or a window ends before it starts.
 */
export async function setDoctorWorkingHours(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly doctorId: string
  readonly rows: readonly DoctorHoursRow[]
}): Promise<void> {
  requirePermission(args.ctx, 'manage_clinic_settings')

  for (const row of args.rows) {
    if (row.weekday < 0 || row.weekday > 6) {
      throw new DomainError(`The weekday ${row.weekday} is not a day of the week.`, {
        messageKey: 'appointment.invalidWorkingHours' satisfies AppointmentsMessageKey,
        detail: { weekday: row.weekday },
      })
    }
    if (row.startTime >= row.endTime) {
      throw new DomainError('A working-hours window must end after it starts.', {
        messageKey: 'appointment.invalidWorkingHours' satisfies AppointmentsMessageKey,
        detail: { weekday: row.weekday },
      })
    }
  }

  await args.tx.doctorWorkingHours.deleteMany({
    where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId },
  })
  if (args.rows.length > 0) {
    await args.tx.doctorWorkingHours.createMany({
      data: args.rows.map((row) => ({
        tenantId: args.ctx.tenantId,
        doctorId: args.doctorId,
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    })
  }
}
