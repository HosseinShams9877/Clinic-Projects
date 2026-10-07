/**
 * The customer's own appointments — `09-security.md` §7's panel half of this module.
 *
 * The three functions the account panel's `appointments.html` is built on. They are
 * a second surface over the same rows `lib/book.ts` serves the desk, and the
 * difference between the two is the whole of §7: **a customer's scope is their own
 * `customerId`, and not a capability.** The desk's `cancelAppointment` opens with
 * `requirePermission(ctx, 'manage_appointments')`; these open with a `where` clause
 * that intersects the tenant with the session's own customer id, which is the same
 * rule expressed as a query instead of as a permission.
 *
 * ## Why the 404 is the only other-customer answer
 *
 * `09-security.md` §6.3's 404-not-403 rule applies to a customer in its strongest
 * form: a 403 would confirm that another person's appointment exists at this clinic,
 * which is a disclosure the panel must not make to a customer who has no reason to
 * know it. The scoping is therefore in the query and never in a guard after it, so
 * another customer's row is absent from the read rather than present-then-refused.
 *
 * ## Why the customer may cancel only inside a window
 *
 * The desk may cancel at any instant, because the desk is rescheduling the room. A
 * customer cancelling at the last minute leaves a slot the clinic cannot fill, so
 * the customer's cancellation is bounded by a policy window: the session has to be
 * further away than `CUSTOMER_CANCEL_WINDOW_MS`. Outside it the refusal names the
 * fix, which is to call the clinic — the desk can still do what the customer cannot.
 *
 * ## Why the deposit policy is not applied here
 *
 * `cancelAppointment` deliberately records only the state a refund is decided from,
 * because the money is the `payments` module's, and this cancellation is the same
 * rule for the same reason. The amount the panel promises back is composed by the
 * Server Action that called this, through `payments`' own `readPaymentSettings` and
 * `refundAmountFor`, from the deposit this returns — so the policy is still the
 * `payments` module's reading and not a second derivation of it, and this module
 * stays a scheduling concern. Keeping `payments` out of this file has a second,
 * concrete reason: the barrel this surface ships through is reached by a client
 * component (the public booking wizard's `weekDays`), and `payments`' barrel
 * transitively reaches `@/core/db`'s `AsyncLocalStorage`, which is a Node module a
 * browser chunk cannot carry.
 */

import { AppointmentStatus, PaymentKind } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import { type LocalDate, type LocalTime } from '@/core/localization'
import { asClinicId, asTenantId, asUserId, DomainError, NotFoundError } from '@/core/types'

import type { AppointmentsMessageKey } from '../catalog'
import { assertTransition } from './status'
import { bookPublicAppointment, type PublicBookingContext } from './book'

/** A stored status, as the state machine's own type. */
function asStatus(value: string): AppointmentStatus {
  return value as AppointmentStatus
}

/**
 * How close to a session a customer may still cancel.
 *
 * A constant rather than a settings row, because the settings surface is Phase 10's
 * and the policy this phase ships is the one the panel names in its refusal; the
 * window is 24 hours, which is the notice a clinic needs to offer the slot again.
 */
export const CUSTOMER_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

/** The appointment columns the panel's two lists render. */
const OWN_SELECT = {
  id: true,
  scheduledAt: true,
  localDate: true,
  localTime: true,
  status: true,
  durationMinutes: true,
  priceAtBooking: true,
  depositAmount: true,
  clinicId: true,
  doctorId: true,
  service: { select: { name: true } },
  doctor: { select: { firstName: true, lastName: true } },
} as const

/** One of the customer's own appointments, as the panel renders it. */
export interface OwnAppointmentRow {
  readonly id: string
  readonly scheduledAt: Date
  readonly localDate: string
  readonly localTime: string
  readonly status: string
  readonly durationMinutes: number
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly serviceName: string | null
  readonly doctorName: string | null
}

/** The two halves of the panel's list, split by the clock the caller injected. */
export interface OwnAppointmentHistory {
  /** Future and in-progress sessions, soonest first. */
  readonly upcoming: readonly OwnAppointmentRow[]
  /** Finished, cancelled and missed sessions, newest first. */
  readonly past: readonly OwnAppointmentRow[]
}

