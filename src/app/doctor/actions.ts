/**
 * The doctor panel's Server Actions.
 *
 * `02-architecture.md` §6: an action resolves the person from the session, opens the
 * tenant scope, calls a module's barrel and hands back a sentence. The doctor's one
 * write today is their own leave request — `requestLeave` requires `view_own_schedule`,
 * which the doctor holds, and the request goes to the manager's own approval queue.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, asLocalTime, isValidLocalDate, toUtcInstant } from '@/core/localization'
import { requestLeave } from '@/modules/staff'

import { DOCTOR_DASHBOARD } from '@/app/doctor/catalog'
import { moduleFailureMessage } from '@/app/_shared/module-failure'
import { resolveStaffPanel } from '@/app/_shell/session'

/** The answer the leave form reads: a done, or a sentence about why it was not done. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The leave form's two Jalali days and its optional reason. */
export interface LeaveInput {
  readonly startDate: string
  readonly endDate: string
  readonly reason?: string
}

/**
 * «اعلام مرخصی» — the doctor's own leave request, to the manager's approval queue.
 */
export async function requestLeaveAction(input: LeaveInput): Promise<ActionResult> {
  if (
    !isValidLocalDate(input.startDate) ||
    !isValidLocalDate(input.endDate) ||
    input.endDate < input.startDate
  ) {
    return { ok: false, message: DOCTOR_DASHBOARD.leave.invalid }
  }

  const session = await resolveStaffPanel('doctor')
  return runInTenantScope(session.permissions, prisma(), async (tx) => {
    await requestLeave({
      tx,
      ctx: session.permissions,
      startDate: toUtcInstant(asLocalDate(input.startDate), asLocalTime('00:00'), 0),
      endDate: toUtcInstant(asLocalDate(input.endDate), asLocalTime('00:00'), 0),
      reason: input.reason === '' ? undefined : input.reason,
    })
  })
    .then(() => {
      revalidatePath('/admin/staff')
      revalidatePath('/doctor')
      return { ok: true } as const
    })
    .catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const)
}

// 👈 اکشن جدید برای تایید جلسه توسط دکتر
export async function approveAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const session = await resolveStaffPanel('doctor')
  
  return runInTenantScope(session.permissions, prisma(), async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId, tenantId: session.tenantId },
      data: { isDoctorApproved: true }
    })
  })
    .then(() => {
      revalidatePath('/doctor')
      revalidatePath('/admin')
      revalidatePath('/reception')
      return { ok: true } as const
    })
    .catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const)
}