/**
 * The claim loop's database half — ADR-0006 and `09-security.md` §8.
 *
 * > "A `Job` table in PostgreSQL with claim semantics — a job is claimed by
 * > updating it with a conditional `where` on its status and owner, and a claim
 * > expires so a killed worker's jobs are recovered."
 *
 * ## Why claiming is a conditional `UPDATE` and not `SELECT … FOR UPDATE`
 *
 * ADR-0006 and `setup/deployment.md` §1 describe the pattern as
 * `SELECT … FOR UPDATE SKIP LOCKED`, which is the right shape on PostgreSQL and
 * does not exist on SQLite — and the claim has to work identically in development,
 * where the engine is SQLite (`10-testing-strategy.md` §2: "tests run against the
 * same engine as production", which the unit suite can only approximate). A
 * conditional `updateMany` is the claim that both engines accept: the `WHERE`
 * clause is `id = ? AND status = 'pending'`, the statement is atomic on both, and
 * a `count` of one is the claim. Two workers issuing it see exactly one succeed —
 * the one that ran second finds the row already `running` and gets zero, which is
 * the correct answer and not an error. `SKIP LOCKED` is the optimisation on top of
 * this, not the correctness mechanism underneath it; the correctness mechanism is
 * the predicate.
 *
 * ## Why a claim is short and the work runs outside it
 *
 * ADR-0006's consequence, stated plainly: "A long-running job holds a row lock for
 * its duration. Mitigated by claiming in one short transaction and running the
 * work outside it, with the job's ownership recorded." So the claim transaction
 * closes before the handler runs — the handler gets its own scoped transaction in
 * `runner.ts` — and the row's `claimedBy` and `claimedAt` are what makes the job
 * owned while it works. A job whose process dies mid-run keeps the claim until the
 * lease expires, and `recoverStaleClaims` is what returns it.
 *
 * ## Why every function here takes a transaction client
 *
 * `JobQueue` is a tenant-scoped model (`src/core/db/tenant-models.ts`), so the
 * extension rejects a query on it that carries no tenant context, and Layer 2
 * refuses the row outright on PostgreSQL. There is no claim without a scope, which
 * is the arrangement `09-security.md` §8 describes: the worker is not exempt from
 * the policy, it sets the context to the job's tenant and works from there. A
 * caller therefore opens the scope and hands these functions the transaction; the
 * queue never decides a tenant, and it never discovers one.
 */

import type { TransactionClient } from '@/core/db/scope'

import {
  describeError,
  JobStatus,
  MAX_JOB_ATTEMPTS,
  retryRunAt,
} from './status'

/** A job that has been claimed and is about to run. */
export interface ClaimedJob {
  readonly id: string
  readonly tenantId: string
  readonly kind: string
  /** Opaque to the worker; the handler owns its own payload schema. */
  readonly payload: string | null
  readonly attempts: number
  /** The moment the job is due, kept so a terminal failure does not move it. */
  readonly runAt: Date
}

/** The fields the queue needs to claim a batch of due jobs. */
export interface ClaimArgs {
  readonly tx: TransactionClient
  readonly now: Date
  /** The claiming process's identity, recorded on the row while it owns the job. */
  readonly workerId: string
  /**
   * The most jobs claimed for one tenant in a single sweep. A bound keeps a
   * backlogged tenant from consuming a whole tick while another tenant's due jobs
   * wait; the rest are claimed on the next poll, which is seconds away.
   */
  readonly batch: number
}

/**
 * Claims the due jobs of the tenant whose transaction this is, in due order.
 *
 * The read and the claim are separate statements on purpose. A single
 * `updateMany` over the due set cannot report *which* rows it took, and a
 * `findMany` alone is not a claim — so the rows are read, then each is claimed by
 * a conditional `UPDATE`, and only the rows that moved are returned. Between the
 * two statements another worker may take one, and that is the case the `count`
 * handles: the row is skipped rather than double-run.
 */
export async function claimDueJobs(args: ClaimArgs): Promise<readonly ClaimedJob[]> {
  const due = await args.tx.jobQueue.findMany({
    where: { status: JobStatus.Pending, runAt: { lte: args.now } },
    orderBy: { runAt: 'asc' },
    take: args.batch,
    select: { id: true, tenantId: true, kind: true, payload: true, attempts: true, runAt: true },
  })

  const claimed: ClaimedJob[] = []
  for (const job of due) {
    const result = await args.tx.jobQueue.updateMany({
      where: { id: job.id, status: JobStatus.Pending },
      data: {
        status: JobStatus.Running,
        claimedAt: args.now,
        claimedBy: args.workerId,
      },
    })
    if (result.count === 1) claimed.push(job)
  }

  return claimed
}

/** The fields a lease recovery needs. */
export interface RecoverArgs {
  readonly tx: TransactionClient
  readonly now: Date
  /** How many seconds a claim may run before another worker may take the job. */
  readonly leaseSeconds: number
  readonly maxAttempts?: number
}

