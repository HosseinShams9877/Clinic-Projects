import { DomainError, NotFoundError } from '@/core/types'
import { Permission } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'
import { fromUtcInstant, toUtcInstant, asLocalDate, fromClockParts } from '@/core/localization'

export interface InstallmentInput {
  readonly appointmentId: string
  readonly totalAmount: bigint
  readonly count: number
  readonly firstDueAt: Date
  readonly note: string | null
}

// 👈 تابع محاسبه دقیق ماه شمسی (روز ثابت می‌مونه)
function addMonthsJalali(dateString: string, monthsToAdd: number): string {
  const parts = dateString.split('-')
  let y = Number(parts[0])
  let m = Number(parts[1])
  const d = parts[2]
  m += monthsToAdd
  while (m > 12) { m -= 12; y += 1 }
  return `${y}-${String(m).padStart(2, '0')}-${d}`
}

const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

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
  const rows = await tx.installment.findMany({
    where: { tenantId },
    orderBy: [{ dueAt: 'asc' }, { sequence: 'asc' }],
    take: 500,
    select: {
      id: true,
      appointmentId: true,
      sequence: true,
      amount: true,
      paidAmount: true,
      totalPlanAmount: true,
      totalPlanCount: true,
      intervalMonths: true,
      dueAt: true,
      note: true,
      type: true,
      appointment: {
        select: {
          localDate: true,
          customer: { select: { id: true, firstName: true, lastName: true, mobile: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
          service: { select: { name: true } },
          payments: { select: { amount: true, installmentId: true } },
        },
      },
    },
  })

  const settings = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: { utcOffsetMinutes: true }
  })
  const offset = settings?.utcOffsetMinutes ?? 210

  return rows.map((row) => {
    const totalInstallments = row.totalPlanCount || 1
    const paidCount = Math.min(
      totalInstallments,
      Math.floor(Number(row.paidAmount) / Number(row.amount > 0n ? row.amount : 1n))
    )

    let finalDueAt = new Date(row.dueAt)

    if (paidCount > 0 && row.intervalMonths) {
      const baseLocalDate = fromUtcInstant(new Date(row.dueAt), offset).localDate
      const nextLocalDate = addMonthsJalali(baseLocalDate, paidCount * row.intervalMonths)
      
      finalDueAt = toUtcInstant(asLocalDate(nextLocalDate), MIDNIGHT, offset)
    }

    return {
      ...row,
      dueAt: finalDueAt,
      appointment: {
        ...row.appointment,
        doctorId: row.appointment.doctor?.id,
      }
    }
  })
}