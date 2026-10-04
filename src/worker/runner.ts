/**
 * The job runner — where a claimed job becomes tenant-scoped work.
 *
 * `09-security.md` §8 states the worker's constraints, and this module is the one
 * that keeps each of them:
 *
 * | Rule | How it is kept here |
 * |---|---|
 * | **Tenant scope: explicit per job.** No "all tenants" query path. | A job is run by opening `runInTenantScope` for *its* tenant, via `getTenantContextForJob`. The handler receives a transaction already scoped; it does not ask for a tenant and cannot name one. |
 * | **The worker is not exempt from RLS.** | The scope the handler runs in is the same wrapper the web tier uses, which issues `set_config('app.tenant_id', …, true)` inside the transaction. |
 * | **No `requirePermission`.** | A handler declares what it does; `registry.ts` documents the bargain, and this module hands the handler a scoped transaction and nothing else. |
 * | **Iteration is a loop over tenants, one scoped transaction each.** | A handler with `scope: 'each-tenant'` is run once per active tenant, each in its own scope. Prisma does not nest interactive transactions, so the loop is not inside an outer scope — an outer transaction would be a transaction crossing tenants, which is the thing §8 forbids. |
 * | **The worker cannot alter permissions, roles or memberships, and cannot record a payment.** | A handler's entire surface is a tenant-scoped transaction. The functions behind those actions are module functions that take a context and call `requirePermission`; the worker reaches them through the same barrels the web tier does, so the constraint is the module layer's to keep and not the worker's to waive. |
 *
 * ## Why the outcome is recorded in a scope of its own when a job fails
 *
 * The handler's transaction rolls back when the handler raises, which is the
 * property that makes "the work and its outcome commit together" true for the
 * successful case and unavailable for the failing one: there is nothing to record
 * the failure *in*, because the transaction is gone. The failure is therefore
 * written by a second, separate scope — a short transaction whose only job is to
 * count the attempt and set the state. If that write fails too, the error
 * propagates to the poll loop, the job stays `running`, and the lease returns it.
 * Nothing is lost and nothing is silently swallowed (`05-conventions.md` §7).
 *
 * ## Why an unresolved tenant is not a failure
 *
 * `getTenantContextForJob` refuses a closed tenant, and a job whose tenant closed
 * cannot be recorded either — every write on `JobQueue` needs that tenant's scope.
 * The honest answer is to leave the row as it is: `running` in a tenant the worker
 * will not serve, inert because the tenant is. That is the fail-closed outcome, and
 * it is reported as `unresolved` rather than `failed` so the poll summary says
 * "a tenant was closed" and not "a job broke".
 */

import type { Clock } from '@/core/lib'
import type { PrismaClient } from '@/generated/prisma/client'

import type { ResolvedTenantContext } from '@/core/db/context'
import { getTenantContextForJob } from '@/core/db/context'
import { runInTenantScope } from '@/core/db/scope'

import type { Logger } from './logger'
import { WORKER_EVENTS } from './logger'
import { completeJob, type ClaimedJob, failJob, skipJob } from './queue'
import type { JobHandler, JobRegistry } from './registry'
import { MAX_JOB_ATTEMPTS } from './status'

/** What a single job's execution produced, for the poll summary and the health check. */
export type JobOutcome = 'done' | 'requeued' | 'failed' | 'skipped' | 'unresolved'

/** The fields the runner needs to run one claimed job. */
export interface RunJobArgs {
  readonly client: PrismaClient
  readonly job: ClaimedJob
  /** The handler for `job.kind`, or `undefined` when the registry does not know it. */
  readonly handler: JobHandler | undefined
  /** The moment the poll tick is running at; durations are measured from here. */
  readonly now: Date
  /** The clock, read once per job to measure its duration. Never the wall clock. */
  readonly clock: Clock
  /** `MULTI_TENANT`, which a job's context carries as `isSingleTenantMode`. */
  readonly multiTenant: boolean
  /** The active tenants, for a handler whose `scope` is `each-tenant`. */
  readonly tenantIds: readonly string[]
  readonly logger: Logger
  readonly maxAttempts?: number
}

/**
 * Runs one claimed job under its tenant scope and records the outcome.
 *
 * Never throws: a job that failed, a tenant that closed and a kind no handler
 * knows are all outcomes the worker reports and continues from. An error that
 * escapes this function is an error the poll loop has to see, which is the
 * database going away or a bug in the wrapper — and those are the poll's to log,
 * not the job's.
 */
