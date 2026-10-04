/**
 * The per-request tenant scope, held in an `AsyncLocalStorage`, and the
 * transaction that makes Layer 2 possible.
 *
 * `09-security.md` §4.3: "a client extension asserts the context exists: any
 * query issued outside a tenant-scoped transaction throws rather than silently
 * returning nothing. A silent empty result would look like 'no data' and be
 * debugged as a data problem; a loud failure is diagnosed in seconds."
 *
 * An `AsyncLocalStorage` is the mechanism that lets a Prisma extension read a
 * value the caller never passes it. The request sets the scope once, and every
 * query the request issues — including ones deep inside a module function — sees
 * it. Nothing else gives the extension a parameter: Prisma's `$extends` query
 * hooks receive the operation and its args, not the caller's context.
 *
 * ## Why the wrapper owns a transaction
 *
 * `02-architecture.md` §11 puts `set_config('app.tenant_id', …)` *inside* the
 * transaction, and §4.2 of the security document explains the third argument:
 * the setting is scoped to the transaction, so it cannot outlive the request on
 * a pooled connection. A scope that set the variable outside a transaction
 * would be the leak that arrangement exists to close, so the scope and the
 * transaction are one call. They are also one fact — *this request is acting as
 * this tenant* — and splitting them across two entry points would let a caller
 * set the RLS variable without Layer 1 or the reverse. `runInTenantScope` is the
 * only door.
 *
 * ## Why `set_config` is issued on PostgreSQL only
 *
 * SQLite has no RLS (`09-security.md` §5) and no `set_config` function either, so
 * the call is skipped when the resolved URL names a file. The skip is not a
 * second code path for a second product: it is the absence of Layer 2 in
 * development, which the documents state as an accepted risk with Layer 1 as the
 * mitigation. On PostgreSQL the call is always made — under `MULTI_TENANT=false`
 * with the single seeded tenant, which is `02-architecture.md` §4's "no second
 * code path".
 *
 * ## Who may call this
 *
 * The entry points: a route handler, a Server Component, a Server Action, or the
 * worker's job loop. A module function does not call it, because the entry point
 * already has, and Prisma does not nest interactive transactions — a second call
 * inside the first is a failure rather than an inner transaction. The block
 * receives the transaction's client so the module functions it calls take a
 * client as a parameter and never have to ask where the scope came from.
 *
 * ## Why nothing is exported that can set the slot from outside
 *
 * `currentTenantContext()` is the read, and it throws when there is nothing to
 * read. The write is `runInTenantScope`, which takes the context from
 * `getTenantContext()` — a function that resolves it from a session and a
 * membership, never from an argument a caller supplies. A scope set from a
 * request body is the forgery `02-architecture.md` §11 exists to prevent.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

import { isPostgresUrl } from '@/core/config/datasource'
import { getEnv } from '@/core/config/env'
import { asTenantId, type TenantId } from '@/core/types'

import type { Prisma, PrismaClient } from '@/generated/prisma/client'

/** The transaction client a scoped block receives. */
export type TransactionClient = Prisma.TransactionClient

/** The identity a request or a job acts under. */
export interface TenantContext {
  /** The tenant every query is scoped to. */
  readonly tenantId: TenantId
  /**
   * The branch within the tenant, when the membership fixes one. NULL is
   * *unscoped*, not "all branches": a membership with no `clinicId` works across
   * the tenant's clinics, and a `clinicId` narrows it (`02-architecture.md` §3.1).
   */
  readonly clinicId: string | null
  /** The role whose defaults the permission merge starts from. */
  readonly role: string
  /** The user whose membership this is, for the audit log and the self-edit rule. */
  readonly userId: string
}

const storage = new AsyncLocalStorage<TenantContext>()

/**
 * Runs a block as a tenant, and returns what the block returned.
 *
 * Every query the block issues through the transaction client it is given is
 * scoped by the extension, and — on PostgreSQL — the transaction itself carries
 * `app.tenant_id` so the engine enforces the same boundary independently.
 *
 * A scope does not nest: Prisma rejects a transaction inside a transaction, and
 * the entry point that opened the scope is the one that owns it. A worker job
 * runs the same way, once per job, in its own scoped transaction.
 */
export async function runInTenantScope<T>(
  context: TenantContext,
  client: PrismaClient,
  block: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return storage.run(context, () =>
    client.$transaction(async (tx) => {
      await setTenantConfig(tx)
      return block(tx)
    }),
  )
}

/**
 * Sets `app.tenant_id` for the transaction, on PostgreSQL.
 *
 * The bind parameter is the point (`09-security.md` §4.2): `SET LOCAL` cannot
 * take one, which would put the tenant id into SQL text. The tagged template is
 * what keeps it a parameter.
 */
async function setTenantConfig(tx: TransactionClient): Promise<void> {
  if (!isPostgresUrl(getEnv().databaseUrl)) return
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantIdOf(storage.getStore())}, true)`
}

/**
 * The context's tenant id as a plain string for `set_config`. Present, because
 * `runInTenantScope` is what set the slot this function runs inside.
 */
function tenantIdOf(context: TenantContext | undefined): string {
  if (context === undefined) {
    throw new TenantScopeError(
      'set_config was issued with no tenant context in the slot. runInTenantScope sets the slot ' +
        'before the transaction opens, so this is unreachable and is a bug in the wrapper, not in a caller.',
    )
  }
  return context.tenantId
}

/**
 * The current scope, or a failure that says there is none.
 *
 * The error is the point. `tenantId = NULL` under RLS already returns zero rows;
 * this is what makes that visible in development, where Layer 2 does not exist
 * and zero rows is exactly what a wrong query would return.
 */
export function requireTenantContext(): TenantContext {
  const context = storage.getStore()
  if (context === undefined) {
    throw new TenantScopeError(
      'A tenant-scoped query was issued outside a tenant scope. Every database read and write ' +
        'runs inside runInTenantScope(), which resolves the tenant from the session — never from ' +
        'a request argument. See docs/knowledge/09-security.md §4.3.',
    )
  }
  return context
}

/** Whether a scope is set, for the startup check that a worker has one. */
export function hasTenantScope(): boolean {
  return storage.getStore() !== undefined
}

/**
 * The failure a tenant-scoped query without a scope raises.
 *
 * Not an `AppError` for the reason `ConfigError` is not one (`config/env.ts`):
 * this is a programming error, and the person who reads it is the developer who
 * made it, not a clinic user who would need a Persian sentence. `05-conventions.md`
 * §7's taxonomy is for failures a user can act on.
 */
export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantScopeError'
  }
}

/**
 * Builds a context from facts a resolver already trusts.
 *
 * The constructor of last resort: `getTenantContext()` is the real one, which
 * reads a membership. This exists so that a worker job — which has a tenant row
 * and a job to run, and no session — can build a scope from the job's own
 * `tenantId` without inventing a user, and so a test can make one without a
 * database.
 */
export function tenantContextOf(facts: {
  readonly tenantId: string
  readonly clinicId?: string | null
  readonly role?: string
  readonly userId?: string
}): TenantContext {
  return Object.freeze({
    tenantId: asTenantId(facts.tenantId),
    clinicId: facts.clinicId ?? null,
    role: facts.role ?? 'system',
    userId: facts.userId ?? 'system',
  })
}
