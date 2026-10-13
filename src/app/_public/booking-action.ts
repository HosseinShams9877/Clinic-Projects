/**
 * The public site's Server Actions — the booking, the slot read, and the doctors.
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
 * ## Why the clinic is resolved too
 *
 * `ClinicShift` is keyed on `clinicId`, and the booking engine reads it to decide the
 * day's bookable window. The public site has no branch picker yet, so the action asks
 * `resolvePublicContext` for the tenant's first active clinic — one branch for a
 * single-branch clinic, the first alphabetically for a multi-branch one — and hands
 * the id to the module. Without it the day would resolve to no shift and every slot
 * would be refused for the wrong reason.
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
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { resolvePublicContext } from '@/app/_shell/tenant'
import { AppointmentSource } from '@/core/constants'
import { asLocalDate, asLocalTime, type LocalDate } from '@/core/localization'
import { asTenantId, asUserId, type ClinicId, ValidationError } from '@/core/types'
import { createOrFindCustomer } from '@/modules/customers'
import { bookPublicAppointment as createPublicBooking, type PublicBookingContext } from '@/modules/appointments'
import { loadBookableService } from '@/modules/services'

import { publicDoctorsForService, publicServiceDeposit, publicSlotsForDay, PUBLIC_FAILURES } from '@/modules/public-site'

/** A slot the wizard may offer, as the action hands it to the island. */
export interface PublicSlot {
  readonly time: string
  readonly durationMinutes: number
}

/** A doctor the wizard may offer, as the action hands it to the island. */
export interface PublicDoctorOption {
  readonly id: string
  readonly name: string
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

/** A context the public site acts under: a tenant, a clinic, and no permissions. */
function publicContext(tenantId: string, clinicId: string | null): PublicBookingContext {
  return {
    tenantId: asTenantId(tenantId),
    clinicId: clinicId as ClinicId | null,
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
  const resolved = await resolvePublicContext()
  if (resolved === null) return { ok: false, message: PUBLIC_FAILURES.tenantUnknown }

  try {
    return await runInTenantScope(
      publicContext(resolved.tenantId, resolved.clinicId),
      prisma(),
      async (tx) => {
        const ctx = publicContext(resolved.tenantId, resolved.clinicId)
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
          clinicId: resolved.clinicId ?? '',
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

        // Revalidate every surface that names this booking: the public booking page,
        // the desk's day grid, the manager's oversight, and the doctor's own home.
        // A public booking is a write the desk must see the moment its page next
        // renders — without these paths the grid keeps serving the cache it built
        // before the row existed.
        revalidatePath('/booking')
        revalidatePath('/reception/appointments')
        revalidatePath('/admin/appointments')
        revalidatePath('/doctor')

        return {
          ok: true as const,
          appointmentId: created.id,
          localDate: created.localDate,
          localTime: created.localTime,
          cycle: null,
        }
      },
    )
  } catch (error: unknown) {
    return { ok: false, message: bookingFailureMessage(error) }
  }
}

/**
 * The wizard's third step: the slots the real engine has for one service, one doctor
 * and one day.
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
  const resolved = await resolvePublicContext()
  if (resolved === null) return []
  if (args.doctorId === '') return []

  return runInTenantScope(
    publicContext(resolved.tenantId, resolved.clinicId),
    prisma(),
    (tx) =>
      publicSlotsForDay({
        tx,
        tenantId: resolved.tenantId,
        clinicId: resolved.clinicId,
        doctorId: args.doctorId,
        serviceId: args.serviceId,
        localDate: args.localDate,
      }),
  )
}

/**
 * The wizard's second step: the doctors who perform one service.
 *
 * An empty answer is a service with no doctors assigned and not an error, so the
 * action resolves it and the island renders the catalog's `doctorsEmpty` sentence.
 */
export async function fetchDoctorsForService(
  serviceId: string,
): Promise<readonly PublicDoctorOption[]> {
  const resolved = await resolvePublicContext()
  if (resolved === null) return []

  return runInTenantScope(
    publicContext(resolved.tenantId, resolved.clinicId),
    prisma(),
    (tx) => publicDoctorsForService(tx, resolved.tenantId, serviceId),
  )
}

/**
 * The deposit a service carries, for the wizard's deposit notice.
 *
 * The wizard shows the amount the clinic will ask for before the visitor picks a
 * doctor. The action resolves `null` for a service the clinic does not offer — the
 * wizard shows its own empty list in that case — and the amount itself is a `bigint`
 * the island renders through `formatMoney`.
 */
export async function fetchServiceDeposit(serviceId: string): Promise<bigint | null> {
  const resolved = await resolvePublicContext()
  if (resolved === null) return null

  return runInTenantScope(
    publicContext(resolved.tenantId, resolved.clinicId),
    prisma(),
    (tx) => publicServiceDeposit(tx, resolved.tenantId, serviceId),
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