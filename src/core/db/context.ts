/**
 * `getTenantContext()` — the request lifecycle's second step.
 *
 * `02-architecture.md` §11:
 *
 * ```
 * Request
 *   → middleware.ts            session cookie present? else redirect to login
 *   → resolveSession()         userId from the signed session
 *   → getTenantContext()       membership → { tenantId, clinicId, role, overrides }
 *   → module function          can(role, permission, overrides) → throw if denied
 *   → prisma transaction
 *         set_config('app.tenant_id', $1, true)
 *         query (RLS active)
 * ```
 *
 * The two properties that list guarantees, and what enforces each here:
 *
 * - **Authorisation happens at the module layer.** This function returns a
 *   context; it grants nothing. `can()` takes only that context
 *   (`04-roles-permissions.md` §3.1), and the module call is what decides.
 * - **Tenant context is resolved, never received.** The only input is a session
 *   token; `tenantId`, `clinicId` and `role` all come from the membership the
 *   token's user holds. A forged `clinicId` in a request body changes nothing,
 *   because nothing here reads one.
 *
 * ## Why the membership is the unit, not the user
 *
 * A user's role is a fact about their relationship to a tenant, not about them
 * (`prisma/schema.prisma`, `Membership`), and a person with two memberships is
 * the ordinary case the architecture supports — a visiting doctor with two
 * (`02-architecture.md` §2). The token names a user; the tenant is chosen by the
 * membership the token was issued for, which `Session.tenantId` records, so a
 * user with two memberships is never ambiguous to the server and always has to
 * pick one to log in as.
 *
 * ## Why the client parameter is unscoped
 *
 * The session and membership reads below run *before* a tenant scope exists —
 * they are what establishes it. The client a caller passes is therefore the
 * unscoped one from `createUnscopedClient()`, which is also why that function
 * exists and why its name says what it does. Every other client in the product
 * would refuse these queries, which is the correct default and the reason this
 * is one of the three documented exceptions.
 */

import { createHash } from 'node:crypto'

import { isMember, ROLES, type Role } from '@/core/constants'
import {
  EMPTY_PERMISSION_OVERRIDES,
  parsePermissionOverrides,
  type PermissionOverrides,
} from '@/core/tenant'
import { asCustomerId, asTenantId, type CustomerId, type TenantId } from '@/core/types'

import type { PrismaClient } from '@/generated/prisma/client'

import { tenantContextOf, type TenantContext } from './scope'

/**
 * The context this module resolves, with the membership's ids exposed.
 *
 * `role` narrows `TenantContext.role` from a bare string to the three-value union,
 * which is what `can()`'s `ROLE_DEFAULTS` is keyed by. The resolver is the one place
 * a membership's stored role reaches the rest of the product, so it is the place
 * that says "one of exactly three" (`04-roles-permissions.md` §1) — a caller that
 * had to cast would be a caller that could cast wrong.
 *
 * `overrides` is the second half of `02-architecture.md` §11's resolved context:
 * `membership → { tenantId, clinicId, role, overrides }`. It is parsed here, from
 * the membership row the same query already read, so a caller that asks "what can
 * this person do" gets the same answer the permission primitive computes from.
 */
export interface ResolvedTenantContext extends TenantContext {
  /** The membership's role, narrowed to the three the product has. */
  readonly role: Role
  /** The membership's parsed permission overrides on top of that role default. */
  readonly overrides: PermissionOverrides
  /** The membership the token was issued for. */
  readonly membershipId: string
  /** True when the platform is running with `MULTI_TENANT=false` (ADR-0004). */
  readonly isSingleTenantMode: boolean
}

/**
 * The context a customer panel request acts under (`09-security.md` §7).
 *
 * Smaller than the staff context by design: a customer holds no membership and no
 * role, so there is no role default to merge overrides into and no permission
 * primitive to feed. What the panel needs instead is the scope §7 names — every
 * query is filtered to this `customerId` **in addition to** the tenant — and the
 * `customerId` arrives here, from the session, and never from a request.
 */
export interface ResolvedCustomerContext {
  readonly tenantId: TenantId
  /** The authenticated customer. Never accepted from an input (`09-security.md` §7). */
  readonly customerId: CustomerId
}

/**
 * The failure this module raises.
 *
 * Not an `AppError`: `05-conventions.md` §7's taxonomy is for failures a user
 * can act on, and these are the ones a user cannot fix by trying again — an
 * unknown token, an expired session, a tenant that has closed, a membership that
 * was deactivated. The caller maps them to the response it owes: 401 for a
 * session that is not usable, 403 for a tenant that will not serve this user.
 * Keeping `reason` distinct is what lets it.
 */
