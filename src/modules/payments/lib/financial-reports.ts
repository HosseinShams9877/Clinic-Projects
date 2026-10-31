import { Permission, type PaymentKind, type PaymentMethod } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import { requirePermission } from '@/modules/roles-permissions'
import { PAYMENT_KIND_LABELS, GENERIC_CUSTOMER_NAME } from '../catalog'
import type { FinancialSummaryReport, PaymentLine, PaymentLineStage } from '../types'

export async function financialSummary(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly from: Date
  readonly to: Date
  /** وقتی پاس داده شود، فقط پرداخت‌های نوبت‌های این پزشک جمع می‌شوند. */
  readonly doctorId?: string
}): Promise<FinancialSummaryReport> {
  const where = {
    tenantId: args.tenantId,
    paidAt: { gte: args.from, lt: args.to },
    ...(args.doctorId !== undefined ? { appointment: { doctorId: args.doctorId } } : {}),
  }
  const [payments, refunds, byMethod] = await Promise.all([
    args.tx.payment.aggregate({
      where: { ...where, kind: { not: 'REFUND' } },
      _sum: { amount: true, discountAmount: true },
      _count: { _all: true },
    }),
    args.tx.payment.aggregate({
      where: { ...where, kind: 'REFUND' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    args.tx.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])
  return {
    gross: payments._sum.amount ?? 0n,
    discounts: payments._sum.discountAmount ?? 0n,
    refunds: refunds._sum.amount ?? 0n,
    paymentCount: payments._count._all,
    refundCount: refunds._count._all,
    byMethod: byMethod.map((row) => ({
      method: row.method as PaymentMethod,
      amount: row._sum.amount ?? 0n,
      count: row._count._all,
    })),
  }
}

/**
 * خط‌های پرداختِ نوبت‌های داده‌شده — برای جدولِ «جزئیات پرداخت» در گزارشِ مالی.
 *
 * جدول `Payment` شماره‌ی مرحله را ذخیره نمی‌کند؛ بنابراین این خواندن ابتدا طرحِ
 * قسطیِ هر `installmentId` را برمی‌دارد، سپس پرداخت‌های هر طرح را به ترتیبِ
 * `paidAt` پشت سر هم جمع می‌کند و هر پرداخت را به مرحله‌ای نسبت می‌دهد که
 * جمعِ پرداخت‌های قبل از آن به آن می‌رسد — همان فرمولی که `paidInstallments` در
 * `debts/lib/queries.ts` استفاده می‌کند.
 */
export async function appointmentPaymentLines(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentIds: ReadonlyArray<string>
}): Promise<readonly PaymentLine[]> {
  requirePermission(args.ctx, Permission.ViewDebts)
  if (args.appointmentIds.length === 0) return []

  const payments = await args.tx.payment.findMany({
    where: { tenantId: args.ctx.tenantId, appointmentId: { in: [...args.appointmentIds] } },
    orderBy: { paidAt: 'asc' },
    include: {
      appointment: { select: { customer: { select: { firstName: true, lastName: true } } } },
    },
  })

  const planIds = [...new Set(payments.map((p) => p.installmentId).filter((id): id is string => id !== null))]
  const plans =
    planIds.length > 0
      ? await args.tx.installment.findMany({
          where: { tenantId: args.ctx.tenantId, id: { in: planIds } },
          select: { id: true, amount: true, totalPlanCount: true, type: true },
        })
      : []
  const planById = new Map(plans.map((p) => [p.id, p]))

  // جمعِ تجمعیِ پرداخت‌های قبلیِ هر طرح — برای نسبت دادنِ هر پرداخت به یک مرحله.
  const cumulativePerPlan = new Map<string, bigint>()

  return payments.map((p) => {
    const customer = p.appointment.customer
    const customerName = customer
      ? `${customer.firstName} ${customer.lastName ?? ''}`.trim()
      : GENERIC_CUSTOMER_NAME

    const plan = p.installmentId !== null ? planById.get(p.installmentId) : undefined
    let stage: PaymentLineStage
    if (plan !== undefined && plan.type === 'CHEQUE') {
      stage = { kind: 'CHEQUE' }
    } else if (plan !== undefined) {
      const before = cumulativePerPlan.get(p.installmentId!) ?? 0n
      const perStage = plan.amount > 0n ? plan.amount : 1n
      const total = plan.totalPlanCount ?? 1
      const sequence = Math.min(total, Math.max(1, Number(before / perStage) + 1))
      stage = { kind: 'INSTALLMENT', sequence, total }
    } else {
      stage = { kind: 'PAYMENT', label: PAYMENT_KIND_LABELS[p.kind as PaymentKind] ?? p.kind }
    }

    if (p.installmentId !== null) {
      cumulativePerPlan.set(p.installmentId, (cumulativePerPlan.get(p.installmentId) ?? 0n) + p.amount)
    }

    return {
      id: p.id,
      appointmentId: p.appointmentId,
      installmentId: p.installmentId,
      customerName,
      stage,
      amount: p.amount,
      method: p.method as PaymentMethod,
      paidAt: p.paidAt,
    }
  })
}
