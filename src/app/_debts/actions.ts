/**
 * The debts Server Actions — the write half of the three debt surfaces.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and an action composes the
 * session, the tenant scope, the module's barrel and the sentence the failure becomes.
 * It runs no business rule of its own: not one bucket decision, not one permission
 * check, because the module is where those live and an action that re-implemented one
 * would be the second implementation that drifts.
 *
 * ## The three writes a debt carries
 *
 * The desk's row holds three: «ثبت پرداخت» writes a receipt, «ثبت پیگیری» records the
 * call the desk just made and the day it promised to try again, and «تغییر سررسید»
 * records the date a customer promised instead of the date the clinic computed. The
 * three are three modules' work in one transaction — `payments` writes the financial
 * fact, `debts` writes the follow-up — and an action is the one scope that holds both.
 *
 * ## Why failures are sentences and never exceptions
 *
 * An action's contract is a result a component renders. A thrown error surfaces as the
 * framework's own error page, which is English and loses the sentence the module raised
 * on purpose — so every call is wrapped and the key becomes Persian through
 * `moduleFailureMessage`.
 *
 * ## Why the follow-up note is validated and not trimmed here
 *
 * The note is the desk's own sentence about the call, and the next call reads it back.
 * It is bounded here, at the boundary, and not in the module: a note a person typed is
 * a value the boundary parses, and a module that re-validated would be a second place
 * the ceiling lives. A note longer than the ceiling is refused with the sentence the
 * form renders; a blank note is `null` and the module stores `null`.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, fromClockParts, toUtcInstant } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import { PaymentMethod, PaymentKind, isMember } from '@/core/constants'
import { ValidationError } from '@/core/types'
import { recordPayment } from '@/modules/payments'
import { recordFollowUp, rescheduleDueDate, readDebtSettings } from '@/modules/debts'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

import { moduleFailureMessage } from '../_shared/module-failure'

/** The answer every action gives: nothing to render on success, or the sentence. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The maximum the note field carries, in characters. */
const NOTE_MAX_LENGTH = 500

/** The fields the payment form collects. */
export interface RecordPaymentInput {
  readonly amount: string
  readonly method: string
  readonly kind: string
  readonly discountAmount: string
  readonly discountReason: string | null
  readonly note: string | null
}

/** The fields the follow-up form collects. */
export interface FollowUpInput {
  /** A `LocalDate` string the action converts to the instant the column stores. */
  readonly nextContactAt: string
  /**
   * What the desk wrote down on the call, if anything. Optional, and bounded at
   * `NOTE_MAX_LENGTH`; a blank string is stored as `null`.
   */
  readonly note?: string | null
}

/** The fields the reschedule form collects. */
export interface RescheduleInput {
  readonly dueDate: string
}

/**
 * The arguments a block runs with: the scoped transaction, the permission context the
 * module functions take, and the session's own facts.
 */
interface ScopeArgs {
  readonly tx: Parameters<Parameters<typeof runInTenantScope<unknown>>[2]>[0]
  readonly ctx: TenantContext
  readonly tenantId: string
  readonly userId: string
}

/**
 * Runs a block in the caller's tenant scope and answers with a sentence on failure.
 *
 * One helper because the shape is every action's: resolve, scope, call, revalidate.
 */
async function inTenantScope<T>(
  panel: Panel,
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(panel)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({
      tx,
      ctx: session.permissions,
      tenantId: session.tenantId,
      userId: session.permissions.userId,
    }),
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const)
}

/** The sentinel a block returns when it has nothing but a success to report. */
const SUCCESS = { succeeded: true } as const

/**
 * Re-renders the three debt pages an action moved, so the row the desk just settled is
 * off the list when the form closes.
 */
function revalidateDebts(): void {
  revalidatePath('/reception/debts')
  revalidatePath('/admin/debts')
  revalidatePath('/doctor/debts')
}

/**
 * «ثبت پرداخت» — the receipt the desk recorded against this debt.
 *
 * The amount arrives as the string the Rial input collected, and the two closed sets are
 * narrowed here so the module receives values it never has to re-parse. A discount
 * above the secretary's ceiling is refused by the module and comes back as the sentence
 * the form renders — the ceiling is a server-side rule, and a page that hid the field
 * would be a second, weaker, enforcement of it.
 */
export async function recordPaymentAction(
  panel: Panel,
  appointmentId: string,
  input: RecordPaymentInput,
): Promise<ActionResult> {
  // Narrowed to locals first because the narrowing does not survive the closure below,
  // and the module's input is typed by the closed sets' own keys.
  const method = input.method
  const kind = input.kind
  if (!isMember(PaymentMethod, method) || !isMember(PaymentKind, kind)) {
    return { ok: false, message: moduleFailureMessage(new Error('invalid payment input')) }
  }

  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await recordPayment({
      tx,
      ctx,
      input: {
        appointmentId,
        amount: asAmount(input.amount),
        method,
        kind,
        discountAmount: asAmount(input.discountAmount),
        discountReason: input.discountReason,
        note: input.note,
      },
      now: realClock(),
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

/**
 * «ثبت پیگیری» — the desk called, and recorded when to try again.
 *
 * The day the picker hands the action is a `LocalDate` and the column stores an instant;
 * the conversion is the library's own and reads the tenant's offset, so a day the desk
 * reads as «۱۴۰۵/۰۳/۰۴» lands on that day in the clinic's clock.
 *
 * The note is bounded here and not in the module: a note a person typed is a value the
 * boundary parses, and a note longer than the ceiling is the boundary's refusal with
 * the sentence the form renders.
 *
 * @throws never — a failure is returned as a sentence, never thrown.
 */
export async function recordFollowUpAction(
  panel: Panel,
  appointmentId: string,
  input: FollowUpInput,
): Promise<ActionResult> {
  const note = normaliseNote(input.note)
  if (note !== null && note.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: moduleFailureMessage(
        new ValidationError('The follow-up note is longer than the ceiling', {
          messageKey: 'debt.noteTooLong',
          detail: { length: note.length },
        }),
      ),
    }
  }

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    await recordFollowUp({
      tx,
      ctx,
      appointmentId,
      nextContactAt: await asInstant(tx, tenantId, input.nextContactAt),
      note,
      now: realClock(),
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

/**
 * «تغییر سررسید» — the date the customer promised, overriding the computed one.
 *
 * The override is the module's own write and the toggle gates it server-side, so a
 * clinic that turned toggle 4 off refuses the write even if the form is on the page.
 */
export async function rescheduleDueDateAction(
  panel: Panel,
  appointmentId: string,
  input: RescheduleInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    await rescheduleDueDate({
      tx,
      ctx,
      appointmentId,
      dueDate: await asInstant(tx, tenantId, input.dueDate),
      now: realClock(),
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

/* ── The conversions the forms and the table share ──────────────────────────── */

/** The day's own start, which is the time a due date and a contact date carry. */
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

/** A Rial amount the form collected, as the `BigInt` the module takes. */
function asAmount(text: string | null): bigint {
  const digits = (text ?? '').replace(/[^\d]/g, '')
  if (digits === '') return 0n
  return BigInt(digits)
}

/** A `LocalDate` the picker collected, as the instant the column stores. */
async function asInstant(tx: ScopeArgs['tx'], tenantId: string, localDate: string): Promise<Date> {
  const settings = await readDebtSettings(tx, tenantId)
  return toUtcInstant(asLocalDate(localDate), MIDNIGHT, settings.utcOffsetMinutes)
}

/** The note as the module reads it: trimmed, and `null` when it was blank. */
function normaliseNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}