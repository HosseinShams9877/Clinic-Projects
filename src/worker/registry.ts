/**
 * The job registry — `JobQueue.kind` → the handler that runs it.
 *
 * `02-architecture.md` §12 names six jobs, and every one of them belongs to a
 * module: `audience-groups`, `cycles`, `notifications` + `messages`, `campaigns`,
 * `appointments`, `debts`. Phase 1 shipped the worker before any of them, and the
 * empty table was the honest artefact of that order, exactly as
 * `src/modules/registry/registry.ts` still builds `build({})` for the same reason
 * and says so in its own header.
 *
 * Registering a job whose module is not written would be a placeholder by another
 * name, and the standing rule is that neither exists. The worker is complete
 * without a single handler because the mechanism it exists to prove — claim, scope,
 * retry, lease — is independent of what a job does, and the remaining five handlers
 * drop into the call below when their phases land. The `unknown kind` path in
 * `runner.ts` is what a release that ships before its enqueuing module sees, and it
 * is tested against a fixture registry for the same reason the module registry's
 * mechanism is: a code path that no shipped entry exercises is a code path that no
 * shipped entry proves.
 *
 * ## Why the registry is built by hand and not discovered
 *
 * A handler is code that runs with the tenant's data in hand. The map is therefore
 * written as a literal of static imports the bundler resolved when the release was
 * built — no filesystem walk, no `import(path)` — because a registry that could
 * load a handler it had not been given would be a code-execution surface rather
 * than a table (`09-security.md` §18.1 makes the same argument for module
 * overrides, and it transfers). A settings row can never name a handler that did
 * not ship.
 *
 * ## What a handler is given
 *
 * `09-security.md` §8: "The worker does **not** go through `requirePermission`
 * (there is no user role to check). Instead each job declares the exact capability
 * it needs, and the job runner asserts it. A job that would need `manage_users`
 * does not exist."
 *
 * The declaration is a property of the handler, not of this file: a handler that
 * lands in a later phase states what it does and the module that owns it decides
 * whether the worker may. What is fixed here is the shape of the bargain — a
 * handler receives a tenant-scoped transaction and the clock, and it may not reach
 * outside either. The worker's constraints in §8 are the runner's to keep
 * (it cannot alter permissions, roles or memberships, and cannot record a payment)
 * because the runner is what hands the handler a transaction scoped to one tenant;
 * a handler that needed a second tenant is a handler whose `scope` says so, and
 * the runner gives it one scoped transaction per tenant rather than one that
 * crosses.
 */

import type { TransactionClient } from '@/core/db/scope'
import { APPOINTMENT_LIFECYCLE_JOB_KIND, lifecycleJobHandler } from '@/modules/appointments'
import { CYCLE_DUE_JOB_KIND, cycleDueJobHandler } from '@/modules/cycles'
import { PAYMENTS_RECONCILE_JOB_KIND, reconcileJobHandler } from '@/modules/payments'

import type { ClaimedJob } from './queue'

/**
 * The tenants a job runs in.
 *
 * - `own-tenant` — the job's own `JobQueue.tenantId`, which is every real job. The
 *   row is the tenant's, the work is the tenant's, and one scope covers both.
 * - `each-tenant` — once per active tenant, `09-security.md` §8: "Jobs that span
 *   tenants are a **loop over tenants**, each iteration in its own scoped
 *   transaction. Never a single transaction crossing tenants."
 *
 * The second value exists because §8 states the rule positively and the worker is
 * the thing that has to keep it. A job that refreshes every tenant's audience
 * groups overnight is the case it is for, and the runner gives it one transaction
 * per tenant — including its own, which is one of the tenants in the loop.
 */
export type JobScope = 'own-tenant' | 'each-tenant'

/** The arguments a handler runs with. */
export interface JobRunArgs {
  /** A transaction scoped to one tenant. Every query the handler issues is scoped. */
  readonly tx: TransactionClient
  /** The claimed row, carrying the payload and the attempt number. */
  readonly job: ClaimedJob
  /** The injected clock (`05-conventions.md` §8). Never read the wall clock. */
  readonly now: Date
}

/**
 * What a job does. A module that enqueues a kind registers one of these, and the
 * module's barrel is the only place it is offered from.
 */
export interface JobHandler {
  /** Which tenants this job runs in. Defaults to `own-tenant` when absent. */
  readonly scope?: JobScope
  run(args: JobRunArgs): Promise<void>
}

/** The entries a release ships, before the registry validates them. */
export type UnbuiltJobRegistry = Readonly<Record<string, JobHandler>>

/**
 * The registry the runner looks a kind up in.
 *
 * `kinds` is the list the health check reports, so an operator reading the
 * endpoint sees which jobs this release can run — and which a row on the queue
 * cannot be, which is the difference between "nothing to do" and "cannot do it".
 */
export interface JobRegistry {
  readonly handlers: Readonly<Record<string, JobHandler>>
  readonly kinds: readonly string[]
}

/**
 * Builds the registry. Phase 1 ships an empty one; the mechanism is exercised by
 * the fixture registries under `tests/`.
 *
 * The keys are the source of the kinds the registry offers, and the values are
 * static imports — so the build is a freeze and a listing, and there is nothing
 * here that could accept a handler the release does not hold.
 */
export function build(entries: UnbuiltJobRegistry): JobRegistry {
  return Object.freeze({
    handlers: Object.freeze({ ...entries }),
    kinds: Object.freeze(Object.keys(entries)),
  })
}

/**
 * The release's registry, built once at import.
 *
 * Built eagerly for the reason the module registry's is: the table is a build-time
 * artefact, there is no input that could change between calls, and a lazily built
 * registry would be a registry that could be built twice — which is a registry
 * that could disagree with itself about what it ships.
 *
 * Phase 1 shipped this empty, and that was correct: none of §12's six modules
 * existed, and a handler registered for a module that is not written is a
 * placeholder by another name. Phase 2 landed the first one — `appointments`'
 * lifecycle sweep — Phase 4 the second, `cycles`' hourly next-due sweep, and Phase 5
 * the third, `payments`' nightly reconciliation. The three after it arrive with
 * their own modules the same way: a handler is imported from the module's barrel,
 * because the module is the only place the job's own vocabulary is offered from.
 */
export const JOB_REGISTRY: JobRegistry = build({
  [APPOINTMENT_LIFECYCLE_JOB_KIND]: lifecycleJobHandler,
  [CYCLE_DUE_JOB_KIND]: cycleDueJobHandler,
  [PAYMENTS_RECONCILE_JOB_KIND]: reconcileJobHandler,
})