/**
 * «نوبت‌های من» — the customer's own sessions, split at `now`.
 *
 * The split is a comparison against the injected clock rather than against the wall,
 * because the boundary between "upcoming" and "past" is the same boundary the
 * cancellation policy measures, and the two have to be one fact about one instant.
 */
export async function customerAppointments(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly now: Date
}): Promise<OwnAppointmentHistory> {
  const rows = await args.tx.appointment.findMany({
    where: { tenantId: args.tenantId, customerId: args.customerId, isSlotBlock: false },
    orderBy: { scheduledAt: 'desc' },
    take: 60,
    select: OWN_SELECT,
  })

  const mapped = rows.map((row) => asOwnRow(row))
  return {
    upcoming: mapped.filter((row) => row.scheduledAt.getTime() >= args.now.getTime()).reverse(),
    past: mapped.filter((row) => row.scheduledAt.getTime() < args.now.getTime()),
  }
}

/**
 * «لغو نوبت» — closes the customer's own session inside the policy window.
 *
 * @throws NotFoundError — the appointment is not this customer's, which is the
 *   404-not-403 answer §6.3 gives a horizontal reach.
 * @throws DomainError, as `appointment.customerCancelWindowClosed` — the session is
 *   closer than the policy window, and the fix is to call the clinic.
 * @throws DomainError, as `appointment.illegalTransition` — the session has already
 *   moved to a state a cancellation cannot follow.
 */
export async function cancelOwnAppointment(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  /** The session's customer; never an input. */
  readonly customerId: string
  readonly appointmentId: string
  readonly now: Date
}): Promise<CustomerCancellation> {
  const current = await loadOwnAppointment(args.tx, args.tenantId, args.customerId, args.appointmentId)

  if (current.scheduledAt.getTime() - args.now.getTime() < CUSTOMER_CANCEL_WINDOW_MS) {
    throw new DomainError(
      `Appointment ${current.id} starts inside the customer cancellation window.`,
      {
        messageKey: 'appointment.customerCancelWindowClosed' satisfies AppointmentsMessageKey,
        detail: { appointmentId: current.id },
      },
    )
  }

  assertTransition(asStatus(current.status), AppointmentStatus.Cancelled)

  await args.tx.appointment.update({
    where: { id: current.id },
    data: {
      status: AppointmentStatus.Cancelled,
      cancelledAt: args.now,
      cancelReason: 'customer-panel',
      slotKey: null,
    },
  })

  // The deposit the clinic received is the fact the refund is decided from. The
  // decision itself is the `payments` module's, and it is made by the Server Action
  // that called this — not here — for the same reason the desk's `cancelAppointment`
  // makes it nowhere near this module: a `payments` row names the staff member who
  // recorded it, and the reading of the policy is a money concern and not a
  // scheduling one.
  const received = await depositReceived(args.tx, args.tenantId, current.id)

  return Object.freeze({
    appointmentId: current.id,
    cancelledAt: args.now,
    depositReceived: received,
  })
}

/**
 * «جابه‌جایی نوبت» — moves the customer's own session to a new slot.
 *
 * The new row goes through the public booking path, which is the one this module
 * already keeps for a caller with no membership: the same day, deposit and slot
 * guards the public site's wizard runs, so a customer cannot move a session into a
 * slot the clinic closed or a time another customer holds. The old row closes as
 * `RESCHEDULED` and links to the new one, exactly as the desk's reschedule does.
 *
 * @throws NotFoundError — the appointment is not this customer's.
 * @throws DomainError, as the booking path's own keys — the slot was taken or the
 *   day is closed.
 */
