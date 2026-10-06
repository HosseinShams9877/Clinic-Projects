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
 * ## Why the campaign attribution lives here and not in the module
 *
 * `attributeAppointmentToCampaign` belongs to `campaigns`, which imports `messages`,
 * which reaches `@node-rs/argon2` — a Node-only module. The appointments *module* is
 * reachable from client components (the booking dialog), so the attribution cannot
 * live in `book.ts`: a static import there puts argon2 in the browser graph and
 * `next build` fails. This action is server-only, so the attribution runs here, in
 * the same transaction that wrote the booking row, immediately after the row exists.
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
 * ## Why the service comes from `services` and not from the table
 *
 * The row is read through `loadBookableService`, which is the gate that makes a
 * deactivation bite on the write path (Phase 3's DoD 4): an inactive service is
 * refused with `service.notBookable` no matter what the posted form named. Reading
 * the row directly would have been one line fewer and a rule the catalogue did not
 * keep.
 *
 * ## Why the cycle is handed to `cycles` and never reached for
 *
 * `recordResult` returns the completed session's own facts, and this file hands them to
 * `cycles`' `recordCompletedSession` inside the same transaction. The two modules do not
 * touch each other's tables: the appointment row is the appointments module's, the
 * cycle row is the cycles module's, and the boundary between them is a value passed
 * across. A booking that continues a course takes the cycle off the desk's list the
 * same way — `noteCycleBooking`, in the same transaction as the slot it wrote.
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
import { ValidationError } from '@/core/types'
import {
  blockHours,
  bookAppointment,
  bookOwnAppointment,
  cancelAppointment,
  recordArrival,
  recordNoShow,
  recordResult,
} from '@/modules/appointments'
import { attributeAppointmentToCampaign } from '@/modules/campaigns'
import { loadBookableService } from '@/modules/services'
import { noteCycleBooking, recordCompletedSession } from '@/modules/cycles'
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
  /**
   * The customer's id, when the caller already holds it — a cycle's next session is
   * booked for the customer the row names, and the id is the row's own.
   */
  readonly customerId?: string
  /** The mobile the desk typed, used to find or create the customer when no id is given. */
  readonly mobile?: string
  readonly firstName?: string
  readonly lastName?: string
  /**
   * The cycle this session continues, when the desk books from the contact list.
   *
   * Carried onto the row so the completed session finds its course through the first
   * anchor (`cycles`' `resolveCycleId`), and used after the write to take the cycle off
   * the desk's list in the same request that booked it — rule 5's first exit.
   */
  readonly cycleId?: string
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
 * Re-renders the three cycle pages a completion or a booking moved.
 *
 * A completed session changes a cycle's counts and its due date, and a booking from the
 * contact list takes the cycle off it — so the desk's list and the manager's oversight
 * are both stale after either write. Revalidating the paths is what keeps the page the
 * person closes and the page they open next from disagreeing.
 */
function revalidateCycles(): void {
  revalidatePath('/reception/cycles')
  revalidatePath('/admin/cycles')
  revalidatePath('/doctor/cycles')
}

/**
 * Re-renders the manager's campaign page, which the attribution may have moved.
 *
 * The attribution links an appointment to a campaign, and the manager's results table
 * names the resulting count. A booking that attributed is a count the table must show,
 * so the path is revalidated on the same rule as the three above.
 */
function revalidateCampaigns(): void {
  revalidatePath('/admin/campaigns')
}

/**
 * The customer a booking is for — the id a caller already holds, or the mobile the desk
 * typed.
 *
 * The two callers of `BookingInput` are two shapes of the same question: the popup
 * resolves a person by mobile because the mobile is the identity the desk knows, and a
 * cycle's next session is booked for the customer the row already names. One helper
 * because the two must not drift into two ways of finding a customer in one action.
 *
 * @throws ValidationError — neither an id nor a mobile was given, which is a caller the
 *   popup cannot produce and the cycle form cannot reach either.
 */
async function resolveBookingCustomer(args: {
  readonly tx: ScopeArgs['tx']
  readonly ctx: TenantContext
  readonly input: BookingInput
}): Promise<string> {
  if (args.input.customerId !== undefined) return args.input.customerId
  if (args.input.mobile === undefined || args.input.firstName === undefined) {
    throw new ValidationError('A booking needs either a customer id or a mobile and a first name.', {
      messageKey: 'error.unhandledCase',
      detail: {},
    })
  }

  return resolveCustomerId({
    tx: args.tx,
    ctx: args.ctx,
    mobile: args.input.mobile,
    firstName: args.input.firstName,
    lastName: args.input.lastName,
  })
}

/**
 * «نوبت جدید» — books an appointment from the reception desk.
 *
 * The amounts come from the service row and from nowhere else (see the header), and
 * the customer is resolved by mobile because the mobile is the identity.
 *
 * The attribution runs here and not in the module (see the header): the appointment
 * exists after `bookAppointment` returns, and the campaign that last reached the
 * customer is named by the source the desk sent.
 */
export async function createBookingAction(
  panel: Panel,
  input: BookingInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const service = await loadBookableService({ tx, ctx, serviceId: input.serviceId })
    const customerId = await resolveBookingCustomer({ tx, ctx, input })

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
      cycleId: input.cycleId,
    })

    await attributeAppointmentToCampaign({
      tx,
      tenantId: ctx.tenantId,
      appointmentId: created.id,
      customerId,
      source: AppointmentSource.Reception,
    })

    if (input.cycleId !== undefined) {
      // Rule 5's first exit, in the transaction that wrote the slot: the customer who
      // just booked is not a customer the desk should be calling.
      await noteCycleBooking({ tx, tenantId: ctx.tenantId, cycleId: input.cycleId })
    }
    return created
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  revalidateCycles()
  revalidateCampaigns()
  return { ok: true, appointmentId: result.id }
}

