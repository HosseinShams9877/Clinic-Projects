/**
 * The appointments Server Actions — the write half of the three pages.
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
  updateAppointment,
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
  readonly customerId?: string
  readonly mobile?: string
  readonly firstName?: string
  readonly lastName?: string
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

/** The fields the edit popup collects — each optional, the row keeps what is omitted. */
export interface EditInput {
  readonly appointmentId: string
  readonly doctorId?: string
  readonly serviceId?: string
  readonly localDate?: string
  readonly localTime?: string
  readonly durationMinutes?: number
}

interface ScopeArgs {
  readonly tx: Parameters<Parameters<typeof runInTenantScope<unknown>>[2]>[0]
  readonly ctx: TenantContext
  readonly tenantId: string
  readonly userId: string
}

async function inTenantScope<T>(
  panel: Panel,
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(panel)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions, tenantId: session.tenantId, userId: session.permissions.userId }),
  ).catch((error: unknown) => ({ ok: false as const, message: appointmentsFailureMessage(error) }))
}

function revalidateAppointments(): void {
  revalidatePath('/reception/appointments')
  revalidatePath('/admin/appointments')
  revalidatePath('/doctor')
}

function revalidateCycles(): void {
  revalidatePath('/reception/cycles')
  revalidatePath('/admin/cycles')
  revalidatePath('/doctor/cycles')
}

function revalidateCampaigns(): void {
  revalidatePath('/admin/campaigns')
}

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

export async function markArrivedAction(panel: Panel, appointmentId: string): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    return recordArrival({ tx, ctx, appointmentId, now: realClock() })
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

export async function recordResultAction(
  panel: Panel,
  appointmentId: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const completed = await recordResult({ tx, ctx, appointmentId, now: realClock() })

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

export async function updateAppointmentAction(panel: Panel, input: EditInput): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const updated = await updateAppointment({
      tx,
      ctx,
      appointmentId: input.appointmentId,
      doctorId: panel === 'admin' ? input.doctorId : undefined,
      serviceId: input.serviceId,
      newLocalDate: input.localDate === undefined ? undefined : asLocalDate(input.localDate),
      newLocalTime: input.localTime === undefined ? undefined : asLocalTime(input.localTime),
      durationMinutes: input.durationMinutes,
    })
    return updated
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  revalidateCycles()
  return { ok: true, appointmentId: result.id }
}