export async function rescheduleOwnAppointment(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  /** The session's customer; never an input. */
  readonly customerId: string
  readonly appointmentId: string
  readonly newLocalDate: LocalDate
  readonly newLocalTime: LocalTime
}): Promise<{ readonly id: string; readonly localDate: string; readonly localTime: string }> {
  const current = await loadOwnAppointment(args.tx, args.tenantId, args.customerId, args.appointmentId)

  if (current.serviceId === null) {
    throw new DomainError(`Appointment ${current.id} holds no service to reschedule.`, {
      messageKey: 'appointment.illegalTransition' satisfies AppointmentsMessageKey,
      detail: { appointmentId: current.id },
    })
  }

  const created = await bookPublicAppointment({
    tx: args.tx,
    ctx: panelBookingContext(args.tenantId, current.clinicId),
    clinicId: current.clinicId,
    doctorId: current.doctorId,
    customerId: args.customerId,
    serviceId: current.serviceId,
    localDate: args.newLocalDate,
    localTime: args.newLocalTime,
    durationMinutes: current.durationMinutes,
    priceAtBooking: current.priceAtBooking,
    depositAmount: 0n,
    source: current.source ?? 'reception',
    cycleId: current.cycleId ?? undefined,
  })

  await args.tx.appointment.update({
    where: { id: current.id },
    data: {
      status: AppointmentStatus.Rescheduled,
      rescheduledToId: created.id,
      slotKey: null,
    },
  })

  return created
}

/** The outcome a cancellation hands the panel: what closed, and what the clinic held. */
export interface CustomerCancellation {
  readonly appointmentId: string
  readonly cancelledAt: Date
  /** The deposit the clinic received on this session, which is what a refund hands back. */
  readonly depositReceived: bigint
}

/**
 * Loads one appointment as this customer's own.
 *
 * The `customerId` in the `where` is the whole of §7: it is the session's, so a
 * request that named another customer's appointment finds nothing and the caller
 * receives the 404 the module raises for a row it cannot see.
 */
async function loadOwnAppointment(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
  appointmentId: string,
): Promise<{
  readonly id: string
  readonly clinicId: string
  readonly doctorId: string
  readonly serviceId: string | null
  readonly cycleId: string | null
  readonly status: string
  readonly scheduledAt: Date
  readonly durationMinutes: number
  readonly priceAtBooking: bigint
  readonly source: string | null
}> {
  const row = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId, customerId },
    select: {
      id: true,
      clinicId: true,
      doctorId: true,
      serviceId: true,
      cycleId: true,
      status: true,
      scheduledAt: true,
      durationMinutes: true,
      priceAtBooking: true,
      source: true,
    },
  })
  if (row === null) {
    throw new NotFoundError(`Appointment ${appointmentId} is not this customer's.`, {
      messageKey: 'appointment.notFound' satisfies AppointmentsMessageKey,
      detail: { appointmentId },
    })
  }
  return row
}

/** The deposit the clinic received on a session, which is what a refund hands back. */
async function depositReceived(
  tx: TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<bigint> {
  const received = await tx.payment.aggregate({
    where: { tenantId, appointmentId, kind: PaymentKind.Deposit },
    _sum: { amount: true },
  })
  return received._sum.amount ?? 0n
}

/** A row the panel renders, with the doctor's name assembled as the profile does. */
function asOwnRow(row: {
  readonly id: string
  readonly scheduledAt: Date
  readonly localDate: string
  readonly localTime: string
  readonly status: string
  readonly durationMinutes: number
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly service: { readonly name: string | null } | null
  readonly doctor: { readonly firstName: string; readonly lastName: string | null }
}): OwnAppointmentRow {
  return Object.freeze({
    id: row.id,
    scheduledAt: row.scheduledAt,
    localDate: row.localDate,
    localTime: row.localTime,
    status: row.status,
    durationMinutes: row.durationMinutes,
    priceAtBooking: row.priceAtBooking,
    depositAmount: row.depositAmount,
    serviceName: row.service?.name ?? null,
    doctorName:
      row.doctor.lastName === null ? row.doctor.firstName : `${row.doctor.firstName} ${row.doctor.lastName}`,
  })
}

/**
 * The principal the panel books under — the customer's own scope, as the public
 * site's context is the site's.
 *
 * `role: 'public'` because the customer holds none of the three, and the booking
 * path asks the principal only for the tenant and the clinic; the permission
 * primitive is not consulted on this path, which is the honest reading of §7 rather
 * than a bypass of the check the desk's path keeps.
 */
function panelBookingContext(tenantId: string, clinicId: string): PublicBookingContext {
  return Object.freeze({
    tenantId: asTenantId(tenantId),
    clinicId: asClinicId(clinicId),
    role: 'public',
    userId: asUserId('customer-panel'),
    overrides: EMPTY_PERMISSION_OVERRIDES,
  })
}

