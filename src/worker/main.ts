/**
 * The worker's process entry — `npm run worker` (`01-tech-stack.md` §4,
 * `02-architecture.md` §12).
 *
 * The file is wiring and nothing else. Every decision the worker makes is in the
 * modules beside it — the claim in `queue.ts`, the scope in `runner.ts`, the sweep
 * in `loop.ts`, the endpoint in `health.ts` — because a decision made here is a
 * decision a test cannot reach, and this file is the one the process runs and no
 * test imports. What belongs here is exactly four things:
 *
 * 1. **Build the objects the process holds for its lifetime** — one Prisma client
 *    (`client.ts` names this as one of the two entry points that controls
 *    construction, and the reason is the same as `prisma()`'s laziness: a client
 *    built here is a client whose connection is the process's), one logger, and the
 *    health state the loop writes and the endpoint reads.
 * 2. **Repeat the sweep.** `setTimeout` recursion, not `setInterval`: a tick that
 *    runs long delays the next one instead of racing it, and two sweeps never
 *    overlap the same rows.
 * 3. **Stop gracefully.** SIGINT and SIGTERM finish the in-flight tick, close the
 *    health server and disconnect the client. A second signal exits at once, which
 *    is what an operator means by it. The lease is the bound on how long the
 *    process waits — the lease *is* "how long a job may run", so it is the longest
 *    a shutdown waits, and a deploy that cannot wait sends the signal twice.
 * 4. **Fail loudly at boot.** `getEnv()` refuses an environment that cannot serve
 *    the process, and the failure reaches stderr as one structured line, because
 *    the one thing a supervisor must be able to read is why the worker did not
 *    start.
 *
 * ## Why the clock is read here and passed down
 *
 * `05-conventions.md` §8 bans reading the ambient clock anywhere but
 * `src/core/lib/clock.ts`, and the poll loop takes the moment it acts on as a
 * parameter so one tick is one instant for every tenant it sweeps. This file is the
 * one place `realClock` is called on the worker's behalf: it produces the `now` a
 * tick claims against, and the `clock` the runner measures a job's duration with.
 */

import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'

import { loadEnvConfig } from '@next/env'

import { getEnv } from '@/core/config/env'
import { createPrismaClient } from '@/core/db/client'
import { realClock } from '@/core/lib'

import {
  createLogger,
  WORKER_EVENTS,
} from './logger'
import {
  createWorkerHealth,
  recordError,
  recordPoll,
  startHealthServer,
} from './health'
import { pollOnce, type PollConfig } from './loop'
import { JOB_REGISTRY } from './registry'

/**
 * The identity this process writes on every job it claims.
 *
 * `09-security.md` §8 names a dedicated service credential as the worker's actor;
 * Phase 1 does not issue one, and `getTenantContextForJob` records `system` as the
 * membership for exactly that reason. What the *claim* needs is an owner
 * distinguishable from another worker process on the same database, which is the
 * host and the pid — enough to see which process holds a stuck claim, and nothing
 * about a person.
 */
const WORKER_ID = `${hostname()}:${process.pid}`

/**
 * The most jobs claimed for one tenant in a single sweep.
 *
 * Not in `config/env.ts` because it is not a deployment knob — it is the fairness
 * bound that keeps a tenant with a backlog from consuming a whole tick while
 * another tenant's due jobs wait. The rest of the backlog is claimed on the next
 * poll, `WORKER_POLL_INTERVAL_MS` away, and a tenant that produces more than this
 * per poll is a tenant whose volume is a capacity question and not a queue one.
 */
const CLAIM_BATCH = 20

