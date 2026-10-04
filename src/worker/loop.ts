/**
 * The poll loop — one sweep of the queue.
 *
 * `01-tech-stack.md` §4 and ADR-0006: the worker is a queue consumer, and the
 * queue is a table. This module is the consumer: it finds the tenants that have
 * work, recovers the claims that died, claims what is due, and hands each job to
 * the runner. The repetition is `main.ts`'s; this is what one pass does.
 *
 * ## Why the sweep is a loop over tenants, not a query over the job table
 *
 * `JobQueue` is a tenant-scoped model, so a query on it outside a tenant scope is
 * refused by Layer 1 and empty under Layer 2 — there is no "all tenants" query
 * path, and `09-security.md` §8 states that as a rule rather than a convention.
 * The sweep is therefore a **loop over tenants**: the registry is read for the
 * active tenant ids, and each tenant gets its own short scoped transaction to
 * recover and claim in, which is §8's iteration rule ("a loop over tenants, each
 * iteration in its own scoped transaction") and the shape of every sweep from now
 * on.
 *
 * The registry read is the one cross-tenant read the worker makes, and it is the
 * *registry*: `Tenant` is deliberately not in `TENANT_SCOPED_MODELS`
 * (`src/core/db/tenant-models` explains why — it "is the tenant registry …
 * readable through `resolveTenant()` rather than by a model query a module
 * writes"), so the scoped client permits it, and the ids it returns are not tenant
 * data. Everything after it is per-tenant: the recovery, the claim, the run and the
 * outcome.
 *
 * **A gap this module does not close, stated because it is real.** The RLS policy
 * in `prisma/migrations-pg/0001_tenant_isolation.sql` matches `tenants` on
 * `id = current_setting('app.tenant_id', true)`, which is NULL outside a scope, so
 * on PostgreSQL the same read returns no rows. A job's tenant cannot be discovered
 * from a table that needs the tenant to be known, so the loop's starting read is
 * the one place the chicken-and-egg is unresolved — and it is the same boundary
 * `getTenantContext()` hits when it resolves a session, not a corner the worker
 * invented. The loop is built so that the moment a tenant *is* known, every query
 * is scoped; the registry read is the single seam that has to be settled for the
 * sweep to start.
 *
 * ## Why a tick is one moment
 *
 * `pollOnce` takes `now` rather than reading the clock, so one tick is one moment
 * and every job it claims is claimed against the same instant — which is what
 * makes "the job was due at 06:00 and the tick that took it ran at 06:00:03" a
 * statement the logs can support. The clock is still read once per job for a
 * duration, because that is a fact about the job and not about the tick.
 */

import type { Clock } from '@/core/lib'
import type { PrismaClient } from '@/generated/prisma/client'

import { getTenantContextForJob } from '@/core/db/context'
import { runInTenantScope } from '@/core/db/scope'

import type { Logger } from './logger'
import { WORKER_EVENTS } from './logger'
import { claimDueJobs, recoverStaleClaims } from './queue'
import { handlerFor, runJob, type JobOutcome } from './runner'
import type { JobRegistry } from './registry'
import { MAX_JOB_ATTEMPTS } from './status'

/** The knobs a sweep reads, all of them documented in `config/env.ts` or `status.ts`. */
export interface PollConfig {
  /** The lease, in seconds, before a claim may be reclaimed. */
  readonly leaseSeconds: number
  /** The most jobs claimed per tenant in one sweep. */
  readonly claimBatch: number
  /** The attempt budget; passed through so the queue's policy stays one number. */
  readonly maxAttempts?: number
}

/** The counters a summary carries, which are also the keys an outcome maps onto. */
type CounterKey = 'done' | 'requeued' | 'failed' | 'skipped' | 'errored'

/** What one sweep did, for the log line and the health check. */
export interface PollSummary {
  readonly tenants: number
  readonly recovered: number
  readonly claimed: number
  readonly done: number
  readonly requeued: number
  readonly failed: number
  readonly skipped: number
  /** Jobs that could not run at all: a closed tenant, or a sweep-level failure. */
  readonly errored: number
}

