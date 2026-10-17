// src/modules/debts/lib/follow-up.ts

/**
 * The two writes a debt carries — follow-up and due-date reschedule.
 */

import { DomainError, NotFoundError } from '@/core/types'
import { Permission, Role } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'

import { appointmentBalance } from '@/modules/payments'
import { readDebtSettings } from './settings'

const APPOINTMENT_SELECT = {
  id: true,
  customerId: true,
  scheduledAt: true,
  priceAtBooking: true,
} as const

async function findDebt(tx: TransactionClient, tenantId: string, appointmentId: string) {
  return tx.appointment.findUnique({
    where: { tenantId, id: appointmentId },
    select: APPOINTMENT_SELECT,
  })
}

async function assertStillOwed(
  tx: TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const balance = await appointmentBalance(tx, tenantId, appointmentId)
  if (balance.balance <= 0n) {
    throw new DomainError('The debt is settled', { messageKey: 'debt.alreadySettled' })
  }
}

function normaliseNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}

export async function recordFollowUp(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly nextContactAt: Date | null
  readonly note?: string | null
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, Permission.FollowUpDebt)

  const appointment = await findDebt(args.tx, args.ctx.tenantId, args.appointmentId)
  if (appointment === null) {
    throw new NotFoundError('The appointment is not in this tenant', {
      messageKey: 'debt.notFound',
    })
  }

  await assertStillOwed(args.tx, args.ctx.tenantId, args.appointmentId)

  await args.tx.debtFollowUp.create({
    data: {
      tenantId: args.ctx.tenantId,
      appointmentId: args.appointmentId,
      note: normaliseNote(args.note),
      nextContactAt: args.nextContactAt,
      createdById: args.ctx.userId,
      createdAt: args.now,
    },
  })
}

export async function rescheduleDueDate(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly dueDate: Date
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, Permission.FollowUpDebt)

  const appointment = await findDebt(args.tx, args.ctx.tenantId, args.appointmentId)
  if (appointment === null) {
    throw new NotFoundError('The appointment is not in this tenant', {
      messageKey: 'debt.notFound',
    })
  }

  const settings = await readDebtSettings(args.tx, args.ctx.tenantId)
  if (args.ctx.role === Role.Secretary && !settings.secretaryCanMoveDueDate) {
    throw new DomainError('The secretary may not move a due date', {
      messageKey: 'debt.cannotMoveDueDate',
    })
  }

  await assertStillOwed(args.tx, args.ctx.tenantId, args.appointmentId)

  await args.tx.appointment.update({
    where: { id: appointment.id },
    data: {
      debtNextContactAt: args.dueDate,
    },
  })
}

/** 
 * تابع جدید برای خواندن تمام پیگیری‌های یک نوبت
 */
export async function getFollowUpsForAppointment(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly appointmentId: string
}) {
  return args.tx.debtFollowUp.findMany({
    where: { tenantId: args.tenantId, appointmentId: args.appointmentId },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  })
}