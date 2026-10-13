/**
 * The two writes a debt carries — follow-up and due-date reschedule.
 *
 * `03-data-model.md` §4.4 is explicit that debt deletion does not exist, and this file
 * is the complete list of what a debt *can* be written on: the follow-up the desk
 * recorded, and the due date the customer promised. Both land on the appointment the
 * debt is computed from, because there is no `debts` table and the follow-up lives on
 * the charge it is about.
 *
 * ## Why a settled debt is refused rather than written
 *
 * A follow-up on a balance of zero is a call the clinic makes about money it has, and
 * the row in the list is the only thing that would tell the desk otherwise. The check
 * is the balance's own computation and not a column, so a payment that settled the debt
 * between the page's read and this write is a write the module refuses.
 *
 * ## Why the note is optional but trimmed
 *
 * The note is the desk's own sentence about the call, and the next call reads it back.
 * It is optional because a secretary in a hurry may skip it; it is trimmed so that a
 * run of spaces is `null` and not an empty string a renderer would print. There is no
 * length floor: a note may be one word, and refusing it would be the module inventing
 * a policy the desk did not ask for. The upper bound is the validation's, on the way
 * in, not this file's.
 */

import { DomainError, NotFoundError } from '@/core/types'
import { Permission, Role } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'

import { appointmentBalance } from '@/modules/payments'
import { readDebtSettings } from './settings'

/** The columns the two writes read off the appointment, and nothing more. */
const APPOINTMENT_SELECT = {
  id: true,
  customerId: true,
  scheduledAt: true,
  priceAtBooking: true,
} as const

/** The one appointment the action named, in the caller's tenant or not at all. */
async function findDebt(tx: TransactionClient, tenantId: string, appointmentId: string) {
  return tx.appointment.findUnique({
    where: { tenantId, id: appointmentId },
    select: APPOINTMENT_SELECT,
  })
}

/** Refuses when the debt is settled, because the list moved underneath the action. */
async function assertStillOwed(
  tx: TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const balance = await appointmentBalance(tx, tenantId, appointmentId)
  if (balance.balance <= 0n) {
    throw new DomainError('The debt is settled', { messageKey: 'debt.alreadySettled' })
  }
}

/** The trimmed note, or `null` when the desk left it blank. */
function normaliseNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * «ثبت پیگیری» — the desk called, and recorded when to try again.
 *
 * `debtFollowUpAt` is the call the desk just made, and `debtNextContactAt` is the
 * reminder the customer was promised. Both are instants the caller converts from the
 * day the picker collected, in the tenant's own clock.
 *
 * `note` is the desk's own sentence about the call, written beside the date; it is
 * what the *next* follow-up reads back as context, and it is optional because a
 * secretary in a hurry may skip it. A blank note is stored as `null`, not as an
 * empty string — the module's own definition of "no note".
 *
 * @throws PermissionError — no `follow_up_debt`.
 * @throws NotFoundError — the appointment is not in this tenant.
 * @throws DomainError — the debt is already settled.
 */
export async function recordFollowUp(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  /** When the desk promised to try again; `null` closes the reminder. */
  readonly nextContactAt: Date | null
  /** What the desk wrote down on the call, if anything. */
  readonly note?: string | null
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, Permission.FollowUpDebt)

  const appointment = await findDebt(args.tx, args.ctx.tenantId, args.appointmentId)
  if (appointment === null) {
    throw new NotFoundError('The appointment is not in this tenant', {
      messageKey: 'debt.notFound',
    })
  }

  await assertStillOwed(args.tx, args.ctx.tenantId, args.appointmentId)

  await args.tx.appointment.update({
    where: { id: appointment.id },
    data: {
      debtFollowUpAt: args.now,
      debtFollowUpNote: normaliseNote(args.note),
      debtNextContactAt: args.nextContactAt,
    },
  })
}

/**
 * «تغییر سررسید» — the due date the customer promised, overriding the computed one.
 *
 * The override wins over `scheduledAt + grace` in the read, so a promise the desk
 * recorded is the date the list honours. Toggle 4 bounds it: a secretary on a clinic
 * that turned it off may not move a due date, and the manager is not bounded by the
 * toggle because the toggle is about the desk's authority and not the clinic's policy.
 *
 * @throws PermissionError — no `follow_up_debt`.
 * @throws NotFoundError — the appointment is not in this tenant.
 * @throws DomainError — the debt is settled, or the desk may not move the date.
 */
export async function rescheduleDueDate(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly dueDate: Date
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, Permission.FollowUpDebt)

  const appointment = await findDebt(args.tx, args.ctx.tenantId, args.appointmentId)
  if (appointment === null) {
    throw new NotFoundError('The appointment is not in this tenant', {
      messageKey: 'debt.notFound',
    })
  }

  const settings = await readDebtSettings(args.tx, args.ctx.tenantId)
  if (args.ctx.role === Role.Secretary && !settings.secretaryCanMoveDueDate) {
    throw new DomainError('The secretary may not move a due date', {
      messageKey: 'debt.cannotMoveDueDate',
    })
  }

  await assertStillOwed(args.tx, args.ctx.tenantId, args.appointmentId)

  await args.tx.appointment.update({
    where: { id: appointment.id },
    data: { debtDueDateOverride: args.dueDate },
  })
}