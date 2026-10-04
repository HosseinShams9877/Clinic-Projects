/**
 * The appointments Server Actions — the write half of the three pages.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and an action is
 * composition of a specific kind: it resolves the person from the session, opens the
 * tenant scope, calls the module's barrel and hands back a sentence. It runs no
 * business rule of its own — not one permission check, not one status transition —
 * because the module is where those live and an action that re-implemented a rule
 * would be the second implementation that drifts.
 *
 * ## Why every action resolves the panel again
 *
 * The shell resolved the same cookie a moment ago, and this is the same one indexed
 * read, done again because the resolution is not serialisable across the render
 * boundary (`session.ts` says so at the shell). The re-resolution is the security
 * property: an action cannot be invoked without a session the panel accepts, and the
 * `panel` argument is what keeps an action from being a door into another panel's
 * surface — `resolveStaffPanel('reception')` refuses a doctor's token, and the
 * refusal is a `TenantResolutionError` the caller renders as a sentence rather than
 * as a navigation.
 *
 * ## Why the money never crosses the boundary
 *
 * `priceAtBooking` and `depositAmount` are read from the service row inside the
 * transaction, and nothing the caller sends is used for either. The desk's
 * `SECRETARY_EDIT_PRICE` toggle is off by default (`06-constants.md` §4.4), and an
 * action that accepted a price from the request would be an action where the toggle
 * is not enforced — the module's own signature requires the amounts, and the
 * *source* of the amounts is where the policy lives.
 *
 * ## Why failures are sentences and never exceptions
 *
 * An action's contract is a result a component renders. A thrown error surfaces as
 * the framework's own error page, which is English and unhelpful and loses the
 * sentence the module raised on purpose — so every call is wrapped and the key
 * becomes Persian through `appointmentsFailureMessage`. The one thing that is not
 * caught is a bug the product wants to see.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { AppointmentSource } from '@/core/constants'
import { asLocalDate, asLocalTime } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import {
  blockHours,
  bookAppointment,
  bookOwnAppointment,
  cancelAppointment,
  recordArrival,
  recordNoShow,
  recordResult,
} from '@/modules/appointments'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

import { appointmentsFailureMessage, resolveCustomerId } from './support'

/** The answer every action gives: the row it wrote, or the sentence to render. */
export type ActionResult =
  | { readonly ok: true; readonly appointmentId: string }
  | { readonly ok: false; readonly message: string }

/** The fields the booking popup collects, before the action derives the rest. */
export interface BookingInput {
  readonly doctorId: string
  readonly serviceId: string
  readonly localDate: string
  readonly localTime: string
  readonly customerId?: string
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
}

/** The fields the slot-block popup collects. */
export interface BlockInput {
  readonly doctorId: string
  readonly localDate: string
  readonly localTime: string
  readonly durationMinutes: number
  readonly reason?: string
}

/**
 * The arguments a block runs with: the scoped transaction, the permission context the
 * module functions take, and the membership's own facts.
 */
interface ScopeArgs {
  readonly tx: Parameters<Parameters<typeof runInTenantScope<unknown>>[2]>[0]
  /** Hand this to a module function as its `ctx`; it is what `requirePermission` reads. */
  readonly ctx: TenantContext
  readonly tenantId: string
  readonly userId: string
}

/**
 * Runs a block in the caller's tenant scope and answers with a sentence on failure.
 *
 * One helper because the shape is every action's: resolve, scope, call, revalidate.
 * The `panel` is the caller's own and reaches the resolution, which is what keeps
 * the doctor's quick-book from being callable with a secretary's token.
 */
async function inTenantScope<T>(
  panel: Panel,
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(panel)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions, tenantId: session.tenantId, userId: session.permissions.userId }),
  ).catch((error: unknown) => ({ ok: false, message: appointmentsFailureMessage(error) } as const))
}

/**
 * Re-renders the three pages the action changed, so the row the person just wrote is
 * on the grid when the popup closes.
 *
 * The three paths are the three surfaces of `02-architecture.md` §9, and revalidating
 * all three is cheaper than deciding which one the caller is looking at — an action
 * is invoked from any of them.
 */
