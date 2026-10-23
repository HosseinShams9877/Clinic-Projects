/**
 * The appointments Server Actions — the write half of the three pages.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { AppointmentSource, PaymentKind, PaymentMethod, isMember } from '@/core/constants'
import { asLocalDate, asLocalTime, jalaliWeekday, normalizeDigits } from '@/core/localization'
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
  unrecordedOnDay,
  updateAppointment,
} from '@/modules/appointments'
import { buildFreeSlots } from './page-data'
import { RESULT_POPUP, SLOT_PICKER } from './catalog'
import { attributeAppointmentToCampaign } from '@/modules/campaigns'
import { loadBookableService } from '@/modules/services'
import { noteCycleBooking, recordCompletedSession } from '@/modules/cycles'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

import { appointmentsFailureMessage, resolveCustomerId } from './support'

export type ActionResult =
  | { readonly ok: true; readonly appointmentId: string }
  | { readonly ok: false; readonly message: string }

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

export interface BlockInput {
  readonly doctorId: string
  readonly localDate: string
  readonly localTime: string
  readonly durationMinutes: number
  readonly reason?: string
}

export interface EditInput {
  readonly appointmentId: string
  readonly doctorId?: string
  readonly serviceId?: string
  readonly localDate?: string
  readonly localTime?: string
  readonly durationMinutes?: number
}

export interface ResultInput {
  readonly appointmentId: string
  readonly note?: string
  readonly paidAmount?: string
  readonly discountAmount?: string
  readonly discountReason?: string
  readonly method?: string
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
    block({
      tx,
      ctx: session.permissions,
      tenantId: session.tenantId,
      userId: session.permissions.userId,
    }),
  ).catch((error: unknown) => {
    console.error('[inTenantScope] caught raw error:', error)
    return { ok: false as const, message: appointmentsFailureMessage(error) }
  })
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

function revalidateDebts(): void {
  revalidatePath('/reception/debts')
  revalidatePath('/admin/debts')
}

async function writeReceipt(args: {
  readonly tx: ScopeArgs['tx']
  readonly tenantId: string
  readonly userId: string
  readonly appointmentId: string
  readonly amount: bigint
  readonly method: PaymentMethod
  readonly kind: PaymentKind
  readonly discountAmount: bigint
  readonly discountReason: string | null
  readonly note: string | null
  readonly now: Date
}): Promise<void> {
  const appointment = await args.tx.appointment.findUnique({
    where: { tenantId: args.tenantId, id: args.appointmentId },
    select: { customerId: true },
  })
  if (appointment === null || appointment.customerId === null) return
  await args.tx.payment.create({
    data: {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      customerId: appointment.customerId,
      recordedByUserId: args.userId,
      discountByUserId: args.discountAmount > 0n ? args.userId : null,
      amount: args.amount,
      discountAmount: args.discountAmount,
      discountReason: args.discountReason,
      method: args.method,
      kind: args.kind,
      note: args.note,
      paidAt: args.now,
    },
  })
}

async function resolveBookingCustomer(args: {
  readonly tx: ScopeArgs['tx']
  readonly ctx: TenantContext
  readonly input: BookingInput
}): Promise<string> {
  if (args.input.customerId !== undefined) return args.input.customerId
  if (args.input.mobile === undefined || args.input.firstName === undefined) {
    throw new ValidationError(
      'A booking needs either a customer id or a mobile and a first name.',
      {
        messageKey: 'error.unhandledCase',
        detail: {},
      },
    )
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

    // 👈 لاگ اصلاح‌شده (customerId از متغیر خارجی)
    console.log('🚨 BOOKING CREATED:', {
      id: created.id,
      status: created.status,
      customerId: customerId,
      servicePrice: service.price.toString(),
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
  revalidateDebts()
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

    // 👈 لاگ اصلاح‌شده
    console.log('🚨 QUICK BOOKING CREATED:', {
      id: created.id,
      status: created.status,
      customerId: customerId,
      servicePrice: service.price.toString(),
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
  revalidateDebts()
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

export async function markArrivedAction(
  panel: Panel,
  appointmentId: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    return recordArrival({ tx, ctx, appointmentId, now: realClock() })
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  return { ok: true, appointmentId: result.id }
}

export async function recordResultAction(
  panel: Panel,
  input: ResultInput,
): Promise<ActionResult> {
  const parsed = parseResultInput(input)
  if (!parsed.ok) return parsed

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId, userId }) => {
    // ۱. گرفتن اطلاعات نوبت قبل از تغییر وضعیت
    const originalAppointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId, tenantId },
      select: { cycleId: true, customerId: true, serviceId: true, doctorId: true, scheduledAt: true }
    })

    if (!originalAppointment) throw new Error('Appointment not found')

    // ۲. تغییر وضعیت نوبت به COMPLETED
    const completed = await recordResult({
      tx,
      ctx,
      appointmentId: input.appointmentId,
      note: input.note,
      now: realClock(),
    })

    // ۳. ثبت پرداخت (اگر وجود داشت)
    if (parsed.value.payment !== null) {
      await writeReceipt({
        tx,
        tenantId,
        userId,
        appointmentId: completed.id,
        amount: parsed.value.payment.amount,
        method: parsed.value.payment.method,
        kind: PaymentKind.Partial,
        discountAmount: parsed.value.payment.discountAmount,
        discountReason: parsed.value.payment.discountReason,
        note: parsed.value.payment.note,
        now: realClock(),
      })
    }

    // ۴. جلو بردن جلسه درمان
    // 👈 اگر نوبت مربوط به یک چرخه (cycleId) باشه، حتماً چرخه رو آپدیت میکنیم
    if (originalAppointment.cycleId !== null) {
      console.log('🎯 Attempting to advance cycle:', originalAppointment.cycleId)
      
      // نکته مهم: اینجا دیگه سرویس رو چک نمیکنیم، خود تابع هندل میکنه
      await recordCompletedSession({
        tx,
        ctx,
        facts: {
          appointmentId: input.appointmentId,
          customerId: originalAppointment.customerId as string,
          serviceId: originalAppointment.serviceId as string,
          doctorId: originalAppointment.doctorId,
          scheduledAt: originalAppointment.scheduledAt,
        },
        now: realClock(),
      })
      console.log('✅ Cycle advanced successfully!')
    } else {
      console.log('⚠️ Appointment has no cycleId, skipping cycle update.')
    }
    
    return completed
  })

  if (!('id' in result)) return result
  revalidateAppointments()
  revalidateCycles()
  revalidateDebts()
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
  revalidateDebts()
  return { ok: true, appointmentId: result.id }
}

export async function updateAppointmentAction(
  panel: Panel,
  input: EditInput,
): Promise<ActionResult> {
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

    const [windows, gridRows, unrecordedRows, slotMinutes] = await Promise.all([
      doctorWindowsOnDay({
        tx,
        tenantId: ctx.tenantId,
        clinicId: ctx.clinicId,
        weekday,
      }),
      clinicDay({ tx, ctx, clinicId: ctx.clinicId, localDate: date }),
      unrecordedOnDay({
        tx,
        ctx,
        clinicId: ctx.clinicId,
        localDate: date,
      }),
      slotMinutesForDoctor({
        tx,
        tenantId: ctx.tenantId,
        doctorId,
        weekday,
      }),
    ])

    const rows = [...gridRows, ...unrecordedRows]

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

export async function loadFreeSlotsForCycleAction(
  panel: Panel,
  doctorId: string,
  localDate: string,
): Promise<
  | { readonly ok: true; readonly slots: readonly string[] }
  | { readonly ok: false; readonly message: string }
> {
  return loadFreeSlotsAction(panel, doctorId, localDate)
}

type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

interface ParsedPayment {
  readonly amount: bigint
  readonly discountAmount: bigint
  readonly discountReason: string | null
  readonly method: PaymentMethod
  readonly note: string | null
}

function parseResultInput(input: ResultInput): Parsed<{ readonly payment: ParsedPayment | null }> {
  const paidText = (input.paidAmount ?? '').trim()
  if (paidText === '') return { ok: true, value: { payment: null } }

  const amount = parseTomanToRial(paidText)
  if (amount === null || amount <= 0n) {
    return { ok: false, message: RESULT_POPUP.moneyInvalid }
  }

  const discountAmount = parseOptionalTomanToRial(input.discountAmount)
  if (discountAmount === null) {
    return { ok: false, message: RESULT_POPUP.moneyInvalid }
  }

  const method =
    input.method !== undefined && isMember(PaymentMethod, input.method)
      ? input.method
      : PaymentMethod.Cash

  const reason =
    input.discountReason === undefined || input.discountReason.trim() === ''
      ? null
      : input.discountReason.trim()

  return {
    ok: true,
    value: {
      payment: {
        amount,
        discountAmount,
        discountReason: reason,
        method,
        note: null,
      },
    },
  }
}

function parseTomanToRial(value: string): bigint | null {
  const trimmed = normalizeDigits(value.trim())
  if (!/^\d+$/.test(trimmed)) return null
  return BigInt(trimmed) * 10n
}

function parseOptionalTomanToRial(value: string | undefined): bigint | null {
  if (value === undefined || value.trim() === '') return 0n
  return parseTomanToRial(value)
}