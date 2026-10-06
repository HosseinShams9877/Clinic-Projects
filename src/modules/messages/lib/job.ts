/**
 * The dispatch job — `02-architecture.md` §12's "Automatic message dispatch | every
 * 15 minutes | `messages` + `notifications`", and the one producer of the module's
 * own work.
 *
 * The cadence is the architecture document's own, and the interval is a property of
 * the job and not of the queue for the reason §12's cadence column implies — the
 * queue that knew it would be a queue that had to be told every other job's too.
 * Fifteen minutes is the width of a send window's edge and the latency a clinic
 * accepts between a booking and its confirmation.
 *
 * ## Why the handler composes two modules
 *
 * The job is registered under `messages` because the queue it drains is the message
 * ledger, and it runs `notifications`' trigger evaluation because the seven moments
 * are that module's to know (`notifications/lib/triggers.ts`'s header gives the
 * division). The dependency runs one way — `messages` reads `notifications`'s
 * candidates and consent, and `notifications` never reaches into the ledger — so the
 * two modules ship and override separately, and the job is the one place they meet.
 *
 * ## Why the handler reschedules itself
 *
 * A recurring job is not a row the worker rewrites in place: `done` is terminal, and
 * a row that returned to `pending` would be a row the lease rules have to treat as a
 * claim that ended without a failure. So this handler enqueues its own successor
 * inside the same transaction as the dispatch — atomic, so a tick that is rolled back
 * does not leave a gap in the schedule, and a tick that commits has already booked
 * the next one. The two rows never overlap: the successor's `runAt` is one interval
 * ahead, so the dispatch that claims this tick cannot also claim the next.
 *
 * ## Seeding
 *
 * The job reschedules itself once it exists, and the row is seeded by
 * `ensureMessagesDispatchJob` — the counterpart of the lifecycle job's seed, called
 * where a tenant's settings are already being written. The seed is idempotent on the
 * kind: a tenant that already holds a pending dispatch row is a tenant whose messages
 * are already being dispatched, and a second row would be a second dispatch on the
 * same clock.
 */

import type { TransactionClient } from '@/core/db/scope'
import { JobStatus } from '@/worker/status'
import { enqueueJob } from '@/worker/queue'
import type { JobHandler } from '@/worker/registry'

import { flushSendQueue, runAutomaticDispatch } from './dispatch'

/**
 * The job kind, as the registry is keyed and the queue stores it.
 *
 * Namespaced by the module because the registry is one table for every module's jobs
 * (`02-architecture.md` §12's six), and `dispatch` alone is a phrase a later module
 * could want for something else. The module's barrel owns the constant so the worker
 * registry and a caller that enqueues by hand cannot disagree about the string.
 */
export const MESSAGES_DISPATCH_JOB_KIND = 'messages.dispatch'

/**
 * How often the dispatch runs — fifteen minutes, §12's cadence made concrete.
 *
 * A message's timing is finer than a day and coarser than a minute: the day-before
 * reminder is a message about tomorrow, and the booking confirmation is a message
 * about a booking that just happened. A longer interval would hold a confirmation
 * until the customer had stopped expecting one, and a shorter one would re-read the
 * seven triggers for a clinic that is closed.
 */
export const DISPATCH_TICK_INTERVAL_MS = 15 * 60 * 1000

/**
 * The dispatch job — evaluates the seven triggers, flushes what the window released,
 * then books its own next tick.
 *
 * `scope` is the default `own-tenant` and is stated anyway for the same reason the
 * cycle job's is: this job's row is the tenant's, and the dispatch is over the
 * tenant's own messages, so there is no tenant to loop over.
 */
export const messagesDispatchJobHandler: JobHandler = {
  scope: 'own-tenant',
  async run({ tx, job, now }) {
    const outcomes = await runAutomaticDispatch(tx, job.tenantId, now)
    const flushed = await flushSendQueue(tx, job.tenantId, now)

    await enqueueJob({
      tx,
      tenantId: job.tenantId,
      kind: MESSAGES_DISPATCH_JOB_KIND,
      runAt: new Date(now.getTime() + DISPATCH_TICK_INTERVAL_MS),
    })

    const sent = outcomes.filter((outcome) => outcome.result === 'SENT').length
    const suppressed = outcomes.filter((outcome) => outcome.result === 'SUPPRESSED').length
    // The structured log is where the detail of a tick lives; the job row carries one
    // `lastError` and this tick had none. Reported at `info` because a dispatch that
    // sent is the dispatch working, and one that suppressed everything is a clinic
    // whose customers have not consented — a fact the ledger already holds.
    console.info(
      `[messages] dispatch at ${now.toISOString()} tenant=${job.tenantId} ` +
        `sent=${sent} suppressed=${suppressed} flushed=${flushed.length}`,
    )
  },
}

/**
 * Ensures a tenant has a pending dispatch row, seeding the recurring schedule.
 *
 * Idempotent on the kind within the tenant, so a caller that runs it on every settings
 * write does not create a second dispatch: a row already `pending` is a tick already
 * booked. A row in any other state is left alone — a `running` row is a dispatch in
 * progress that will reschedule itself, and a `failed` row is a failure an operator
 * is looking at, not one to paper over with a fresh row.
 *
 * @returns whether a row was created, for the caller's own accounting.
 */
export async function ensureMessagesDispatchJob(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<boolean> {
  const existing = await args.tx.jobQueue.findFirst({
    where: {
      tenantId: args.tenantId,
      kind: MESSAGES_DISPATCH_JOB_KIND,
      status: { in: [JobStatus.Pending, JobStatus.Running] },
    },
    select: { id: true },
  })
  if (existing !== null) return false

  await enqueueJob({
    tx: args.tx,
    tenantId: args.tenantId,
    kind: MESSAGES_DISPATCH_JOB_KIND,
    runAt: args.now,
  })
  return true
}
