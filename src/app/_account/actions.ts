// src/app/_account/actions.ts

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { asLocalDate, asLocalTime, minutesToTime, jalaliWeekday } from '@/core/localization'

import { resolveCustomerPanel } from '@/app/_shell/session'
import { MESSAGES as APPOINTMENT_MESSAGES } from '@/modules/appointments'
import {
  cancelOwnAppointment,
  rescheduleOwnAppointment,
  generateSlots,
  readBookingSettings,
  blockRanges,
  doctorWindowsOnDay,
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

export type PanelActionResult<T = void> =
  | ({ readonly ok: true } & (T extends void ? object : T))
  | { readonly ok: false; readonly message: string }

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && 'messageKey' in error) {
    const key = (error as { readonly messageKey: string }).messageKey
    if (key in APPOINTMENT_MESSAGES) return APPOINTMENT_MESSAGES[key as keyof typeof APPOINTMENT_MESSAGES]
    if (key in CUSTOMER_MESSAGES) return CUSTOMER_MESSAGES[key as keyof typeof CUSTOMER_MESSAGES]
  }
  return fallback
}

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
 * اکشن جدید برای گرفتن ساعت‌های خالی جهت فرم جابه‌جایی.
 */
export async function getAvailableSlotsAction(args: {
  readonly appointmentId: string
  readonly localDate: string
}): Promise<PanelActionResult<{ readonly slots: readonly string[] }>> {
  const session = await resolveCustomerPanel()

  try {
    return await runInTenantScope(session.permissions, prisma(), async (tx) => {
      // 1. خواندن نوبت فعلی برای گرفتن dr, clinic, service, duration
      const current = await tx.appointment.findFirst({
        where: { id: args.appointmentId, tenantId: session.tenantId, customerId: session.customerId },
        select: {
          doctorId: true,
          clinicId: true,
          serviceId: true,
          durationMinutes: true,
        },
      })
      if (!current) throw new Error('Appointment not found')

      const targetDate = asLocalDate(args.localDate)
      const weekday = jalaliWeekday(targetDate)
      const settings = await readBookingSettings(tx, session.tenantId)

      // 2. گرفتن پنجره‌های کاری دکتر در آن روز
      const windows = await doctorWindowsOnDay({
        tx,
        tenantId: session.tenantId,
        clinicId: current.clinicId,
        weekday,
      })
      const window = windows.find((w) => w.id === current.doctorId)
      if (!window) {
        return { ok: true as const, slots: [] } // دکتر در این روز کار نمی‌کند
      }

      // 3. گرفتن نوبت‌های رزروشده برای آن دکتر در آن روز (به عنوان block)
      const existingAppointments = await tx.appointment.findMany({
        where: {
          tenantId: session.tenantId,
          doctorId: current.doctorId,
          localDate: args.localDate,
          isSlotBlock: false,
          status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
        },
        select: { localTime: true, durationMinutes: true },
      })
      
      // 4. ساخت اسلات‌ها
      const range = window.ranges[0] 
      if (!range) return { ok: true as const, slots: [] }

      const slotDay = {
        doctorId: current.doctorId,
        localDate: targetDate,
        shift: { startTime: minutesToTime(range.startMinute), endTime: minutesToTime(range.endMinute) },
        hours: { startTime: minutesToTime(range.startMinute), endTime: minutesToTime(range.endMinute) },
        durationMinutes: current.durationMinutes,
        slotMinutes: range.slotMinutes,
        blocks: blockRanges(existingAppointments),
        isHoliday: false, // برای سادگی در این اکشن چک نمی‌کنیم
      }

      const slots = generateSlots(slotDay, settings)
      const availableTimes = slots.filter(s => s.available).map(s => s.time)

      return { ok: true as const, slots: availableTimes }
    })
  } catch (error: unknown) {
    return { ok: false, message: failureMessage(error, CUSTOMER_PANEL.failure) }
  }
}

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