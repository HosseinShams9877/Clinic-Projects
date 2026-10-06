/**
 * The nightly refresh job — `02-architecture.md` §12's own cadence for this module,
 * and the one producer of the counts the pages render.
 *
 * ## Why the job spans tenants
 *
 * `09-security.md` §8: "Jobs that span tenants are a loop over tenants, each
 * iteration in its own scoped transaction. Never a single transaction crossing
 * tenants." The refresh is the case that section names — every tenant's groups are
 * re-evaluated overnight — so the handler declares `each-tenant` and the runner gives
 * it one transaction per tenant. The tenant an iteration belongs to is read from the
 * scope itself, because the job row carries only the tenant that enqueued it and that
 * tenant is one of the loop, not the loop's bounds.
 *
 * ## Why the successor is booked from the owning iteration only
 *
 * A recurring job is not a row the worker rewrites in place (`done` is terminal), so
 * the handler enqueues its own successor inside the same transaction as the refresh.
 * The loop runs this handler once per tenant, and a successor booked in every
 * iteration would be a successor per tenant — one nightly job turning into as many
 * rows as the platform holds tenants. The row belongs to the tenant that enqueued it,
 * and so does the reschedule, which is the one iteration where the two tenant ids
 * agree.
 *
 * ## Seeding
 *
 * The row is seeded by `ensureAudienceRefreshJob`, the counterpart of the other
 * modules' seeds, called where a tenant's groups are already being written. The seed
 * is idempotent on the kind: a tenant that already holds a pending refresh row is a
 * tenant whose groups are already being refreshed, and a second row would be a second
 * night on the same clock.
 */

import type { TransactionClient } from '@/core/db/scope'
import { requireTenantContext } from '@/core/db'
import { JobStatus } from '@/worker/status'
import { enqueueJob } from '@/worker/queue'
import type { JobHandler } from '@/worker/registry'

import { refreshAudienceGroupCounts } from './refresh'

/**
 * The job kind, as the registry is keyed and the queue stores it.
 *
 * Namespaced by the module because the registry is one table for every module's job,
 * and `refresh` alone is a word a later module could want for something else.
 */
export const AUDIENCE_REFRESH_JOB_KIND = 'audience-groups.refresh'

/** How often the refresh runs — one day, which is §12's "nightly". */
export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * The nightly job — re-evaluates the tenant's groups, then books the next night from
 * the iteration that owns the row.
 */
export const audienceRefreshJobHandler: JobHandler = {
  scope: 'each-tenant',
  async run({ tx, job, now }) {
    const { tenantId } = requireTenantContext()

    const refreshed = await refreshAudienceGroupCounts({ tx, tenantId, now })

    if (tenantId === job.tenantId) {
      await enqueueJob({
        tx,
        tenantId: job.tenantId,
        kind: AUDIENCE_REFRESH_JOB_KIND,
        runAt: new Date(now.getTime() + REFRESH_INTERVAL_MS),
      })
    }

    const total = refreshed.reduce((sum, group) => sum + group.count, 0)
    console.info(
      `[audience-groups] refresh at ${now.toISOString()} tenant=${tenantId} ` +
        `groups=${refreshed.length} customers=${total}`,
    )
  },
}

/**
 * Ensures a tenant has a pending refresh row, seeding the nightly schedule.
 *
 * Idempotent on the kind within the tenant, so a caller that runs it on every campaign
 * page does not create a second night.
 *
 * @returns whether a row was created, for the caller's own accounting.
 */
export async function ensureAudienceRefreshJob(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<boolean> {
  const existing = await args.tx.jobQueue.findFirst({
    where: {
      tenantId: args.tenantId,
      kind: AUDIENCE_REFRESH_JOB_KIND,
      status: { in: [JobStatus.Pending, JobStatus.Running] },
    },
    select: { id: true },
  })
  if (existing !== null) return false

  await enqueueJob({
    tx: args.tx,
    tenantId: args.tenantId,
    kind: AUDIENCE_REFRESH_JOB_KIND,
    runAt: args.now,
  })
  return true
}