/** The arguments one sweep needs. */
export interface PollArgs {
  readonly client: PrismaClient
  readonly now: Date
  /** The clock, read once per job to measure its duration. Never the wall clock. */
  readonly clock: Clock
  readonly registry: JobRegistry
  readonly config: PollConfig
  /** The claiming process's identity, written on every row it claims. */
  readonly workerId: string
  readonly multiTenant: boolean
  readonly logger: Logger
}

/**
 * The counter an outcome lands in. `unresolved` counts as `errored` — a job whose
 * tenant closed did not run and did not fail, and the summary's `errored` is the
 * column that says so. `satisfies Record<JobOutcome, CounterKey>` is what keeps it
 * in step: an outcome added to the runner without an arm here is a compile error.
 */
const COUNTER_FOR_OUTCOME: Readonly<Record<JobOutcome, CounterKey>> = {
  done: 'done',
  requeued: 'requeued',
  failed: 'failed',
  skipped: 'skipped',
  unresolved: 'errored',
}

/** The ids of the tenants a sweep will visit, in a stable order. */
export async function activeTenantIds(client: PrismaClient): Promise<readonly string[]> {
  const tenants = await client.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  return tenants.map((tenant) => tenant.id)
}

/**
 * Runs one sweep of the queue and reports what it did.
 *
 * A tenant whose sweep raises — the context refuses a tenant that closed between
 * the registry read and the resolution, or the database became unreachable — is
 * logged and skipped, and the sweep continues with the tenants after it. Isolation
 * of failure is the point of the per-tenant structure (`01-tech-stack.md` §4), and
 * a tenant that broke a tick is a tenant that gets the next one.
 */
export async function pollOnce(args: PollArgs): Promise<PollSummary> {
  const tenantIds = await activeTenantIds(args.client)
  const counters: Record<CounterKey, number> & { recovered: number; claimed: number } = {
    recovered: 0,
    claimed: 0,
    done: 0,
    requeued: 0,
    failed: 0,
    skipped: 0,
    errored: 0,
  }

  for (const tenantId of tenantIds) {
    try {
      // Recovery and the claim share one short transaction, which is what makes
      // "recovered and re-claimed inside the same sweep" impossible: the recovery's
      // commit is what makes the row visible to the claim that follows it.
      const context = await getTenantContextForJob({
        client: args.client,
        tenantId,
        multiTenant: args.multiTenant,
      })
      const jobs = await runInTenantScope(context, args.client, async (tx) => {
        counters.recovered += await recoverStaleClaims({
          tx,
          now: args.now,
          leaseSeconds: args.config.leaseSeconds,
          maxAttempts: args.config.maxAttempts ?? MAX_JOB_ATTEMPTS,
        })
        return claimDueJobs({
          tx,
          now: args.now,
          workerId: args.workerId,
          batch: args.config.claimBatch,
        })
      })

      counters.claimed += jobs.length
      for (const job of jobs) {
        const outcome = await runJob({
          client: args.client,
          job,
          handler: handlerFor(args.registry, job.kind),
          now: args.now,
          clock: args.clock,
          multiTenant: args.multiTenant,
          // The list the sweep is walking, for a handler whose scope spans tenants.
          tenantIds,
          logger: args.logger,
          maxAttempts: args.config.maxAttempts ?? MAX_JOB_ATTEMPTS,
        })
        counters[COUNTER_FOR_OUTCOME[outcome]] += 1
      }
    } catch (error) {
      counters.errored += 1
      args.logger.error(WORKER_EVENTS.tenantSweepFailed, { tenantId, error })
    }
  }

  const summary: PollSummary = { tenants: tenantIds.length, ...counters }
  args.logger.info(WORKER_EVENTS.pollCompleted, { ...summary })
  return summary
}
