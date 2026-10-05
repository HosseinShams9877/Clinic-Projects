/**
 * The reconciliation job — `02-architecture.md` §12's "Payment reconciliation | daily |
 * `payments`", and the module's only producer of work.
 *
 * The cadence is §12's own ("daily"), and like the cycles and lifecycle jobs the
 * handler reschedules its own successor inside the same transaction as the work —
 * atomic, so a tick that rolls back does not leave a gap in the nightly schedule.
 *
 * ## Why the failure is the job's own
 *
 * A reconciliation that found drift throws, so the queue row records `lastError` and
 * the failure is visible to an operator rather than absorbed by the next tick. The
 * runner's retry policy then re-runs it, and a drift that was a transient is gone by
 * the second attempt while a real one keeps failing loudly.
 */

import type { TransactionClient } from '@/core/db/scope'
import { JobStatus } from '@/worker/status'
import { enqueueJob } from '@/worker/queue'
import type { JobHandler } from '@/worker/registry'

import { runReconciliation } from './reconcile'

/** The job kind, namespaced by the module the registry is keyed by. */
export const PAYMENTS_RECONCILE_JOB_KIND = 'payments.reconcile'

/** How often the reconciliation runs — one day, which is §12's "daily". */
export const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * The nightly job — reconciles the tenant's sums, then books its own next tick.
 *
 * `scope` is the default `own-tenant`: the sums are the tenant's own, and a
 * reconciliation across tenants is the runner's loop and not this handler's.
 */
export const reconcileJobHandler: JobHandler = {
  scope: 'own-tenant',
  async run({ tx, job, now }) {
    const report = await runReconciliation(tx, job.tenantId)

    await enqueueJob({
      tx,
      tenantId: job.tenantId,
      kind: PAYMENTS_RECONCILE_JOB_KIND,
      runAt: new Date(now.getTime() + RECONCILE_INTERVAL_MS),
    })

    console.info(
      `[payments] reconciliation at ${now.toISOString()} tenant=${job.tenantId} customers=${report.customersChecked} corrected=${report.corrected}`,
    )
  },
}

/**
 * Ensures a tenant has a pending reconciliation row, seeding the nightly schedule.
 *
 * Idempotent on the kind within the tenant, so a caller that runs it on every settings
 * write does not create a second night.
 *
 * @returns whether a row was created, for the caller's own accounting.
 */
export async function ensureReconcileJob(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<boolean> {
  const existing = await args.tx.jobQueue.findFirst({
    where: {
      tenantId: args.tenantId,
      kind: PAYMENTS_RECONCILE_JOB_KIND,
      status: { in: [JobStatus.Pending, JobStatus.Running] },
    },
    select: { id: true },
  })
  if (existing !== null) return false

  await enqueueJob({
    tx: args.tx,
    tenantId: args.tenantId,
    kind: PAYMENTS_RECONCILE_JOB_KIND,
    runAt: args.now,
  })
  return true
}
