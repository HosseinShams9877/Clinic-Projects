/**
 * The worker's health check — `setup/deployment.md` §6.
 *
 * > | `/api/health/worker` | The worker has claimed a job since it last started,
 * > | and its last error time | The worker's supervisor |
 *
 * **The worker's health check is the important one**, the document continues,
 * "because a worker that is running but claiming nothing looks healthy from the
 * outside." A supervisor that probes a process is probing the process; the check
 * that matters is whether the process is doing its job. So the endpoint reports
 * the last time a job was claimed and the last time something raised, and a worker
 * that has gone quiet is reported as unhealthy by the facts rather than by a ping.
 *
 * ## Why an HTTP listener and not a `--health` one-shot
 *
 * `deployment.md` names the endpoint `GET /api/health/worker` and names a
 * supervisor that calls it, which is a process that expects to poll something. A
 * one-shot mode would mean the supervisor spawning a second `tsx` process to answer
 * the question — a process that has to load the environment, build a client and
 * reach the database to say anything useful, for a check that runs every few
 * seconds. The listener costs one socket and answers in microseconds.
 *
 * The listener is a `node:http` server, which is what `node` already has: no
 * framework, no router, one path. It binds to **loopback only**, because the check
 * is for the supervisor and the reverse proxy on the same machine — the endpoint
 * reports the worker's internals and has no reason to be reachable from the
 * network the clinic's patients are on. A reverse proxy that fronts it forwards to
 * `127.0.0.1:<port>` and is the thing that adds TLS (`deployment.md` §7).
 *
 * ## Why the state is a plain object and not a class
 *
 * The loop owns the facts and the server reports them; the object between them is
 * the cheapest thing that lets the loop write a summary and the server read it
 * without the two knowing about each other. `recordPoll` and `recordError` are the
 * only writers, so the fields stay consistent — `lastClaimedAt` moves when a job
 * was claimed, `lastErrorAt` when something raised, and never independently of the
 * fact they describe.
 */

import { createServer, type Server } from 'node:http'

import type { Logger } from './logger'
import { WORKER_EVENTS } from './logger'
import type { PollSummary } from './loop'

/** The path `deployment.md` §6 documents, and the only one this server answers. */
export const HEALTH_PATH = '/api/health/worker'

/**
 * The worker's liveness, as the endpoint reports it.
 *
 * `startedAt` is what makes "claimed a job since it last started" checkable, and
 * `lastErrorMessage` is the one field a supervisor shows a person — the rest are
 * the counts an operator reads when the person asks why.
 */
export interface WorkerHealth {
  readonly startedAt: Date
  polls: number
  lastPollAt: Date | null
  lastClaimedAt: Date | null
  claimedTotal: number
  lastErrorAt: Date | null
  lastErrorMessage: string | null
  /** The job kinds this release can run, from the registry. */
  kinds: readonly string[]
}

/** The health state, with every fact the process has not yet produced. */
export function createWorkerHealth(args: {
  readonly startedAt: Date
  readonly kinds: readonly string[]
}): WorkerHealth {
  return {
    startedAt: args.startedAt,
    kinds: args.kinds,
    polls: 0,
    lastPollAt: null,
    lastClaimedAt: null,
    claimedTotal: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
  }
}

/**
 * Records what a poll produced. The only writer of the claim and poll fields.
 *
 * `failed` counts as an error here, because a job that exhausted its attempts is
 * the condition a supervisor pages someone for — and `errored`, the sweep-level
 * failure, already records itself.
 */
export function recordPoll(health: WorkerHealth, now: Date, summary: PollSummary): void {
  health.polls += 1
  health.lastPollAt = now
  health.claimedTotal += summary.claimed
  if (summary.claimed > 0) health.lastClaimedAt = now
  if (summary.failed > 0 || summary.errored > 0) {
    health.lastErrorAt = now
    health.lastErrorMessage =
      summary.failed > 0
        ? `${summary.failed} job(s) reached their terminal state on this poll.`
        : `${summary.errored} tenant sweep(s) failed on this poll.`
  }
}

/** Records a failure that escaped the poll itself — the loop's own error. */
export function recordError(health: WorkerHealth, now: Date, error: unknown): void {
  health.lastErrorAt = now
  health.lastErrorMessage = error instanceof Error ? error.message : String(error)
}

/**
 * The status a supervisor acts on.
 *
 * `degraded` rather than a boolean, because the two conditions are different
 * actions: a worker that cannot reach the database is down, and a worker that is
 * up and has never claimed anything is up but idle — which is correct after a fresh
 * boot with no jobs, and a condition only a *stale* claim reveals.
 */
export type HealthStatus = 'ok' | 'degraded' | 'down'

/** The body the endpoint returns. */
export interface HealthPayload {
  readonly status: HealthStatus
  readonly uptimeMs: number
  readonly polls: number
  readonly lastPollAt: string | null
  readonly lastClaimedAt: string | null
  readonly claimedTotal: number
  readonly lastErrorAt: string | null
  readonly lastErrorMessage: string | null
  readonly kinds: readonly string[]
}

/**
 * The payload for a probe, with the status derived from the facts.
 *
 * A worker that never claimed a job is `down` only once it is old enough to have
 * had one — the fastest cadence in `02-architecture.md` §12 is "every few minutes",
 * so a boot younger than the lease is a boot that has not had a tick yet. The
 * deadline is the poll interval doubled, which is the first time a tick is
 * unambiguously late rather than merely pending.
 */
export function healthPayload(health: WorkerHealth, now: Date, pollIntervalMs: number): HealthPayload {
  const uptimeMs = now.getTime() - health.startedAt.getTime()

  let status: HealthStatus = 'ok'
  if (health.lastClaimedAt === null && uptimeMs > pollIntervalMs * 2) status = 'degraded'
  if (health.lastErrorAt !== null && health.lastClaimedAt === null) status = 'degraded'
  if (health.lastPollAt === null && uptimeMs > pollIntervalMs * 2) status = 'down'

  return {
    status,
    uptimeMs,
    polls: health.polls,
    lastPollAt: health.lastPollAt === null ? null : health.lastPollAt.toISOString(),
    lastClaimedAt: health.lastClaimedAt === null ? null : health.lastClaimedAt.toISOString(),
    claimedTotal: health.claimedTotal,
    lastErrorAt: health.lastErrorAt === null ? null : health.lastErrorAt.toISOString(),
    lastErrorMessage: health.lastErrorMessage,
    kinds: health.kinds,
  }
}

/**
 * Starts the health server on a loopback port, and returns how to stop it.
 *
 * Port `0` asks the kernel for an ephemeral port, which is what a test does; the
 * resolved port is reported on the returned handle so the test can reach it.
 */
export async function startHealthServer(args: {
  readonly health: WorkerHealth
  readonly port: number
  readonly pollIntervalMs: number
  readonly clock: () => Date
  readonly logger: Logger
}): Promise<{ close(): Promise<void>; readonly port: number }> {
  const server: Server = createServer((request, response) => {
    if (request.url !== HEALTH_PATH) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'not-found' }))
      return
    }
    const payload = healthPayload(args.health, args.clock(), args.pollIntervalMs)
    response.writeHead(payload.status === 'down' ? 503 : 200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    })
    response.end(JSON.stringify(payload))
  })

  await new Promise<void>((resolve) => server.listen(args.port, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : args.port

  args.logger.info(WORKER_EVENTS.healthServerListening, { port })

  return {
    port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      })
    },
  }
}
