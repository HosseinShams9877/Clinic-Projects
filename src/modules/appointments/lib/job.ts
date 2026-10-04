/**
 * The lifecycle job — `02-architecture.md` §12's "Appointment lifecycle transitions
 * | every few minutes | `appointments`", and the module's only producer of work.
 *
 * The two transitions no person performs are facts about the clock, and the clock
 * moves whether or not a person has a page open. The sweep in `lifecycle.ts` is the
 * mechanism; this file is the thing that keeps it running.
 *
 * ## Why the handler reschedules itself
 *
 * A recurring job is not a row the worker rewrites in place: `done` is terminal, and
 * a row that returned to `pending` would be a row the lease rules have to treat as a
 * claim that ended without a failure. So this handler enqueues its own successor
 * inside the same transaction as the sweep — atomic, so a tick that is rolled back
 * does not leave a gap in the schedule, and a tick that commits has already booked
 * the next one. The two rows never overlap: the successor's `runAt` is one interval
 * ahead, so the sweep that claims this tick cannot also claim the next.
 *
 * The interval is a property of the job and not of the queue for the reason §12's
 * cadence column implies — "every few minutes" is this job's own rhythm, and a queue
 * that knew it would be a queue that had to be told every other job's too.
 *
 * ## What the handler may not do
 *
 * Nothing the sweep does not do. `09-security.md` §8: the worker does not go through
 * `requirePermission` because there is no user and no role to check, and the
 * constraint is kept by the state machine — `applyTransition` asks
 * `isSweepTransition`, and a state that is not on the automatic list is a state this
 * job cannot reach. That is what keeps the worker from completing an appointment a
 * person never recorded, and this handler changes nothing about it.
 *
 * ## Seeding
 *
 * The job reschedules itself once it exists, and the row is seeded by
 * `ensureLifecycleJob` below — called where a tenant's settings are already being
 * written, so a clinic that comes online has a sweep from its first minute. The seed
 * is idempotent on the kind: a tenant that already holds a pending lifecycle row is
 * a tenant whose sweep is already booked, and a second row would be a second sweep
 * on the same clock.
 */

import type { TransactionClient } from '@/core/db/scope'
import { JobStatus } from '@/worker/status'
import { enqueueJob } from '@/worker/queue'
import type { JobHandler } from '@/worker/registry'

import { readBookingSettings } from './settings'
import { runLifecycleSweep } from './lifecycle'

/**
 * The job kind, as the registry is keyed and the queue stores it.
 *
 * Namespaced by the module because the registry is one table for every module's jobs
 * (`02-architecture.md` §12's six), and `lifecycle` alone is a word a later module
 * could want for something else. The module's barrel owns the constant so a caller
 * that enqueues by hand and the registry that looks it up cannot disagree about the
 * string.
 */
export const APPOINTMENT_LIFECYCLE_JOB_KIND = 'appointment.lifecycle'

/**
 * How often the sweep runs — five minutes, which is §12's "every few minutes" made
 * concrete.
 *
 * The two transitions are not sensitive to a minute here or there: a booking that
 * should have been promoted at 00:00 is promoted at 00:05, and the alarm's
 * two-hour threshold is a window far wider than the tick. The shorter the interval,
 * the more rows the sweep re-reads to find the few that moved; the longer, the
 * staler a cartable a receptionist opens before the request path's own sweep
 * corrects it.
 */
export const LIFECYCLE_TICK_INTERVAL_MS = 5 * 60 * 1000

/**
 * The lifecycle job — runs the sweep, then books its own next tick.
 *
 * `scope` is the default `own-tenant` and is stated anyway: this job's row is the
 * tenant's, and the sweep is over the tenant's own appointments, so there is no
 * tenant to loop over. A job that spanned tenants would be the audience-group
 * refresh, not this one.
 */
export const lifecycleJobHandler: JobHandler = {
  scope: 'own-tenant',
  async run({ tx, job, now }) {
    // The offset the overdue pass needs is the tenant's own, read here rather than
    // carried in the payload because it is a setting and not a fact about the job —
    // a tenant that changes its offset between two ticks has the second tick read
    // the new one, and a payload would have captured the old.
    const settings = await readBookingSettings(tx, job.tenantId)

    const outcome = await runLifecycleSweep({
      tx,
      tenantId: job.tenantId,
      now,
      utcOffsetMinutes: settings.utcOffsetMinutes,
    })

    await enqueueJob({
      tx,
      tenantId: job.tenantId,
      kind: APPOINTMENT_LIFECYCLE_JOB_KIND,
      runAt: new Date(now.getTime() + LIFECYCLE_TICK_INTERVAL_MS),
    })

    if (outcome.promoted.length > 0 || outcome.flagged.length > 0) {
      // The structured log is where the detail of a tick lives; the job row carries
      // one `lastError` and this tick had none. Reported at `info` because a sweep
      // that moved rows is the sweep working, and a sweep that moved none is the
      // ordinary case between the clinic's opening hours.
      lifecycleLog(now, job.tenantId, outcome)
    }
  },
}

/**
 * Ensures a tenant has a pending lifecycle row, seeding the recurring schedule.
 *
 * Idempotent on the kind within the tenant, so a caller that runs it on every
 * settings write does not create a second sweep: a row already `pending` is a tick
 * already booked. A row in any other state is left alone — a `running` row is a
 * sweep in progress that will reschedule itself, and a `failed` row is a failure an
 * operator is looking at, not one to paper over with a fresh row.
 *
 * @returns whether a row was created, for the caller's own accounting.
 */
export async function ensureLifecycleJob(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<boolean> {
  const existing = await args.tx.jobQueue.findFirst({
    where: {
      tenantId: args.tenantId,
      kind: APPOINTMENT_LIFECYCLE_JOB_KIND,
      status: { in: [JobStatus.Pending, JobStatus.Running] },
    },
    select: { id: true },
  })
  if (existing !== null) return false

  await enqueueJob({
    tx: args.tx,
    tenantId: args.tenantId,
    kind: APPOINTMENT_LIFECYCLE_JOB_KIND,
    runAt: args.now,
  })
  return true
}

/**
 * The one line a tick writes when it moved something.
 *
 * Kept out of the handler so the handler's body is the bargain — sweep, reschedule,
 * report — and the reporting does not grow into the thing a reader has to step over.
 * The counts are the two passes, which are the two facts about a tick: how many rows
 * the day promoted, and how many the clock flagged.
 */
function lifecycleLog(
  now: Date,
  tenantId: string,
  outcome: { readonly promoted: readonly string[]; readonly flagged: readonly string[] },
): void {
  const iso = now.toISOString()
  const promoted = outcome.promoted.length
  const flagged = outcome.flagged.length
  // The worker's own logger is not in a handler's args — `JobRunArgs` carries the
  // transaction, the row and the clock — and the counts are the one fact this module
  // has nobody else to tell. The worker process owns this console.
  console.info(
    `[appointments] lifecycle sweep at ${iso} tenant=${tenantId} promoted=${promoted} flagged=${flagged}`,
  )
}
