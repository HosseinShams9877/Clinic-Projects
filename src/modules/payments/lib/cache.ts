/**
 * The recomputable cache — `Customer.chargedTotal`, `discountTotal`, `paidTotal`.
 *
 * `03-data-model.md` §4.3 is explicit about what these are: running sums of
 * immutable ledger facts, updated in the same transaction as the fact, and *not* a
 * stored balance. The balance is still computed from them, and the nightly
 * reconciliation job (`lib/reconcile.ts`) recomputes both sums from the ledger and
 * fails loudly on any drift. Storing the inputs and deriving the value is what keeps
 * immutable rule 8 intact while keeping the debtor audience group off a full scan.
 *
 * This file is the one place the three columns are written. A second writer would be
 * a second place the cache could drift from the ledger it caches.
 */

import type { TransactionClient } from '@/core/db/scope'

import { asBalance, customerBalance } from './balance'

/** The columns the cache holds, named once so a rename touches one update. */
const CACHE_SELECT = {
  chargedTotal: true,
  discountTotal: true,
  paidTotal: true,
} as const

/** The shape Prisma hands back from the cache's own read. */
type CacheRow = {
  readonly chargedTotal: bigint
  readonly discountTotal: bigint
  readonly paidTotal: bigint
}

/**
 * Recomputes one customer's three sums from the ledger and stores them.
 *
 * Runs inside the caller's transaction — the same transaction that wrote the payment
 * — so a payment that rolls back leaves a cache that matches the ledger it has. The
 * balance is recomputed from the stored cache on the way out, which is the read path
 * the audience group uses.
 *
 * @returns the recomputed balance, for the caller that needs the number it just made.
 */
export async function recomputeCustomerTotals(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}) {
  const balance = await customerBalance(args.tx, args.tenantId, args.customerId)

  await args.tx.customer.update({
    where: { id: args.customerId },
    data: {
      chargedTotal: balance.charged,
      discountTotal: balance.discount,
      paidTotal: balance.paid,
    },
  })

  return balance
}

/**
 * The customer's balance read from the cache, for the audience group's query.
 *
 * The group is a saved predicate over the customer's own columns, so this is the read
 * that serves it — and the reconciliation job is what keeps the answer honest.
 */
export async function cachedCustomerBalance(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
) {
  const row = (await tx.customer.findUnique({
    where: { tenantId, id: customerId },
    select: CACHE_SELECT,
  })) as CacheRow | null
  if (row === null) return asBalance(0n, 0n, 0n)

  return asBalance(row.chargedTotal, row.discountTotal, row.paidTotal)
}