/**
 * The doctor's quick-book shortcut — the same row, from the doctor's own panel.
 *
 * Refused server-side when the `DOCTOR_SELF_BOOKING` toggle is off (DoD 9), which is
 * the module's own check on the settings the action never sees.
 */
export async function quickBookAction(panel: Panel, input: BookingInput): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, userId }) => {
    const service = await loadBookableService({ tx, ctx, serviceId: input.serviceId })
    const customerId = await resolveBookingCustomer({ tx, ctx, input })

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
      cycleId: input.cycleId,
    })

    await attributeAppointmentToCampaign({
      tx,
      tenantId: ctx.tenantId,
      appointmentId: created.id,
      customerId,
      source: AppointmentSource.Reception,
    })

    if (input.cycleId !== undefined) {
      await noteCycleBooking({ tx, tenantId: ctx.tenantId, cycleId: input.cycleId })
    }
    return created
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  revalidateCycles()
  revalidateCampaigns()
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
 *
 * The cycle is created here and not inside the appointments module: `recordResult`
 * answers the completed session's own facts, and this action hands them to the module
 * that owns the course, in the same transaction. The handoff is one directional — the
 * cycles module never reads an appointment through anything but its own relation, and
 * the appointments module never writes a cycle.
 */
export async function recordResultAction(
  panel: Panel,
  appointmentId: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const completed = await recordResult({ tx, ctx, appointmentId, now: realClock() })

    // A row the transition accepted is a real booking and holds both a customer and a
    // service — `loadTransitionRow` refuses slot blocks, which are the only rows that
    // do not. The branch is the schema's own invariant, stated so the facts the cycle
    // is built from are non-null where the cycle module reads them.
    if (completed.customerId !== null && completed.serviceId !== null) {
      await recordCompletedSession({
        tx,
        ctx,
        facts: {
          appointmentId: completed.id,
          customerId: completed.customerId,
          serviceId: completed.serviceId,
          doctorId: completed.doctorId,
          scheduledAt: completed.scheduledAt,
        },
        now: realClock(),
      })
    }
    return completed
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  revalidateCycles()
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