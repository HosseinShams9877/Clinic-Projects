import type { TransactionClient } from '@/core/db/scope'

export async function financialSummary(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly from: Date
  readonly to: Date
}) {
  const where = {
    tenantId: args.tenantId,
    paidAt: { gte: args.from, lt: args.to },
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
      method: row.method,
      amount: row._sum.amount ?? 0n,
      count: row._count._all,
    })),
  }
}
