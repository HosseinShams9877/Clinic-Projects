/**
 * The worker's structured logger — `05-conventions.md` §11.
 *
 * > "**Structured logs**, one line per event, with `tenantId`, `actorUserId`, and a
 * > a correlation id. Never a bare `console.log` in committed code."
 *
 * The worker is the process this matters most for. It is the one that runs
 * unattended at 6am, it has no request to attach a trace to, and a person reading
 * its output is diagnosing a clinic's reminders not going out — which is a
 * question about *which tenant, which job, which attempt*, not about a message
 * string. Every event below therefore carries the identifiers that answer it, and
 * the event name is a dotted code (`worker.jobFailed`) rather than a sentence, so
 * the line is greppable and the sentence never has to be translated.
 *
 * ## Why the logger is a module and not `console.log`
 *
 * The output is one JSON object per line on stdout, which is the shape a log
 * collector and `journalctl` both accept, and the shape `console.log` cannot
 * produce without a caller formatting it. Every caller formatting it is every
 * caller deciding what a line looks like, and the first thing that drifts is the
 * field that made the line useful — `tenantId` appearing as `tenant` in half the
 * events. One writer, one shape.
 *
 * ## Why the writer is injectable
 *
 * The default writes to `process.stdout`, which is what a process does. A test
 * passes its own writer, because a test that asserted on `console.log` output
 * would be a test of the terminal, and a test that let the worker fill its own
 * output would be a suite nobody reads. The level is injectable for the same
 * reason: the suite runs at `debug` against a capturing writer and production runs
 * at `info` against stdout.
 *
 * ## What is deliberately not here
 *
 * **PII.** `09-security.md` §14 and §11 forbid a phone number, a customer name or
 * a medical note in a log. This logger takes identifiers only — `tenantId`,
 * `jobId`, `kind`, `attempt` — and a caller that passed a customer would be
 * passing it deliberately. Nothing here knows how to redact, because nothing here
 * is given anything to redact.
 *
 * **The audit log.** `§11` separates the two: the application log is events, and
 * `AuditLog` is the record of permission-sensitive actions with an actor. The
 * worker's actor is `system` (`09-security.md` §8: a dedicated service credential,
 * which Phase 1 does not yet issue — `getTenantContextForJob` records
 * `membershipId: 'system'` for exactly this reason), and no job in this release
 * writes an audited action. When one does, it will write the row through the
 * module that owns the action, not through this logger.
 */

import type { Env } from '@/core/config/env'
import type { Clock } from '@/core/lib'

import { realClock } from '@/core/lib'

/**
 * The four levels, spelled the way `LOG_LEVEL` spells them (`config/env.ts`) so the
 * environment's value is a level by construction and not by a mapping.
 */
export type LogLevel = Env['logLevel']

/** The events the logger emits, in the order the process produces them. */
export interface Logger {
  debug(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
}

/**
 * The identifiers that follow an event through the worker.
 *
 * Every field is optional because an event at boot has no tenant and an event at
 * shutdown may have no job; the fields that are present are the ones the code
 * holds, and there is no field a caller fills in from memory.
 */
export interface LogFields {
  readonly tenantId?: string
  readonly jobId?: string
  readonly kind?: string
  readonly attempt?: number
  readonly durationMs?: number
  /** The failure an event reports. Serialised, never rendered. */
  readonly error?: unknown
  readonly [key: string]: unknown
}

/** A line the writer receives, already serialised and level-filtered. */
export interface LogLine {
  readonly level: LogLevel
  readonly event: string
  readonly fields: Readonly<Record<string, unknown>>
}

/** Where a line goes. `process.stdout` in production, a capturing array in a test. */
export type LogWriter = (line: string) => void

/** The events the worker emits, so a test can assert on a name and not a string. */
export const WORKER_EVENTS = {
  started: 'worker.started',
  healthServerListening: 'worker.healthServerListening',
  pollCompleted: 'worker.pollCompleted',
  tenantSweepFailed: 'worker.tenantSweepFailed',
  jobClaimed: 'worker.jobClaimed',
  jobDone: 'worker.jobDone',
  jobRequeued: 'worker.jobRequeued',
  jobFailed: 'worker.jobFailed',
  jobSkipped: 'worker.jobSkipped',
  jobUnresolved: 'worker.jobUnresolved',
  jobTenantFailed: 'worker.jobTenantFailed',
  unknownJobKind: 'worker.unknownJobKind',
  leaseRecovered: 'worker.leaseRecovered',
  pollFailed: 'worker.pollFailed',
  shuttingDown: 'worker.shuttingDown',
  stopped: 'worker.stopped',
} as const

/**
 * Builds a logger for one process run.
 *
 * `runId` is the correlation id `§11` names: one id for the process, present on
 * every line, so the events of a single boot are a single greppable group even
 * when two workers share a log stream. A job's own correlation is its `jobId`,
 * which is unique per row and therefore per unit of work.
 */
export function createLogger(args: {
  readonly level: LogLevel
  readonly runId: string
  /** The clock the line's `ts` is read from; `realClock` in the process, fixed in a test. */
  readonly clock?: Clock
  readonly writer?: LogWriter
}): Logger {
  const writer = args.writer ?? defaultWriter
  const clock = args.clock ?? realClock
  const threshold = LEVEL_ORDER[args.level]

  const emit = (level: LogLevel, event: string, fields: LogFields | undefined): void => {
    if (LEVEL_ORDER[level] < threshold) return

    const line: LogLine = { level, event, fields: serialiseFields(fields) }
    writer(JSON.stringify({ ...line, ts: clock().toISOString(), runId: args.runId }))
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  }
}

/**
 * The order the levels filter by, so a threshold at `warn` keeps `warn` and
 * `error` and drops the rest. Written as a record rather than an array because the
 * lookup is by name and the comparison is by number.
 */
const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * The fields as a line carries them: the error serialised, everything else as it
 * was given. A separate function because the error is the one field that has to be
 * turned into data — an `Error` object serialises to `{}`, which is a line that
 * says nothing about the thing it was for.
 */
function serialiseFields(
  fields: LogFields | undefined,
): Readonly<Record<string, unknown>> {
  if (fields === undefined) return {}
  const { error, ...rest } = fields
  return error === undefined ? rest : { ...rest, error: serialiseError(error) }
}

/**
 * An error as a line carries it: name, message, and — at `error` only — the stack,
 * which is the developer's evidence and never the operator's. `§7` puts the stack
 * in the log and never in the UI, and the log is here.
 */
function serialiseError(error: unknown): unknown {
  if (!(error instanceof Error)) return String(error)
  return { name: error.name, message: error.message, stack: error.stack }
}

/** Writes to stdout, which is where a process's structured output belongs. */
function defaultWriter(line: string): void {
  process.stdout.write(`${line}\n`)
}