async function main(): Promise<void> {
  // `npm run worker` is `tsx`, not `next`, so `.env` is not read before the process
  // starts — this is the loader Next itself runs at boot, so the worker and the app
  // see the same file. It comes before `getEnv()`, which is the first reader, and it
  // supplies nothing of its own: a variable neither this nor the shell provides still
  // fails below, naming the thing it needs (`09-security.md` §14).
  loadEnvConfig(process.cwd())

  const env = getEnv()
  const logger = createLogger({ level: env.logLevel, runId: randomUUID() })

  logger.info(WORKER_EVENTS.started, {
    workerId: WORKER_ID,
    pollIntervalMs: env.worker.pollIntervalMs,
    leaseSeconds: env.worker.leaseSeconds,
    healthPort: env.worker.healthPort,
    multiTenant: env.multiTenant,
    kinds: JOB_REGISTRY.kinds,
  })

  const client = createPrismaClient(env.databaseUrl)
  const health = createWorkerHealth({ startedAt: realClock(), kinds: JOB_REGISTRY.kinds })
  const healthServer = await startHealthServer({
    health,
    port: env.worker.healthPort,
    pollIntervalMs: env.worker.pollIntervalMs,
    clock: realClock,
    logger,
  })

  const config: PollConfig = {
    leaseSeconds: env.worker.leaseSeconds,
    claimBatch: CLAIM_BATCH,
  }

  let stopping = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inflight: Promise<void> | undefined

  /** One tick: one sweep, and the health state that records what it did. */
  const runTick = async (): Promise<void> => {
    const now = realClock()
    try {
      const summary = await pollOnce({
        client,
        now,
        clock: realClock,
        registry: JOB_REGISTRY,
        config,
        workerId: WORKER_ID,
        multiTenant: env.multiTenant,
        logger,
      })
      recordPoll(health, now, summary)
    } catch (error) {
      // `pollOnce` keeps a tenant's failure from ending the sweep; reaching here
      // means the loop itself broke, which is the database or the wrapper.
      recordError(health, now, error)
      logger.error(WORKER_EVENTS.pollFailed, { error })
    }
  }

  /** Schedules the next tick once this one has settled, and never leaves a rejection behind. */
  const scheduleNext = (): void => {
    timer = setTimeout(() => {
      inflight = runTick()
      inflight.then(
        () => {
          if (!stopping) scheduleNext()
        },
        (error) => {
          logger.error(WORKER_EVENTS.pollFailed, { error })
          if (!stopping) scheduleNext()
        },
      )
    }, env.worker.pollIntervalMs)
  }

  /**
   * Finishes the in-flight tick, closes the endpoint and the connection, and exits.
   *
   * The lease is the grace period for the same reason it is the lease: it is the
   * definition of how long a job may run, so it is the longest a shutdown waits for
   * one. A tick that exceeds it is a tick the lease will return to the queue
   * anyway, and an operator who cannot wait sends the signal a second time.
   */
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) {
      logger.error(WORKER_EVENTS.shuttingDown, { signal, note: 'A second signal was received; exiting without waiting.' })
      process.exit(1)
    }
    stopping = true
    logger.info(WORKER_EVENTS.shuttingDown, { signal })

    if (timer !== undefined) clearTimeout(timer)
    if (inflight !== undefined) {
      const settled = await Promise.race([
        inflight.then(() => 'finished' as const),
        new Promise<'timed-out'>((resolve) =>
          setTimeout(() => resolve('timed-out'), env.worker.leaseSeconds * 1000),
        ),
      ])
      if (settled === 'timed-out') {
        logger.warn(WORKER_EVENTS.shuttingDown, { note: 'The in-flight tick did not finish before the lease; the job it holds will be recovered.' })
      }
    }

    await healthServer.close()
    await client.$disconnect()
    logger.info(WORKER_EVENTS.stopped)
    process.exit(0)
  }

  process.on('SIGINT', (signal) => void shutdown(signal))
  process.on('SIGTERM', (signal) => void shutdown(signal))

  // The first tick runs immediately rather than after one interval: a process that
  // was started because work is waiting should look for it now, and the health
  // check's "claimed a job since it last started" is satisfied by the first sweep.
  inflight = runTick()
  inflight.then(() => scheduleNext(), (error) => {
    logger.error(WORKER_EVENTS.pollFailed, { error })
    scheduleNext()
  })
}

main().catch((error) => {
  // Reached only when something before the logger exists fails — which is the
  // environment refusing to parse. The logger is not there to write it, and the
  // one thing a supervisor must be able to read is why the worker did not start,
  // so the line goes to stderr in the same shape the logger would have written.
  process.stderr.write(
    `${JSON.stringify({
      level: 'error',
      event: WORKER_EVENTS.started,
      msg: error instanceof Error ? error.message : String(error),
    })}\n`,
  )
  process.exit(1)
})