function revalidateAppointments(): void {
  revalidatePath('/reception/appointments')
  revalidatePath('/admin/appointments')
  revalidatePath('/doctor')
}

/**
 * «نوبت جدید» — books an appointment from the reception desk.
 *
 * The amounts come from the service row and from nowhere else (see the header), and
 * the customer is resolved by mobile because the mobile is the identity.
 */
export async function createBookingAction(
  panel: Panel,
  input: BookingInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    const service = await tx.service.findUniqueOrThrow({
      where: { id: input.serviceId },
      select: { price: true, depositAmount: true, durationMinutes: true },
    })
    const customerId =
      input.customerId ??
      (await resolveCustomerId({
        tx,
        tenantId,
        mobile: input.mobile,
        firstName: input.firstName,
        lastName: input.lastName,
      }))

    const created = await bookAppointment({
      tx,
      ctx,
      clinicId: ctx.clinicId ?? '',
      doctorId: input.doctorId,
      customerId,
      serviceId: input.serviceId,
      localDate: asLocalDate(input.localDate),
      localTime: asLocalTime(input.localTime),
      durationMinutes: service.durationMinutes,
      priceAtBooking: service.price,
      depositAmount: service.depositAmount,
      source: AppointmentSource.Reception,
    })
    return created
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

/**
 * The doctor's quick-book shortcut — the same row, from the doctor's own panel.
 *
 * Refused server-side when the `DOCTOR_SELF_BOOKING` toggle is off (DoD 9), which is
 * the module's own check on the settings the action never sees.
 */
export async function quickBookAction(panel: Panel, input: BookingInput): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId, userId }) => {
    const service = await tx.service.findUniqueOrThrow({
      where: { id: input.serviceId },
      select: { price: true, depositAmount: true, durationMinutes: true },
    })
    const customerId =
      input.customerId ??
      (await resolveCustomerId({
        tx,
        tenantId,
        mobile: input.mobile,
        firstName: input.firstName,
        lastName: input.lastName,
      }))

    const created = await bookOwnAppointment({
      tx,
      ctx,
      clinicId: ctx.clinicId ?? '',
      doctorId: userId,
      customerId,
      serviceId: input.serviceId,
      localDate: asLocalDate(input.localDate),
      localTime: asLocalTime(input.localTime),
      durationMinutes: service.durationMinutes,
      priceAtBooking: service.price,
      depositAmount: service.depositAmount,
      source: AppointmentSource.Reception,
    })
    return created
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

/**
 * «بستن یک ساعت» — closes a slot the desk does not want offered.
 */
export async function blockHoursAction(panel: Panel, input: BlockInput): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const created = await blockHours({
      tx,
      ctx,
      clinicId: ctx.clinicId ?? '',
      doctorId: input.doctorId,
      localDate: asLocalDate(input.localDate),
      localTime: asLocalTime(input.localTime),
      durationMinutes: input.durationMinutes,
      reason: input.reason,
    })
    return created
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

/**
 * «حاضر شد» — the reception desk marking the person in the chair.
 */
export async function markArrivedAction(panel: Panel, appointmentId: string): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    return recordArrival({ tx, ctx, appointmentId, now: realClock() })
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

/**
 * «انجام شد» — the outcome that starts a cycle, recorded from the desk.
 */
export async function recordResultAction(
  panel: Panel,
  appointmentId: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    return recordResult({ tx, ctx, appointmentId, now: realClock() })
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

/**
 * «عدم حضور» — the person did not come.
 */
export async function markNoShowAction(
  panel: Panel,
  appointmentId: string,
  reason?: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    return recordNoShow({ tx, ctx, appointmentId, reason, now: realClock() })
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

/**
 * «لغو نوبت» — closes the row and releases the slot.
 */
export async function cancelAppointmentAction(
  panel: Panel,
  appointmentId: string,
  reason?: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await cancelAppointment({
      tx,
      ctx,
      appointmentId,
      reason,
      now: realClock(),
    })
    return { id: appointmentId }
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}
