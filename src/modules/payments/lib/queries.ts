/**
 * The module's reads — the customer's own history and the two closed sets it renders.
 *
 * | Read | Surface |
 * |---|---|
 * | `customerPayments` | `account/payments.html`, «پرداخت‌های من» |
 * | `appointmentCharges` | the same page's charge side, beside the history |
 *
 * The customer panel is the one place a customer sees their own money, and it reads
 * the same ledger the desk does — no second query and no second arithmetic.
 */

import type { TransactionClient } from '@/core/db/scope'

import type { BalanceSummary, PaymentRow } from '../types'
import { customerBalance } from './balance'

/** The most a page reads in one go; a history is scrolled, not paged. */
const LIST_LIMIT = 200

/** The columns a history row renders. */
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

/**
 * «پرداخت‌های من» — the customer's receipts, newest first.
 *
 * The order is the index's own (`payment_tenant_customer_paid_idx`), so the history a
 * customer opens is the one the planner serves without a sort.
 *
 * Takes no permission: the customer panel is the customer's own scope, and the
 * `where` is what keeps the read inside it. The staff surface that reuses this read
 * holds `view_all_customers` of its own.
 */
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

/**
 * The customer's charges — the appointments that carry a price, newest first.
 *
 * The balance is the two reads put together, and the page renders it beside them so
 * the number and the rows that make it are one screen.
 */
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

/** The balance and the two lists a payment page renders, in one scope. */
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
      paidAmount: true, // 👈 این خط اضافه شد تا مبلغ پرداختی از دیتابیس خوانده شود
      dueAt: true,
      note: true,
      type: true, // 👈 این خط هم برای تشخیص چک از قسط
      totalPlanAmount: true, // 👈 این خط برای مبلغ کل بدهی
      totalPlanCount: true, // 👈 این خط برای تعداد کل اقساط
      intervalMonths: true,
      payments: true, // (برای سازگاری با کدهای قبلی، می‌تونی نگهش داری)
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
    orderBy: { dueAt: 'asc' },
  })

  // 👈 فیلتر کردن: فقط اقساطی که هنوز کامل پرداخت نشدن (با استفاده از paidAmount)
  return rows.filter((row) => {
    return row.paidAmount < row.amount
  })
}