/**
 * The appointments Server Actions — the write half of the three pages.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { AppointmentSource } from '@/core/constants'
import { asLocalDate, asLocalTime, jalaliWeekday } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import { ValidationError } from '@/core/types'
import {
  blockHours,
  bookAppointment,
  bookOwnAppointment,
  cancelAppointment,
  clinicDay,
  doctorWindowsOnDay,
  recordArrival,
  recordNoShow,
  recordResult,
  slotMinutesForDoctor,
  updateAppointment,
} from '@/modules/appointments'
import { buildFreeSlots } from './page-data'
import { SLOT_PICKER } from './catalog'
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
  note?: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const completed = await recordResult({
      tx,
      ctx,
      appointmentId,
      note,
      now: realClock(),
    })

    if (completed.customerId !== null && completed.serviceId !== null) {
      // The cycle is a *consequence* of the completed session, not a condition of
      // it. A service the clinic never configured an interval for
      // (`defaultIntervalDays <= 0`) anchors no spacing, so `recordCompletedSession`
      // would refuse with `cycle.noInterval` — and refusing the *completion* for a
      // missing catalogue field would leave the appointment in `ARRIVED` while the
      // session was, in fact, completed. The check is therefore here, on the
      // completion's own path, so the appointment reaches `COMPLETED` whatever the
      // catalogue holds; the interval is the manager's to fix afterwards, and
      // `recordCompletedSession` keeps its own refusal for every other caller.
      const service = await tx.service.findFirst({
        where: { id: completed.serviceId, tenantId: ctx.tenantId },
        select: { defaultIntervalDays: true },
      })
      if (service !== null && service.defaultIntervalDays > 0) {
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

/**
 * The free slots of one doctor's day, for the edit dialog's time field.
 *
 * The edit dialog cannot use the day grid's own `freeSlotsByDoctorId` map for a
 * day the desk has moved to: that map is computed for **one day** (the grid's
 * anchor), and re-reading it would be a second server round trip the dialog does
 * not have. This action is that round trip, made explicit.
 *
 * `excludeAppointmentId` is the appointment the desk is editing. Without it, the
 * row's own slot would be treated as occupied — `buildFreeSlots` drops a candidate
 * that any row already holds, and the row the desk is editing is on the day
 * already — so the slot the desk is holding would vanish from the list it is
 * choosing from. The exclusion is what keeps the current slot in the list.
 */
export async function loadFreeSlotsAction(
  panel: Panel,
  doctorId: string,
  localDate: string,
  excludeAppointmentId?: string,
): Promise<
  | { readonly ok: true; readonly slots: readonly string[] }
  | { readonly ok: false; readonly message: string }
> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    const date = asLocalDate(localDate)
    const weekday = jalaliWeekday(date)

    const [windows, rows, slotMinutes] = await Promise.all([
      doctorWindowsOnDay({
        tx,
        tenantId: ctx.tenantId,
        clinicId: ctx.clinicId,
        weekday,
      }),
      clinicDay({ tx, ctx, clinicId: ctx.clinicId, localDate: date }),
      slotMinutesForDoctor({
        tx,
        tenantId: ctx.tenantId,
        doctorId,
        weekday,
      }),
    ])

    const map = buildFreeSlots({
      windows,
      rows,
      slotMinutesByDoctorId: { [doctorId]: slotMinutes },
      excludeAppointmentId,
    })

    return map[doctorId] ?? []
  })

  if (Array.isArray(result)) return { ok: true, slots: result }
  if (typeof result === 'object' && result !== null && 'message' in result) return result
  return { ok: false, message: SLOT_PICKER.error }
}