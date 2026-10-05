/**
 * The next-due job — `02-architecture.md` §12's "Cycle next-due sweep | hourly |
 * `cycles`", and the module's only producer of work.
 *
 * The cadence is §12's own ("hourly"), and the interval is a property of the job and not
 * of the queue for the reason §12's cadence column implies — the queue that knew it would
 * be a queue that had to be told every other job's too.
 *
 * ## Why the handler reschedules itself
 *
 * A recurring job is not a row the worker rewrites in place: `done` is terminal, and a
 * row that returned to `pending` would be a row the lease rules have to treat as a claim
 * that ended without a failure. So this handler enqueues its own successor inside the
 * same transaction as the sweep — atomic, so a tick that is rolled back does not leave a
 * gap in the schedule, and a tick that commits has already booked the next one. The two
 * rows never overlap: the successor's `runAt` is one interval ahead, so the sweep that
 * claims this tick cannot also claim the next.
 *
 * ## Seeding
 *
 * The job reschedules itself once it exists, and the row is seeded by
 * `ensureCycleDueJob` — the counterpart of the lifecycle job's seed, called where a
 * tenant's settings are already being written. The seed is idempotent on the kind: a
 * tenant that already holds a pending next-due row is a tenant whose sweep is already
 * booked, and a second row would be a second sweep on the same clock.
 */

import type { TransactionClient } from '@/core/db/scope'
import { JobStatus } from '@/worker/status'
import { enqueueJob } from '@/worker/queue'
import type { JobHandler } from '@/worker/registry'

import { runCycleDueSweep } from './sweep'

/**
 * The job kind, as the registry is keyed and the queue stores it.
 *
 * Namespaced by the module because the registry is one table for every module's jobs
 * (`02-architecture.md` §12's six), and `next-due` alone is a phrase a later module could
 * want for something else. The module's barrel owns the constant so a caller that
 * enqueues by hand and the registry that looks it up cannot disagree about the string.
 */
export const CYCLE_DUE_JOB_KIND = 'cycles.next-due'

/**
 * How often the sweep runs — one hour, which is §12's "hourly" made concrete.
 *
 * A due date is a day, and the day is far wider than the tick. The shorter the interval,
 * the more cycles the sweep re-reads to find the few whose day arrived; the longer, the
 * later a due cycle reaches the desk's list — and the request path's own recompute covers
 * that latency anyway, because a list opened is a list recomputed.
 */
export const CYCLE_TICK_INTERVAL_MS = 60 * 60 * 1000

/**
 * The next-due job — runs the sweep, then books its own next tick.
 *
 * `scope` is the default `own-tenant` and is stated anyway for the same reason the
 * lifecycle job's is: this job's row is the tenant's, and the sweep is over the tenant's
 * own cycles, so there is no tenant to loop over. A job that spanned tenants would be
 * the audience-group refresh, not this one.
 */
export const cycleDueJobHandler: JobHandler = {
  scope: 'own-tenant',
  async run({ tx, job, now }) {
    const entered = await runCycleDueSweep(tx, job.tenantId, now)

    await enqueueJob({
      tx,
      tenantId: job.tenantId,
      kind: CYCLE_DUE_JOB_KIND,
      runAt: new Date(now.getTime() + CYCLE_TICK_INTERVAL_MS),
    })

    if (entered.length > 0) {
      // The structured log is where the detail of a tick lives; the job row carries one
      // `lastError` and this tick had none. Reported at `info` because a sweep that
      // listed cycles is the sweep working, and a sweep that listed none is the ordinary
      // case in the hours a clinic is closed.
      console.info(
        `[cycles] next-due sweep at ${now.toISOString()} tenant=${job.tenantId} entered=${entered.length}`,
      )
    }
  },
}

/**
 * Ensures a tenant has a pending next-due row, seeding the recurring schedule.
 *
 * Idempotent on the kind within the tenant, so a caller that runs it on every settings
 * write does not create a second sweep: a row already `pending` is a tick already
 * booked. A row in any other state is left alone — a `running` row is a sweep in
 * progress that will reschedule itself, and a `failed` row is a failure an operator is
 * looking at, not one to paper over with a fresh row.
 *
 * @returns whether a row was created, for the caller's own accounting.
 */
export async function ensureCycleDueJob(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<boolean> {
  const existing = await args.tx.jobQueue.findFirst({
    where: {
      tenantId: args.tenantId,
      kind: CYCLE_DUE_JOB_KIND,
      status: { in: [JobStatus.Pending, JobStatus.Running] },
    },
    select: { id: true },
  })
  if (existing !== null) return false

  await enqueueJob({
    tx: args.tx,
    tenantId: args.tenantId,
    kind: CYCLE_DUE_JOB_KIND,
    runAt: args.now,
  })
  return true
}