export class TenantResolutionError extends Error {
  constructor(
    message: string,
    /** What the caller should do with the request. */
    readonly reason: 'session-not-found' | 'session-expired' | 'no-membership' | 'tenant-inactive',
  ) {
    super(message)
    this.name = 'TenantResolutionError'
  }
}

/**
 * Resolves the tenant context a request acts under, from a session token.
 *
 * `now` is injected (`05-conventions.md` §10) so the expiry check is a fact
 * about the clock rather than about when the process happened to run.
 */
export async function getTenantContext(args: {
  readonly client: PrismaClient
  readonly token: string
  readonly now: Date
  readonly multiTenant: boolean
}): Promise<ResolvedTenantContext> {
  const session = await args.client.session.findUnique({
    where: { tokenHash: hashToken(args.token) },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          isActive: true,
          memberships: { where: { isActive: true }, select: MEMBERSHIP_FIELDS },
        },
      },
    },
  })

  if (session === null) {
    throw new TenantResolutionError(
      'The session token names no row. It is unknown, or it was rotated and the old token was revoked.',
      'session-not-found',
    )
  }
  if (session.revokedAt !== null) {
    throw new TenantResolutionError(
      'The session was revoked, so the token is a replay. Rotation revokes the previous row.',
      'session-not-found',
    )
  }
  if (session.expiresAt <= args.now) {
    throw new TenantResolutionError('The session has expired.', 'session-expired')
  }
  if (session.userId === null) {
    // `Session` carries exactly one of `userId` and `customerId` — a staff login
    // writes the first, a customer login the second. A token that reaches this
    // resolver with neither is a customer's token, and the honest answer is that
    // this resolver was not the one for it. The customer panel has its own
    // resolution, because a customer holds no membership to read here.
    throw new TenantResolutionError(
      'The session holds no user. It is a customer session, and this resolver reads a membership.',
      'no-membership',
    )
  }
  if (session.user === null) {
    // The `userId` above is not null and the row it names is gone. The foreign key
    // makes this unreachable in the database and reachable only if the user row was
    // deleted while a session lived on, so it is reported rather than papered over.
    throw new TenantResolutionError(
      'The session names a user no row holds. The user was deleted while the session lived.',
      'no-membership',
    )
  }
  if (!session.user.isActive) {
    throw new TenantResolutionError(
      'The user is deactivated. The row is kept for the audit trail and is no longer usable.',
      'no-membership',
    )
  }

  // The token's `tenantId` is the tenant the login chose; the memberships are
  // read along with it so a user with two is resolved by the token, not by order.
  const membership = session.user.memberships.find((row) => row.tenantId === session.tenantId)
  if (membership === undefined) {
    throw new TenantResolutionError(
      'The user holds no active membership in the tenant the session was issued for.',
      'no-membership',
    )
  }

  if (!isMember(ROLES, membership.role)) {
    // A role outside the three the product has is a row written by a release this
    // one does not know, and `ROLE_DEFAULTS` has no entry for it — so the effective
    // permission set would be undefined and every `can()` would answer from a hole
    // in the matrix. Refusing is fail-closed: the person is signed in but cannot be
    // served, which is visible, rather than served with an unknown default.
    throw new TenantResolutionError(
      `The membership ${membership.id} holds the role ${membership.role}, which is not one of the three the product has.`,
      'no-membership',
    )
  }

  // The overrides are parsed where the row is read rather than by the caller,
  // because a caller that received the raw column would be a caller that could skip
  // the parse — and skipping it is not a neutral choice: an unparsed `null` read as
  // "no overrides" is correct, but a malformed column read as "no overrides" is a
  // silent widening of access (`lib/overrides.ts` throws rather than fall back for
  // exactly that reason). Slugs that no longer name a permission are dropped by the
  // parser and returned in its `unknown` list; they are not logged here because this
  // layer has no tenant to log against, and dropping is safe in both directions.
  const { overrides } = parsePermissionOverrides(membership.overrides)

  await assertTenantActive(args.client, session.tenantId)

  return Object.freeze({
    ...tenantContextOf({
      tenantId: session.tenantId,
      clinicId: membership.clinicId,
      role: membership.role,
      userId: session.userId,
    }),
    role: membership.role,
    overrides,
    membershipId: membership.id,
    isSingleTenantMode: !args.multiTenant,
  })
}

/**
 * Resolves the context a customer panel request acts under, from a session token.
 *
 * The staff resolver's mirror, over the other half of `Session`'s mutually exclusive
 * pair (`prisma/schema.prisma`: exactly one of `userId` and `customerId`). The two
 * are separate functions because the two sessions are different scopes and not
 * different shapes of one: a staff session resolves a membership that carries a
 * role, a customer session resolves a customer whose only scope is their own id
 * (`09-security.md` §7). Sharing a function would need a union result and every
 * caller would narrow it, which is where "a customer's `customerId` comes from the
 * session" would stop being visible.
 *
 * A *staff* token reaching this resolver is refused with `no-membership`: the
 * session holds a user and no customer, and the honest answer is that this resolver
 * is not the one for it — the same answer the staff resolver gives a customer token,
 * in the other direction.
 */
