/**
 * The nightly reconciliation — DoD 3.
 *
 * `03-data-model.md` §4.3 calls the three `Customer` columns "recomputable caches of
 * facts, not a stored balance", and the reconciliation is what makes the word
 * *recomputable* true: every night the sums are derived again from the ledger, every
 * customer whose stored sums are not the ledger's is corrected, and any correction at
 * all fails loudly. Zero drift on a clean dataset is the pass; a row a release or a
 * script moved is the alarm.
 *
 * ## Why it fails instead of silently repairing
 *
 * A cache that quietly fixed itself would hide the very thing the job exists to
 * surface — a second writer to the financial facts, which is a defect and not a
 * transient. The correction is written (the ledger is the truth, so the cache is made
 * to match it) and then the job throws, so the failure is visible in the queue's own
 * `lastError` and in the operator's log.
 */

import { DomainError } from '@/core/types'
import type { TransactionClient } from '@/core/db/scope'

import type { ReconciliationReport } from '../types'
import { customerBalance } from './balance'

/** The most customers one tick reconciles; a tenant is a loop, not a join. */
const BATCH = 500

/** The columns the reconciliation compares the cache against, and nothing more. */
const CUSTOMER_SELECT = {
  id: true,
  chargedTotal: true,
  discountTotal: true,
  paidTotal: true,
} as const

/** The shape Prisma hands back from the customer read. */
type StoredSums = {
  readonly id: string
  readonly chargedTotal: bigint
  readonly discountTotal: bigint
  readonly paidTotal: bigint
}

/**
 * Re-derives every customer's three sums, corrects the ones that drifted, and throws
 * when any did.
 *
 * Pages through the tenant's customers by id, so a tenant larger than one batch is
 * still reconciled in one tick and the loop is bounded.
 *
 * @throws DomainError — `payment.driftDetected`, after the corrections are written.
 */
export async function runReconciliation(
  tx: TransactionClient,
  tenantId: string,
): Promise<ReconciliationReport> {
  let corrected = 0
  let checked = 0
  let cursor: string | undefined

  for (;;) {
    const rows = (await tx.customer.findMany({
      where: { tenantId },
      select: CUSTOMER_SELECT,
      orderBy: { id: 'asc' },
      take: BATCH,
      skip: cursor === undefined ? 0 : 1,
      cursor: cursor === undefined ? undefined : { id: cursor },
    })) as readonly StoredSums[]
    if (rows.length === 0) break

    for (const stored of rows) {
      cursor = stored.id
      checked += 1
      const ledger = await customerBalance(tx, tenantId, stored.id)
      if (
        stored.chargedTotal === ledger.charged &&
        stored.discountTotal === ledger.discount &&
        stored.paidTotal === ledger.paid
      ) {
        continue
      }

      // The ledger is the truth, so the cache is made to match it before the job
      // names the drift — a failure that also repairs is a failure that leaves the
      // data right.
      await tx.customer.update({
        where: { id: stored.id },
        data: {
          chargedTotal: ledger.charged,
          discountTotal: ledger.discount,
          paidTotal: ledger.paid,
        },
      })
      corrected += 1
    }
  }

  const report: ReconciliationReport = {
    tenantsChecked: 1,
    customersChecked: checked,
    corrected,
  }

  if (corrected > 0) {
    throw new DomainError(`Reconciliation corrected ${corrected} customer sum(s)`, {
      messageKey: 'payment.driftDetected',
      detail: { tenantId, corrected },
    })
  }

  return report
}
