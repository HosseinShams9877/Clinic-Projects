/**
 * The transitions a person records: arrival, the result, and the no-show.
 *
 * These are the four manual states of `03-data-model.md` §2.2's table — `ARRIVED`,
 * `COMPLETED`, `NO_SHOW` — and each one is written by a named function rather than a
 * generic `setStatus`, because the three are not three values of one thing. Each one
 * carries its own side facts and its own permission, and a generic setter would let
 * a caller write the side facts of one while recording another.
 *
 * `recordResult` is now the entry point of the completion-and-payment flow: the
 * caller hands it the money the customer paid for the session as an optional
 * `payment` argument, and this function records the appointment's own facts while
 * the caller writes the ledger through the `payments` module. The two writes are in
 * one transaction, so a completion whose payment was refused rolls back as a unit
 * and never leaves a completed appointment without its receipt.
 */

import { AppointmentStatus } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { NotFoundError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { AppointmentsMessageKey } from '../catalog'
import { assertTransition } from './status'

/** The columns a manual transition reads and writes. */
const TRANSITION_SELECT = {
  id: true,
  status: true,
  customerId: true,
  serviceId: true,
  doctorId: true,
  clinicId: true,
  cycleId: true,
  scheduledAt: true,
  resultRecordedAt: true,
  resultNote: true,
} as const

/** One row as the transition guards and the cycle builder need it. */
export interface TransitionRow {
  readonly id: string
  readonly status: string
  readonly customerId: string | null
  readonly serviceId: string | null
  readonly doctorId: string
  readonly clinicId: string
  readonly cycleId: string | null
  /** The slot's instant, which the cycle's `startedAt` and due dates are built from. */
  readonly scheduledAt: Date
  readonly resultRecordedAt: Date | null
  /** The sentence recorded about the outcome, distinct from a cancel or no-show reason. */
  readonly resultNote: string | null
}

/**
 * Loads the row a transition is about to run, as the caller's tenant sees it.
 *
 * A slot block is a row this function *does* return — see the file header for why
 * the `isSlotBlock: false` filter that used to sit here was removed. The tenant
 * predicate is the only filter left, and it is the one `09-security.md` §6.3's
 * 404-not-403 rule requires.
 *
 * @throws NotFoundError — the row is outside the caller's tenant.
 */
export async function loadTransitionRow(
  tx: TransactionClient,
  ctx: TenantContext,
  appointmentId: string,
): Promise<TransitionRow> {
  const row = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId },
    select: TRANSITION_SELECT,
  })
  if (row === null) {
    throw new NotFoundError(`Appointment ${appointmentId} was not found in this tenant.`, {
      messageKey: 'appointment.notFound' satisfies AppointmentsMessageKey,
      detail: { appointmentId },
    })
  }
  return row
}

/**
 * «حاضر شد» — the reception desk records that the customer arrived.
 *
 * `record_appointment_result` and not `manage_appointments`: the receptionist who
 * marks an arrival is recording the day's fact, and the permission the matrix gives
 * the role for that is the result permission. A doctor who holds only the three
 * doctor permissions cannot mark an arrival, which is §2.1's "a doctor sees only
 * their own" — and this is the boundary that keeps it true on the write path.
 */
export async function recordArrival(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly now: Date
}): Promise<TransitionRow> {
  requirePermission(args.ctx, 'record_appointment_result')

  const row = await loadTransitionRow(args.tx, args.ctx, args.appointmentId)
  assertTransition(asStatus(row.status), AppointmentStatus.Arrived)

  await args.tx.appointment.update({
    where: { id: row.id },
    data: { status: AppointmentStatus.Arrived },
  })

  return { ...row, status: AppointmentStatus.Arrived }
}

/**
 * «انجام شد» — the service was performed.
 *
 * `resultRecordedAt` is stamped at the instant the result is written, and it is the
 * field the «نتیجه ثبت نشده» cartable clears — an appointment that reached this
 * state has a recorded result by construction, which is what makes the alarm
 * self-clearing rather than something a person has to dismiss.
 *
 * `note` is the free-text sentence the doctor or secretary records about the
 * session's outcome. It is optional and trimmed here — not on the form — so the
 * stored sentence is the one the profile reads regardless of which form wrote it.
 *
 * **This is the transition that creates a treatment cycle** (`03-data-model.md`
 * §2.2). The cycle belongs to the `cycles` module; what this module contributes is
 * the completed session the cycle is built from, returned here so the caller hands
 * it to the module that owns the cycle rather than the two modules reaching into
 * each other's tables.
 *
 * The payment the desk collected for the session is **not** this function's fact —
 * the ledger belongs to `payments`, and this function has no columns for it. The
 * caller writes the receipt through `payments`' own `recordPayment` inside the same
 * transaction; see `recordResultAction`.
 */
export async function recordResult(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly note?: string
  readonly now: Date
}): Promise<TransitionRow> {
  requirePermission(args.ctx, 'record_appointment_result')

  const row = await loadTransitionRow(args.tx, args.ctx, args.appointmentId)
  assertTransition(asStatus(row.status), AppointmentStatus.Completed)

  const resultNote = args.note === undefined ? null : args.note.trim()

  await args.tx.appointment.update({
    where: { id: row.id },
    data: {
      status: AppointmentStatus.Completed,
      resultRecordedAt: args.now,
      resultNote,
    },
  })

  return {
    ...row,
    status: AppointmentStatus.Completed,
    resultRecordedAt: args.now,
    resultNote,
  }
}

/**
 * «عدم حضور» — the reception desk confirms the customer did not come.
 *
 * `noShowReason` is the free-text Persian sentence the receptionist records, trimmed
 * of the whitespace a form leaves around it. A blank reason is accepted rather than
 * required: the specification makes the reason a fact the desk records when it has
 * one, and refusing a no-show with no sentence would leave the row in
 * `AWAITING_ARRIVAL` — which is the state the sweep's alarm is about, and the worse
 * outcome.
 */
export async function recordNoShow(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly reason?: string
  readonly now: Date
}): Promise<TransitionRow> {
  requirePermission(args.ctx, 'record_appointment_result')

  const row = await loadTransitionRow(args.tx, args.ctx, args.appointmentId)
  assertTransition(asStatus(row.status), AppointmentStatus.NoShow)

  await args.tx.appointment.update({
    where: { id: row.id },
    data: {
      status: AppointmentStatus.NoShow,
      noShowReason: args.reason === undefined ? null : args.reason.trim(),
    },
  })

  return { ...row, status: AppointmentStatus.NoShow }
}

/**
 * The status column's value as the state machine's own union.
 *
 * Shared with `lib/book.ts` for the same reason: the column is a plain `String` on
 * both engines, and the state machine answers a value it does not recognise with a
 * refusal rather than with a hole in its table.
 */
function asStatus(value: string): AppointmentStatus {
  return value as AppointmentStatus
}