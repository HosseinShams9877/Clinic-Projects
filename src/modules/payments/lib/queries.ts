import type { TransactionClient } from '@/core/db/scope'
import type { BalanceSummary, PaymentRow } from '../types'
import { customerBalance } from './balance'

const LIST_LIMIT = 200

const PAYMENT_SELECT = {
  id: true,
  appointmentId: true,
  amount: true,
  discountAmount: true,
  discountReason: true,
  discountByUserId: true,
  method: true,
  kind: true,
  note: true,
  paidAt: true,
} as const

export async function customerPayments(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<readonly PaymentRow[]> {
  const rows = await args.tx.payment.findMany({
    where: { tenantId: args.tenantId, customerId: args.customerId },
    select: PAYMENT_SELECT,
    orderBy: { paidAt: 'desc' },
    take: LIST_LIMIT,
  })

  return rows.map((row) => ({
    ...row,
    method: row.method as PaymentRow['method'],
    kind: row.kind as PaymentRow['kind'],
  }))
}

export async function customerCharges(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}) {
  return args.tx.appointment.findMany({
    where: { tenantId: args.tenantId, customerId: args.customerId, priceAtBooking: { gt: 0n } },
    select: {
      id: true,
      localDate: true,
      localTime: true,
      status: true,
      priceAtBooking: true,
      depositAmount: true,
    },
    orderBy: { scheduledAt: 'desc' },
    take: LIST_LIMIT,
  })
}

export async function customerLedger(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<{ readonly balance: BalanceSummary; readonly paid: readonly PaymentRow[] }> {
  const [balance, paid] = await Promise.all([
    customerBalance(args.tx, args.tenantId, args.customerId),
    customerPayments(args),
  ])
  return { balance, paid }
}

export async function listInstallments(tx: TransactionClient, tenantId: string) {
  const rows = await tx.installment.findMany({
    where: { tenantId },
    select: {
      id: true,
      appointmentId: true,
      sequence: true,
      amount: true,
      paidAmount: true,
      dueAt: true,
      note: true,
      type: true,
      totalPlanAmount: true,
      totalPlanCount: true,
      intervalMonths: true,
      payments: true,
      appointment: {
        select: {
          localDate: true,
          doctorId: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mobile: true,
            },
          },
          doctor: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          service: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ appointmentId: 'asc' }, { sequence: 'asc' }],
  })

  // 👈 فیلتر کردن: فقط رکوردهایی که هنوز بدهی‌شون بازه (paidAmount < totalPlanAmount)
  return rows.filter((row) => {
    const totalAmount = row.totalPlanAmount || row.amount
    return row.paidAmount < totalAmount
  })
}