/**
 * Returns the jobs of a tenant whose claim outlived its lease, to the queue.
 *
 * A process that dies mid-run leaves the row `running` with a `claimedAt` that
 * stops moving. The lease is what keeps that job from being lost: once the claim
 * is older than the lease, the job is nobody's, and it goes back to `pending` for
 * the next sweep to claim.
 *
 * A dead claim is an attempt. The increment is what closes the hole a job that
 * always kills its worker would otherwise leave: the budget in `MAX_JOB_ATTEMPTS`
 * is spent on executions that never finished as well as on ones that failed, so a
 * job cannot loop forever by dying. A job whose budget is already exhausted is
 * marked `failed` instead of re-queued, which is the terminal state ADR-0006
 * promises — "after a threshold it is marked failed and surfaced in worker health".
 *
 * Returns how many jobs left the `running` state, for the poll summary and the
 * health check. The two statements partition the set — the first takes the
 * exhausted claims, the second everything still `running` past the lease — so a
 * job is recovered exactly once.
 */
export async function recoverStaleClaims(args: RecoverArgs): Promise<number> {
  const expiredAt = new Date(args.now.getTime() - args.leaseSeconds * 1000)
  const maxAttempts = args.maxAttempts ?? MAX_JOB_ATTEMPTS

  const exhausted = await args.tx.jobQueue.updateMany({
    where: {
      status: JobStatus.Running,
      claimedAt: { lt: expiredAt },
      attempts: { gte: maxAttempts },
    },
    data: {
      status: JobStatus.Failed,
      claimedAt: null,
      claimedBy: null,
      finishedAt: args.now,
      lastError:
        'The claim expired before the job finished, and its attempt budget is exhausted. ' +
        'The process running it did not record an outcome.',
    },
  })

  const requeued = await args.tx.jobQueue.updateMany({
    where: { status: JobStatus.Running, claimedAt: { lt: expiredAt } },
    data: {
      status: JobStatus.Pending,
      claimedAt: null,
      claimedBy: null,
      attempts: { increment: 1 },
    },
  })

  return exhausted.count + requeued.count
}

/**
 * Records a job that completed. Called inside the handler's own transaction, so
 * the work and its outcome commit together — a job that finishes but cannot record
 * the fact is not a job that finished, and the lease is what re-runs it.
 */
export async function completeJob(args: {
  readonly tx: TransactionClient
  readonly jobId: string
  readonly now: Date
}): Promise<void> {
  await args.tx.jobQueue.update({
    where: { id: args.jobId },
    data: {
      status: JobStatus.Done,
      finishedAt: args.now,
      claimedAt: null,
      claimedBy: null,
      // Cleared, so a failure from a previous attempt does not outlive the success
      // that followed it. The audit trail of attempts is the log, not this column.
      lastError: null,
    },
  })
}

/**
 * Records a job whose handler raised, and reports whether it was re-queued or
 * reached its terminal state.
 *
 * The attempt is counted here rather than in the handler, because a handler that
 * counted its own attempts would be a handler that had to know the budget — and
 * the budget is the queue's policy, not the job's. `attempts + 1` is the attempt
 * that just failed, and it is what the backoff is computed from, so the first
 * retry waits the base and each after it doubles.
 */
export async function failJob(args: {
  readonly tx: TransactionClient
  readonly job: ClaimedJob
  readonly now: Date
  readonly error: unknown
  readonly maxAttempts?: number
}): Promise<'requeued' | 'failed'> {
  const maxAttempts = args.maxAttempts ?? MAX_JOB_ATTEMPTS
  const attempts = args.job.attempts + 1
  const terminal = attempts >= maxAttempts

  await args.tx.jobQueue.update({
    where: { id: args.job.id },
    data: {
      status: terminal ? JobStatus.Failed : JobStatus.Pending,
      attempts,
      lastError: describeError(args.error),
      finishedAt: terminal ? args.now : null,
      // A terminal failure keeps its due time, so a row that is being inspected
      // after the fact still says when it was supposed to run.
      runAt: terminal ? args.job.runAt : retryRunAt(args.now, attempts),
      claimedAt: null,
      claimedBy: null,
    },
  })

  return terminal ? 'failed' : 'requeued'
}

/**
 * Records a job the worker cannot execute, without attempting it.
 *
 * `kind` has no handler in this release (`registry.ts`), which is a version skew
 * between the enqueuing module and the worker — not a failure of the job. The
 * attempt is not counted, because nothing ran; the `lastError` is the reason the
 * operator is looking at the row.
 */
export async function skipJob(args: {
  readonly tx: TransactionClient
  readonly jobId: string
  readonly kind: string
  readonly now: Date
}): Promise<void> {
  await args.tx.jobQueue.update({
    where: { id: args.jobId },
    data: {
      status: JobStatus.Skipped,
      finishedAt: args.now,
      claimedAt: null,
      claimedBy: null,
      lastError: `No handler is registered for the job kind \`${args.kind}\` in this release. ` +
        'The module that enqueues it belongs to a later phase than the worker that claimed it.',
    },
  })
}
