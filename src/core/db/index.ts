/**
 * The database layer's public surface (`05-conventions.md` §4: a module's barrel
 * is its `index.ts` and nothing else).
 *
 * ## The three things a consumer reaches for
 *
 * - **The client.** `prisma()` for application code — the client with Layer 1
 *   applied. `createPrismaClient(url)` and `createUnscopedClient(url)` are for
 *   the entry points and the tests that control construction themselves.
 * - **The scope.** `runInTenantScope()` is the only way a tenant context exists,
 *   and the only way `app.tenant_id` is set.
 * - **The resolution.** `getTenantContext()` turns a token into the context a staff
 *   request acts under, `getTenantContextForCustomer()` does the same for a customer
 *   panel request, and `getTenantContextForJob()` for a job that has no session.
 *
 * ## What is deliberately not exported
 *
 * `requireTenantContext()` is, because the extension is a consumer of the scope
 * and because a test asserts the failure. `tenantContextOf()` is, because a
 * worker job and a test are both legitimate builders of a context from trusted
 * facts. Three things are *not* exported:
 *
 * - **`storage`.** No consumer may write the `AsyncLocalStorage` slot. The scope
 *   is only ever set by the wrapper that opens the transaction with it.
 * - **`tenantExtension`.** A client either has Layer 1 or is one of the three
 *   documented exceptions that use `createUnscopedClient()`. Exporting the
 *   extension would offer a third kind of client, and the whole arrangement
 *   rests on there being two.
 * - **`hashToken()`.** `context.ts` exports it for its own tests, but a module
 *   that hashed a token itself would be a module duplicating the session read.
 *   It is not in the barrel.
 */

export * from './client'
export * from './context'
export * from './scope'
export * from './tenant-models'