export async function getTenantContextForCustomer(args: {
  readonly client: PrismaClient
  readonly token: string
  readonly now: Date
}): Promise<ResolvedCustomerContext> {
  const session = await args.client.session.findUnique({
    where: { tokenHash: hashToken(args.token) },
    select: { id: true, userId: true, customerId: true, tenantId: true, expiresAt: true, revokedAt: true },
  })

  if (session === null) {
    throw new TenantResolutionError(
      'The session token names no row. It is unknown, or it was rotated and the old token was revoked.',
      'session-not-found',
    )
  }
  if (session.revokedAt !== null) {
    throw new TenantResolutionError(
      'The session was revoked, so the token is a replay. Rotation revokes the previous row.',
      'session-not-found',
    )
  }
  if (session.expiresAt <= args.now) {
    throw new TenantResolutionError('The session has expired.', 'session-expired')
  }
  if (session.userId !== null) {
    throw new TenantResolutionError(
      'The session holds a user, so it is a staff session and this resolver reads a customer.',
      'no-membership',
    )
  }
  if (session.customerId === null) {
    // `userId` is null and so is `customerId`, which the schema's mutually exclusive
    // pair makes unreachable from any login. It is reported rather than papered over
    // for the same reason the staff resolver reports a deleted user.
    throw new TenantResolutionError(
      'The session names neither a user nor a customer, so it has no principal.',
      'no-membership',
    )
  }

  await assertTenantActive(args.client, session.tenantId)

  return Object.freeze({
    tenantId: asTenantId(session.tenantId),
    customerId: asCustomerId(session.customerId),
  })
}

/**
 * Resolves the context a background job acts under.
 *
 * A job has no session: it is the system doing something the clinic scheduled. It
 * carries its own `tenantId` on the `JobQueue` row, which is the fact it acts
 * on, and it takes the manager role's defaults so `can()` has something to start
 * from. A job never asks for a permission the manager lacks — the things a job
 * does are the ones its own code path does not gate.
 */
export async function getTenantContextForJob(args: {
  readonly client: PrismaClient
  readonly tenantId: string
  readonly multiTenant: boolean
}): Promise<ResolvedTenantContext> {
  await assertTenantActive(args.client, args.tenantId)

  return Object.freeze({
    ...tenantContextOf({ tenantId: args.tenantId, role: ROLES[0] }),
    role: ROLES[0],
    overrides: EMPTY_PERMISSION_OVERRIDES,
    membershipId: 'system',
    isSingleTenantMode: !args.multiTenant,
  })
}

/**
 * Refuses to serve a closed tenant.
 *
 * `prisma/schema.prisma`: `Tenant.isActive` "is how a tenant is closed: the row
 * stays, because every fact below it points here." A closed tenant's data must
 * stop being served the moment it closes, so this is checked on every resolution
 * rather than once at login.
 */
async function assertTenantActive(client: PrismaClient, tenantId: string): Promise<void> {
  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { isActive: true },
  })
  if (tenant === null) {
    throw new TenantResolutionError(
      'The tenant the session names does not exist.',
      'tenant-inactive',
    )
  }
  if (!tenant.isActive) {
    throw new TenantResolutionError(
      'The tenant is closed. Its rows are retained and are no longer served.',
      'tenant-inactive',
    )
  }
}

/** The membership fields a resolution reads. */
const MEMBERSHIP_FIELDS = {
  id: true,
  tenantId: true,
  clinicId: true,
  role: true,
  // The overrides column is read here so the resolved context already carries the
  // permission overrides `can()` merges into the role default. Nullable: a
  // membership that was never edited was never written, and that is the ordinary
  // case rather than a special one.
  overrides: true,
} as const

/**
 * The tenant id behind a slug, for single-tenant mode and for the public site's
 * tenant resolution from a subdomain. `null` for a slug no active tenant owns.
 *
 * Used at login, which needs the tenant before it can create a session.
 */
export async function tenantIdOfSlug(
  client: PrismaClient,
  slug: string,
): Promise<TenantId | null> {
  const tenant = await client.tenant.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  })
  if (tenant === null || !tenant.isActive) return null
  return asTenantId(tenant.id)
}

/**
 * The token's hash, which is all the database ever holds (`prisma/schema.prisma`,
 * `Session`): the session lives in an HttpOnly cookie and the server stores a
 * hash, so a database disclosure does not hand over a usable credential.
 *
 * SHA-256, hex-encoded. The token is high-entropy and unbounded in length, so a
 * fast hash is the right choice — the protection is the cookie's attributes and
 * the hash, not the hash's cost.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
