/**
 * The status set of `JobQueue.status`, and the retry policy the worker applies to
 * it.
 *
 * `prisma/schema.prisma` types the column as a plain `String`, and
 * `03-data-model.md` §6 documents `JobQueue` in one line — "Worker job table with
 * claim semantics" — without closing the values the way `06-constants.md` §4
 * closes every other set. That is not an oversight to paper over: the set belongs
 * to the worker the way the module constants belong to their modules, because the
 * worker is the column's only writer and its only reader. A set held in
 * `src/core/constants` would be a set documented by a document that does not
 * document it (`enums.ts` opens with "The closed sets of `06-constants.md` §4"),
 * so it lives here with the code that makes each value true.
 *
 * The values are lowercase because the claim is written as
 * `UPDATE … WHERE status = 'pending'` (`01-tech-stack.md` §4, ADR-0006), and the
 * query that has to match is the one a DBA reads off the queue at 2am.
 *
 * ## The shape of the lifecycle
 *
 * ```text
 * pending ──claim──→ running ──success──→ done
 *    ↑                  │
 *    │                  └──failure──→ pending (backoff) … until the budget is
 *    │                                  exhausted, then failed
 *    └──lease expired───┘
 * ```
 *
 * `skipped` is the terminal state for a job whose `kind` no handler in the
 * registry recognises. It is not `failed`: nothing was attempted, and the
 * condition is a version skew between the module that enqueued the job and the
 * worker release that picked it up — a deployment fact, not a retryable error.
 * Marking it `failed` would make it look like a job that ran and broke; marking
 * it `skipped` is what makes the count in the health check read as "this worker
 * does not know that kind yet".
 *
 * ## The retry policy
 *
 * `MAX_JOB_ATTEMPTS` and the backoff are not in the specification. ADR-0006 states
 * the obligation — "a failed job increments an attempt count and returns to the
 * queue with backoff; after a threshold it is marked failed and surfaced in worker
 * health" — and an obligation with no numbers is an obligation nobody implements.
 * The numbers below are the chosen values, recorded here so they are reviewable in
 * one place instead of scattered through the queue code.
 */

/**
 * The five values `JobQueue.status` may hold.
 *
 * Kept as the house shape (`05-conventions.md` §2) — an `as const` object and a
 * derived union — because a native `enum` is forbidden there, and because the
 * column is a `String` on both engines and the union is what a query is written
 * against.
 */
export const JobStatus = {
  /** Waiting for a worker to claim it. */
  Pending: 'pending',
  /** Claimed and currently being executed, or claimed by a process that died. */
  Running: 'running',
  /** Completed without error. */
  Done: 'done',
  /** Attempted and exhausted its attempt budget. */
  Failed: 'failed',
  /** Never attempted: its kind has no handler in this release. */
  Skipped: 'skipped',
} as const
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus]

/**
 * How many times a job is allowed to run before it is terminal.
 *
 * Five is the choice, not a specification value. It is the count of *executions*:
 * a job claimed with `attempts = 4` that fails reaches `attempts = 5` and becomes
 * `failed`, so the runs happen at 0, 1, 2, 3 and 4. A job that kills its worker
 * mid-run counts the dead claim as an attempt too (see `recoverStaleClaims`), so
 * the budget is what makes "a job that never finishes" impossible rather than
 * merely unlikely.
 */
export const MAX_JOB_ATTEMPTS = 5

/**
 * The base of the exponential backoff, and the ceiling it stops growing at.
 *
 * Exponential rather than fixed because the failures that reach the backoff are
 * gateway timeouts and locked rows — conditions that a longer wait genuinely
 * helps, and that a fixed one-minute retry would hammer exactly as hard on the
 * fifth try as on the first. The ceiling keeps a job from vanishing for a day
 * after four failures; an hour is the longest a reminder or a refresh is worth
 * being late.
 */
export const RETRY_BACKOFF_BASE_MS = 60_000
export const RETRY_BACKOFF_MAX_MS = 60 * 60 * 1000

/**
 * The longest `lastError` the worker will store.
 *
 * The column is a `String`, and a stack trace is not. The trace goes to the
 * structured log, where `05-conventions.md` §11 says internal detail belongs; the
 * column keeps the message, which is what an operator reading the queue needs, and
 * the truncation is what keeps a pathological error from filling the row.
 */
export const LAST_ERROR_MAX_LENGTH = 2000

/**
 * The moment a failed attempt becomes due again.
 *
 * Pure on the clock, so a test asserts the backoff by asserting the clock. The
 * exponent is the attempt *number*, so the first retry waits the base and each
 * after it doubles — `60s, 2m, 4m, 8m`, capped at an hour.
 */
export function retryRunAt(now: Date, attempts: number): Date {
  const exponent = Math.max(attempts, 1)
  const delay = Math.min(RETRY_BACKOFF_BASE_MS * 2 ** (exponent - 1), RETRY_BACKOFF_MAX_MS)
  return new Date(now.getTime() + delay)
}

/**
 * The message the queue stores for a failure, truncated to the column's budget.
 *
 * `§11`: "Internal detail never reaches the UI" — the UI never reads this column,
 * but the log gets the name and the stack, and the row gets a message an operator
 * can act on. `String(error)` rather than a stack, because the trace is a property
 * of the run and the queue row is a property of the job.
 */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return message.length > LAST_ERROR_MAX_LENGTH
    ? `${message.slice(0, LAST_ERROR_MAX_LENGTH)}…`
    : message
}
