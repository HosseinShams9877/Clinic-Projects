import { DomainError, NotFoundError } from '@/core/types'
import { Permission } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'

export interface InstallmentInput {
  readonly appointmentId: string
  readonly totalAmount: bigint
  readonly count: number
  readonly firstDueAt: Date
  readonly note: string | null
}

export async function createInstallmentPlan(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly input: InstallmentInput
  readonly now: Date
}) {
  requirePermission(args.ctx, Permission.RecordPayment)
  const { appointmentId, totalAmount, count, firstDueAt, note } = args.input
  if (totalAmount <= 0n) {
    throw new DomainError('Installment amount must be positive', {
      messageKey: 'payment.amountNotPositive',
    })
  }
  if (!Number.isInteger(count) || count < 1 || count > 36) {
    throw new DomainError('Installment count must be between 1 and 36', {
      messageKey: 'payment.installmentCountInvalid',
    })
  }
  const appointment = await args.tx.appointment.findUnique({
    where: { tenantId: args.ctx.tenantId, id: appointmentId },
    select: { id: true },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found', {
      messageKey: 'payment.installmentNotFound',
    })
  }

  const base = totalAmount / BigInt(count)
  const remainder = totalAmount % BigInt(count)
  const rows = Array.from({ length: count }, (_, index) => {
    const dueAt = new Date(firstDueAt)
    dueAt.setMonth(dueAt.getMonth() + index)
    return {
      tenantId: args.ctx.tenantId,
      appointmentId,
      sequence: index + 1,
      amount: base + (BigInt(index) < remainder ? 1n : 0n),
      dueAt,
      note: note?.trim() || null,
    }
  })
  await args.tx.installment.createMany({ data: rows })
  return args.tx.installment.findMany({
    where: { tenantId: args.ctx.tenantId, appointmentId },
    orderBy: { sequence: 'asc' },
  })
}

export async function listInstallments(tx: TransactionClient, tenantId: string) {
  return tx.installment.findMany({
    where: { tenantId },
    orderBy: [{ dueAt: 'asc' }, { sequence: 'asc' }],
    take: 500,
    select: {
      id: true,
      appointmentId: true,
      sequence: true,
      amount: true,
      dueAt: true,
      note: true,
      appointment: {
        select: {
          localDate: true,
          customer: { select: { firstName: true, lastName: true, mobile: true } },
          payments: { select: { amount: true, installmentId: true } },
        },
      },
    },
  })
}
