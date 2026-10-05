/**
 * The balance — `03-data-model.md` §4.1's formula, computed at read time.
 *
 * `balance = Σ priceAtBooking − Σ discountAmount − Σ amount`. There is no `balance`
 * column and this file is the only place the three terms are put together, which is
 * what makes the number the formula produces and the number a page renders the same
 * number: a caller cannot reach a second implementation.
 *
 * A `REFUND` row stores a negative `amount`, so the one subtraction serves both
 * directions of the ledger. `paidTotal` is the same sum, cached.
 */

import type { TransactionClient } from '@/core/db/scope'

import type { BalanceSummary } from '../types'

/** The aggregate that answers both terms of the paid side in one indexed scan. */
const PAID_AGGREGATE = {
  _sum: { amount: true, discountAmount: true },
} as const

/** The aggregate that answers the charged side, over the rows that carry a price. */
const CHARGED_AGGREGATE = {
  _sum: { priceAtBooking: true },
} as const

/**
 * The balance of one appointment — the per-appointment view §2.5's index serves.
 *
 * Takes the tenant rather than trusting the appointment's own row, because the
 * caller is a scoped transaction and the scope's `where` is what keeps the read in
 * it (`09-security.md` §6.3: the row outside the scope is absent, not refused).
 */
export async function appointmentBalance(
  tx: TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<BalanceSummary> {
  const charged = await tx.appointment.aggregate({
    where: { tenantId, id: appointmentId },
    ...CHARGED_AGGREGATE,
  })
  const paid = await tx.payment.aggregate({
    where: { tenantId, appointmentId },
    ...PAID_AGGREGATE,
  })

  return asBalance(
    charged._sum?.priceAtBooking ?? 0n,
    paid._sum?.discountAmount ?? 0n,
    paid._sum?.amount ?? 0n,
  )
}

/**
 * The balance of one customer — «پرداخت‌های من» and the debtor list.
 *
 * The scope is the customer's appointments and the customer's payments; a payment
 * always attaches to an appointment that belongs to the same customer
 * (`03-data-model.md` §2.5's invariant), so the two sums cannot disagree about
 * which rows are in scope.
 */
export async function customerBalance(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<BalanceSummary> {
  const charged = await tx.appointment.aggregate({
    where: { tenantId, customerId },
    ...CHARGED_AGGREGATE,
  })
  const paid = await tx.payment.aggregate({
    where: { tenantId, customerId },
    ...PAID_AGGREGATE,
  })

  return asBalance(
    charged._sum?.priceAtBooking ?? 0n,
    paid._sum?.discountAmount ?? 0n,
    paid._sum?.amount ?? 0n,
  )
}

/** The three terms as one summary; the balance is derived and never an argument. */
export function asBalance(charged: bigint, discount: bigint, paid: bigint): BalanceSummary {
  return Object.freeze({ charged, discount, paid, balance: charged - discount - paid })
}

/** Whether a summary names a debt — the debtor list's one test, in the terms it owns. */
export function isOwed(summary: BalanceSummary): boolean {
  return summary.balance > 0n
}
