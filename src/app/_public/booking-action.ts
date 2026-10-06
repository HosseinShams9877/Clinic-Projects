/**
 * The public site's two Server Actions — the booking and the slot read.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and an action is composition
 * of the most literal kind: it resolves the tenant from the host, opens the tenant
 * scope, calls the module's barrel and hands back a sentence. It runs no business rule
 * of its own — not one permission check, not one holiday question, not one deposit
 * question — because the module is where those live and an action that re-implemented a
 * rule would be the second implementation that drifts.
 *
 * ## Why the tenant is resolved and never received
 *
 * The public site has no session, so the tenant is the host's fact and `resolveTenantId`
 * is the only reader. A body that named a tenant would be a body nothing reads, and an
 * action that trusted one would be the forgery §11's "tenant context is resolved, never
 * received" exists to prevent.
 *
 * ## Why the booking goes through the appointments module and not around it
 *
 * The holiday gate, the deposit gate, the slot's uniqueness and the row's own shape are
 * the appointments module's, and a public path with its own writer would be a second
 * implementation of every one. The module exports `bookPublicAppointment` for exactly
 * this caller: the same guards and the same sentences, with the staff permission
 * replaced by the principal the action names. The action never reaches a private
 * function, and the check the specification demands stays exactly where it is.
 *
 * ## Why failures are sentences and never exceptions
 *
 * An action's contract is a result the island renders. A thrown error surfaces as the
 * framework's own error page, which is English and unhelpful and loses the Persian
 * sentence the module raised on purpose — so every call is wrapped and the key becomes
 * a sentence through the catalog. The one thing that is not caught is a bug the product
 * wants to see.
 *
 * ## Why the slot read is an action and not a client fetch
 *
 * The wizard's second step needs the slots the real engine generated, and the engine is
 * a server-only module function. A `fetch` to an API route would be a second surface
 * with its own tenant resolution and its own error shape; an action is the one the
 * booking already uses, and the two share the scope and the sentences.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import { AppointmentSource } from '@/core/constants'
import { asLocalDate, asLocalTime, type LocalDate } from '@/core/localization'
import { asTenantId, asUserId, type ClinicId, ValidationError } from '@/core/types'
import { createOrFindCustomer } from '@/modules/customers'
import { bookPublicAppointment as createPublicBooking, type PublicBookingContext } from '@/modules/appointments'
import { loadBookableService } from '@/modules/services'

import { publicSlotsForDay, PUBLIC_FAILURES } from '@/modules/public-site'

/** A slot the wizard may offer, as the action hands it to the island. */
export interface PublicSlot {
  readonly time: string
  readonly durationMinutes: number
}

/** The booking's answer: the row it wrote, or the sentence to render. */
export type PublicBookingResult =
  | {
      readonly ok: true
      readonly appointmentId: string
      readonly localDate: string
      readonly localTime: string
      readonly cycle: {
        readonly currentSession: number
        readonly totalSessions: number
        readonly intervalDays: number
      } | null
    }
  | { readonly ok: false; readonly message: string }

/** The failure shape the island holds while it re-renders the form. */
export type PublicBookingFailure = Extract<PublicBookingResult, { readonly ok: false }>

/** A context the public site acts under: a tenant, and no permissions at all. */
function publicContext(tenantId: string): PublicBookingContext {
  return {
    tenantId: asTenantId(tenantId),
    clinicId: null as ClinicId | null,
    role: 'public',
    userId: asUserId('public'),
    overrides: { granted: [], revoked: [] },
  }
}

/**
 * «رزرو نوبت» — the wizard's submit.
 *
 * The service is read by id and not trusted from the body's price: `loadBookableService`
 * is the gate that makes a deactivation bite on the write path, and the amounts the row
 * snapshots come from the row and from nowhere else. The customer is resolved by mobile
 * because the mobile is the identity the whole file is keyed on, and a booking against
 * an existing lead is the lead's conversion — the same one the desk's booking performs.
 */
export async function bookPublicAppointment(args: {
  readonly serviceId: string
  readonly doctorId: string
  readonly localDate: LocalDate
  readonly localTime: string
  readonly firstName: string
  readonly lastName: string
  readonly mobile: string
  readonly note: string
}): Promise<PublicBookingResult> {
  const tenantId = await resolveTenantId()
  if (tenantId === null) return { ok: false, message: PUBLIC_FAILURES.tenantUnknown }

  try {
    return await runInTenantScope(publicContext(tenantId), prisma(), async (tx) => {
      const ctx = publicContext(tenantId)
      const service = await loadBookableService({ tx, ctx, serviceId: args.serviceId })

      const customer = await createOrFindCustomer({
        tx,
        ctx,
        mobile: args.mobile,
        firstName: args.firstName,
        lastName: args.lastName === '' ? undefined : args.lastName,
        acquisitionSource: AppointmentSource.Website,
      })

      const created = await createPublicBooking({
        tx,
        ctx,
        clinicId: ctx.clinicId ?? '',
        doctorId: args.doctorId,
        customerId: customer.id,
        serviceId: service.id,
        localDate: args.localDate,
        localTime: asLocalTime(args.localTime),
        durationMinutes: service.durationMinutes,
        priceAtBooking: service.price,
        depositAmount: service.depositAmount,
        source: AppointmentSource.Website,
      })

      revalidatePath('/booking')
      revalidatePath('/service/[id]')

      return {
        ok: true as const,
        appointmentId: created.id,
        localDate: created.localDate,
        localTime: created.localTime,
        cycle: null,
      }
    })
  } catch (error: unknown) {
    return { ok: false, message: bookingFailureMessage(error) }
  }
}

/**
 * The wizard's second step: the slots the real engine has for one service and one day.
 *
 * An empty answer is a day with no free time and not an error, so the action resolves it
 * and the island renders the catalog's «وقت خالی وجود ندارد». The holiday is inside the
 * engine, which is why a holiday the clinic does not book answers with the same empty
 * list and not with a sentence the engine never raised.
 */
export async function fetchPublicSlots(args: {
  readonly serviceId: string
  readonly doctorId: string
  readonly localDate: LocalDate
}): Promise<readonly PublicSlot[]> {
  const tenantId = await resolveTenantId()
  if (tenantId === null) return []
  if (args.doctorId === '') return []

  return runInTenantScope(publicContext(tenantId), prisma(), (tx) =>
    publicSlotsForDay({
      tx,
      tenantId,
      clinicId: null,
      doctorId: args.doctorId,
      serviceId: args.serviceId,
      localDate: args.localDate,
    }),
  )
}

/** A thrown error as the Persian sentence the island renders. */
function bookingFailureMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    return PUBLIC_FAILURES.incomplete
  }
  if (error instanceof Error && 'messageKey' in error) {
    return publicFailureSentence((error as { readonly messageKey: string }).messageKey)
  }
  return PUBLIC_FAILURES.booking.unknown
}

/** The module's own keys, mapped to the catalog's sentences for the public reader. */
function publicFailureSentence(messageKey: string): string {
  const failures = PUBLIC_FAILURES.booking
  switch (messageKey) {
    case 'appointment.slotTaken':
      return failures.slotTaken
    case 'appointment.closed':
      return failures.closed
    case 'appointment.depositRequired':
      return failures.depositRequired
    case 'service.notBookable':
      return failures.notBookable
    case 'customer.mobileInvalid':
      return PUBLIC_FAILURES.mobileInvalid
    default:
      return failures.unknown
  }
}

export { asLocalDate }