export async function runJob(args: RunJobArgs): Promise<JobOutcome> {
  const { client, job, now } = args

  // A job is recorded in its own tenant's scope, so the tenant has to resolve
  // before anything else — including the skip, which is a write.
  let context: ResolvedTenantContext
  try {
    context = await getTenantContextForJob({
      client,
      tenantId: job.tenantId,
      multiTenant: args.multiTenant,
    })
  } catch (error) {
    args.logger.warn(WORKER_EVENTS.jobUnresolved, {
      jobId: job.id,
      tenantId: job.tenantId,
      kind: job.kind,
      attempt: job.attempts,
      error,
    })
    return 'unresolved'
  }

  const handler = args.handler
  if (handler === undefined) {
    args.logger.warn(WORKER_EVENTS.unknownJobKind, {
      jobId: job.id,
      tenantId: job.tenantId,
      kind: job.kind,
    })
    await runInTenantScope(context, client, (tx) =>
      skipJob({ tx, jobId: job.id, kind: job.kind, now }),
    )
    return 'skipped'
  }

  if (handler.scope === 'each-tenant') {
    return runAcrossTenants(args, context, handler)
  }

  try {
    await runInTenantScope(context, client, async (tx) => {
      await handler.run({ tx, job, now })
      // Inside the handler's transaction, so the work and its outcome are one
      // commit. A handler that raises never reaches this line and its transaction
      // rolls back — which is the property the failure path below relies on.
      await completeJob({ tx, jobId: job.id, now })
    })

    args.logger.info(WORKER_EVENTS.jobDone, {
      jobId: job.id,
      tenantId: job.tenantId,
      kind: job.kind,
      attempt: job.attempts,
      durationMs: args.clock().getTime() - now.getTime(),
    })
    return 'done'
  } catch (error) {
    // The failure is recorded in a scope of its own; see the file header.
    const outcome = await runInTenantScope(context, client, (tx) =>
      failJob({ tx, job, now, error, maxAttempts: args.maxAttempts ?? MAX_JOB_ATTEMPTS }),
    )
    args.logger[outcome === 'failed' ? 'error' : 'warn'](
      outcome === 'failed' ? WORKER_EVENTS.jobFailed : WORKER_EVENTS.jobRequeued,
      {
        jobId: job.id,
        tenantId: job.tenantId,
        kind: job.kind,
        attempt: job.attempts + 1,
        durationMs: args.clock().getTime() - now.getTime(),
        error,
      },
    )
    return outcome
  }
}

/**
 * Runs a job that spans tenants: once per active tenant, each in its own scope.
 *
 * The iterations are independent, and that is deliberate (`01-tech-stack.md` §4:
 * "Isolation of failure"). A tenant whose iteration raises does not stop the sweep
 * for the tenants after it; the first failure is the one the row records, because
 * a job's `lastError` is one column and the per-tenant detail is the log. The
 * outcome is then written in the job's own tenant scope, which is one of the
 * tenants in the loop — the row belongs to the tenant that enqueued it, and the
 * write belongs to the row.
 */
async function runAcrossTenants(
  args: RunJobArgs,
  ownContext: ResolvedTenantContext,
  handler: JobHandler,
): Promise<JobOutcome> {
  const { client, job, now } = args
  let failure: unknown

  for (const tenantId of args.tenantIds) {
    try {
      const context = await getTenantContextForJob({
        client,
        tenantId,
        multiTenant: args.multiTenant,
      })
      await runInTenantScope(context, client, (tx) => handler.run({ tx, job, now }))
    } catch (error) {
      if (failure === undefined) failure = error
      args.logger.warn(WORKER_EVENTS.jobTenantFailed, {
        jobId: job.id,
        tenantId,
        kind: job.kind,
        attempt: job.attempts,
        error,
      })
    }
  }

  if (failure === undefined) {
    await runInTenantScope(ownContext, client, (tx) => completeJob({ tx, jobId: job.id, now }))
    args.logger.info(WORKER_EVENTS.jobDone, {
      jobId: job.id,
      tenantId: job.tenantId,
      kind: job.kind,
      attempt: job.attempts,
      tenants: args.tenantIds.length,
      durationMs: args.clock().getTime() - now.getTime(),
    })
    return 'done'
  }

  const outcome = await runInTenantScope(ownContext, client, (tx) =>
    failJob({ tx, job, now, error: failure, maxAttempts: args.maxAttempts ?? MAX_JOB_ATTEMPTS }),
  )
  args.logger[outcome === 'failed' ? 'error' : 'warn'](
    outcome === 'failed' ? WORKER_EVENTS.jobFailed : WORKER_EVENTS.jobRequeued,
    {
      jobId: job.id,
      tenantId: job.tenantId,
      kind: job.kind,
      attempt: job.attempts + 1,
      tenants: args.tenantIds.length,
      durationMs: args.clock().getTime() - now.getTime(),
      error: failure,
    },
  )
  return outcome
}

/**
 * The handler a registry holds for a kind, or `undefined` when it holds none.
 *
 * The runner's only question about a registry, in one place: a kind the table does
 * not name is unknown, and an entry whose `run` is not a function is treated as
 * unknown rather than called. The second case cannot be built by `build()`, which
 * takes handlers and not anything else — it is the guard that keeps a registry
 * assembled by hand from being a registry that crashes the poll.
 */
export function handlerFor(registry: JobRegistry, kind: string): JobHandler | undefined {
  const handler = registry.handlers[kind]
  return typeof handler?.run === 'function' ? handler : undefined
}
