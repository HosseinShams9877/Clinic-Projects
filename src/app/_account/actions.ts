/**
 * The customer panel's Server Actions — the four writes `09-security.md` §7 permits a
 * customer, and only those four.
 *
 * Each action resolves the customer from the session and hands the session's own
 * `customerId` to the module. **No action accepts a customer id, and none reads one
 * from the request** — §7 names that absence as the property the panel's isolation
 * rests on, and a `customerId` in this file's argument list would be the horizontal
 * escalation the security document describes. The appointment id the cancellation and
 * the reschedule take is a row the module then scopes to the session's customer, so
 * a request naming another person's appointment reaches the module's 404.
 *
 * ## Why the actions answer with sentences
 *
 * The island renders a result, and a thrown error is the framework's English page. Each
 * call is wrapped and the failure's `messageKey` becomes the Persian sentence the
 * catalog holds, which is the same boundary `consultation-action.ts` keeps on the
 * public side for the same reason: the person who pressed the button reads the
 * sentence, not the stack.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { asLocalDate, asLocalTime } from '@/core/localization'

import { resolveCustomerPanel } from '@/app/_shell/session'
import { MESSAGES as APPOINTMENT_MESSAGES } from '@/modules/appointments'
import {
  cancelOwnAppointment,
  rescheduleOwnAppointment,
} from '@/modules/appointments'
import {
  readPaymentSettings,
  refundAmountFor,
} from '@/modules/payments'
import {
  MESSAGES as CUSTOMER_MESSAGES,
  recordOwnConsent,
  updateOwnProfile,
} from '@/modules/customers'
import { CUSTOMER_PANEL } from '@/modules/customers'

/**
 * Every action's answer: either it worked, or it holds the Persian sentence to show.
 *
 * The success branch carries `T` only when the action has something to report —
 * `& void` collapses to `never` in TypeScript, which is why the success payload is
 * behind the conditional rather than intersected unconditionally.
 */
export type PanelActionResult<T = void> =
  | ({ readonly ok: true } & (T extends void ? object : T))
  | { readonly ok: false; readonly message: string }

/** A thrown error as the Persian sentence the island renders. */
function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && 'messageKey' in error) {
    const key = (error as { readonly messageKey: string }).messageKey
    if (key in APPOINTMENT_MESSAGES) return APPOINTMENT_MESSAGES[key as keyof typeof APPOINTMENT_MESSAGES]
    if (key in CUSTOMER_MESSAGES) return CUSTOMER_MESSAGES[key as keyof typeof CUSTOMER_MESSAGES]
  }
  return fallback
}

/**
 * «لغو نوبت» — closes the customer's own session inside the policy window.
 *
 * The module applies the deposit policy and returns what it entitles the customer to,
 * which the island names back: a cancellation that returns nothing is a cancellation
 * the customer cannot tell whether their deposit follows.
 */
export async function cancelOwnAppointmentAction(appointmentId: string): Promise<
  PanelActionResult<{
    readonly refundAmount: string
    readonly refundable: boolean
  }>
> {
  const session = await resolveCustomerPanel()

  try {
    return await runInTenantScope(session.permissions, prisma(), async (tx) => {
      const result = await cancelOwnAppointment({
        tx,
        tenantId: session.tenantId,
        customerId: session.customerId,
        appointmentId,
        now: realClock(),
      })

      // The deposit policy is the `payments` module's reading of the deposit the
      // cancellation reports, composed here rather than in the module because the
      // money is that module's — the same rule the desk's own cancellation keeps.
      const settings = await readPaymentSettings(tx, session.tenantId)
      const refundAmount = refundAmountFor(settings.depositRefundPolicy, result.depositReceived)

      revalidatePath('/account')
      revalidatePath('/account/appointments')

      return {
        ok: true as const,
        refundAmount: refundAmount.toString(),
        refundable: refundAmount > 0n,
      }
    })
  } catch (error: unknown) {
    return { ok: false, message: failureMessage(error, CUSTOMER_PANEL.failure) }
  }
}

/**
 * «جابه‌جایی نوبت» — moves the customer's own session to a new slot.
 *
 * The day and time arrive as the `LocalDate`/`LocalTime` strings the picker emits, and
 * the booking path's own guards decide whether the slot is the clinic's to give.
 */
export async function rescheduleOwnAppointmentAction(args: {
  readonly appointmentId: string
  readonly localDate: string
  readonly localTime: string
}): Promise<PanelActionResult> {
  const session = await resolveCustomerPanel()

  try {
    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      await rescheduleOwnAppointment({
        tx,
        tenantId: session.tenantId,
        customerId: session.customerId,
        appointmentId: args.appointmentId,
        newLocalDate: asLocalDate(args.localDate),
        newLocalTime: asLocalTime(args.localTime),
      })
    })

    revalidatePath('/account')
    revalidatePath('/account/appointments')
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, message: failureMessage(error, CUSTOMER_PANEL.failure) }
  }
}

/**
 * «ویرایش پروفایل» — the facts the customer edits themselves.
 *
 * The mobile is not among them: the panel does not offer the field, and the module
 * would not take it.
 */
export async function updateOwnProfileAction(args: {
  readonly firstName: string
  readonly lastName: string
  readonly birthDate: string | null
  readonly residenceArea: string | null
}): Promise<PanelActionResult> {
  const session = await resolveCustomerPanel()

  try {
    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      await updateOwnProfile({
        tx,
        tenantId: session.tenantId,
        customerId: session.customerId,
        firstName: args.firstName,
        lastName: args.lastName,
        birthDate: args.birthDate,
        residenceArea: args.residenceArea,
      })
    })

    revalidatePath('/account')
    revalidatePath('/account/profile')
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, message: failureMessage(error, CUSTOMER_PANEL.profile.saved) }
  }
}

/**
 * «تنظیمات ارسال» — the customer's own consent, granted or revoked.
 *
 * A revocation writes the evidence row and flips the flag the send path checks, so the
 * suppression is immediate on the next dispatch; the before/after flag is the one §9's
 * rule 6 gates the public gallery on, and revoking it removes the images at the source.
 */
export async function recordOwnConsentAction(args: {
  readonly sms: boolean
  readonly whatsApp: boolean
  readonly phone: boolean
  readonly beforeAfter: boolean
}): Promise<PanelActionResult> {
  const session = await resolveCustomerPanel()

  try {
    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      await recordOwnConsent({
        tx,
        tenantId: session.tenantId,
        customerId: session.customerId,
        flags: args,
        now: realClock(),
      })
    })

    revalidatePath('/account/profile')
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, message: failureMessage(error, CUSTOMER_PANEL.profile.consent.saved) }
  }
}
