/**
 * The server-resolved tenant context, and the two override sets that travel with
 * it.
 *
 * `02-architecture.md` §11 gives the request lifecycle its spine:
 *
 * ```
 * middleware.ts      → session cookie present? else redirect to login
 * resolveSession()   → userId from the signed session
 * getTenantContext() → membership → { tenantId, clinicId, role, overrides }
 * module function    → can(role, permission, overrides) → throw if denied
 * ```
 *
 * Two sentences in that document are the reason this file is a *type* and not a
 * function. §11: "**Tenant context is resolved, never received.** A forged
 * `clinicId` in a request body changes nothing, because nothing reads it." And
 * `04-roles-permissions.md` §3.1: "There is no overload that accepts a role, a
 * user id, or a permission list from a caller, a request body, or a cookie."
 *
 * A type cannot enforce either of those by itself — a function signature can.
 * What the type does is make the *shape* of a resolved context one thing, named
 * once, so that "the context" has exactly one definition for the twenty modules
 * that pass it around, and so that a module cannot invent a second one with an
 * extra field it decided to trust.
 *
 * ## Why `userId` is here
 *
 * §11's diagram lists four fields and omits it, because `resolveSession()` has
 * already produced the user. It is here anyway, and the authority is
 * `04-roles-permissions.md` §3.4: "`view_own_schedule` returns appointments where
 * `doctorId = ctx.userId`" — the ownership refinement every doctor-scoped query
 * needs. Carrying it on the context means those queries take one argument rather
 * than two that can disagree, and the disagreement — a schedule filtered by one
 * doctor's ownership and another's tenant — is exactly the bug the branded ids of
 * `@/core/types` exist to make impossible.
 *
 * ## What is deliberately not here
 *
 * - **The tenant's module overrides.** `02-architecture.md` §13.2 stores them in
 *   the tenant's settings row, and §13.3 resolves them through the registry at the
 *   module boundary. They are read once per request from a different place for a
 *   different purpose, and folding them into this object would put a settings read
 *   on the path of every permission check.
 * - **The eight behavioral toggles** (`04-roles-permissions.md` §4). Those answer
 *   "how much authority inside a page the caller already has"; this object answers
 *   "which pages the caller has". §4 draws that line explicitly.
 * - **Anything the client sent.** There is no field for a requested tenant, a
 *   requested role, or a header.
 */

import type { Permission, Role } from '@/core/constants'
import type { ClinicId, TenantId, UserId } from '@/core/types'

/**
 * A membership's per-user permission overrides.
 *
 * `04-roles-permissions.md` §2.2: "The role default is a **starting point**, not
 * a ceiling", and the effective set is
 *
 * ```
 * effective(user) = (roleDefault(role) ∪ granted(user)) \ revoked(user)
 * ```
 *
 * Stored per `Membership`, never per `User` — the same sentence: "a visiting
 * doctor who works at two tenants has different permissions at each".
 *
 * Both sets are *additions to* and *subtractions from* one role default, which is
 * why neither is a full permission list. A stored full list would freeze a
 * membership at the matrix as it was on the day it was written, and the matrix is
 * the thing most likely to gain a row.
 */
export interface PermissionOverrides {
  /** Permissions this membership has that its role does not grant by default. */
  readonly granted: readonly Permission[]

  /**
   * Permissions this membership has had removed.
   *
   * Removable for `DOCTOR` and `SECRETARY` only. A `MANAGER` membership's
   * revocations are refused by the write path and ignored on read
   * (`04-roles-permissions.md` §2.3 — "the manager column is locked").
   */
  readonly revoked: readonly Permission[]
}

/**
 * Everything a module needs to know about *who* is calling and *where*.
 *
 * Passed as one argument to every module function, because the alternative — a
 * `tenantId` here and a `role` there — is how a call site ends up checking one
 * tenant's permission and querying another tenant's rows.
 */
export interface TenantContext {
  /**
   * The authenticated principal, resolved from the signed session cookie.
   *
   * Never accepted from a request body, a query string or a header: a route that
   * read a `userId` from its input would let a caller act as anyone.
   */
  readonly userId: UserId

  /**
   * The tenant the membership resolved to.
   *
   * This value and the RLS setting of `09-security.md` §4 are the same fact
   * expressed twice — once to the application, once to the database. §4.4 keeps
   * them distinct rather than redundant: "Layer 1 is the authorisation layer;
   * Layer 2 is the isolation backstop. Both are required." This field is Layer 1's
   * half of it, and §4.3's fail-closed behaviour is what makes a query that omits
   * it return nothing rather than everything.
   */
  readonly tenantId: TenantId

  /**
   * The active clinic, or `null` for a tenant that has not split into branches.
   *
   * `02-architecture.md` §4: `tenantId` is primary and `clinicId` is secondary and
   * nullable, so a single-clinic tenant carries `null` rather than a branch that
   * means "the only one".
   */
  readonly clinicId: ClinicId | null

  /** The membership's role. One of exactly three (`04-roles-permissions.md` §1). */
  readonly role: Role

  /** The membership's per-user overrides on top of the role default. */
  readonly overrides: PermissionOverrides
}
