/**
 * `getTenantContext()` — the request lifecycle’s second step (`02-architecture.md`
 * §11). Every assertion here is one of the two properties that section guarantees:
 * the context is resolved from the membership, and it is resolved, never received.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { PrismaClient } from '@/generated/prisma/client'

import { ROLES } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES, parsePermissionOverrides } from '@/core/tenant'

import {
  getTenantContext,
  getTenantContextForCustomer,
  getTenantContextForJob,
  hashToken,
  TenantResolutionError,
  tenantIdOfSlug,
} from '../context'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from './database'

/** A clock the tests control, so an expiry is a fact about the clock and not the run. */
const NOW = new Date('2026-10-02T12:00:00Z')
const LATER = new Date('2026-10-03T12:00:00Z')

const TENANT_ID = 'tenant-1'
const OTHER_TENANT_ID = 'tenant-2'
const TOKEN = 'session-token-for-tenant-1'

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  // The order matters: a tenant closes by `isActive`, not by disappearing, so the
  // rows are created first and the tests close them from inside the test.
  await unscoped.$transaction([
    unscoped.membership.deleteMany(),
    unscoped.session.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])
  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_ID, slug: 'one', name: 'یک', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'two', name: 'دو', isActive: true },
    ],
  })
  // The membership’s `clinicId` points here. A membership with no clinic is the
  // unscoped case (`02-architecture.md` §3.1), and the tests that need it pass null.
  await unscoped.clinic.create({
    data: { id: 'clinic-1', tenantId: TENANT_ID, name: 'کلینیک یک' },
  })
})

/**
 * A user with a membership in the tenant under test, and a session for it.
 *
 * `clinicId` is set, because the context’s `clinicId` is the membership’s — the
 * secondary boundary of `02-architecture.md` §3.1 — and it is the field most likely
 * to be read from a request body by mistake.
 */
async function sessionForTenant(args: {
  readonly tenantId?: string
  readonly token?: string
  readonly role?: string
  readonly clinicId?: string | null
  readonly expiresAt?: Date
  readonly revokedAt?: Date | null
  readonly userActive?: boolean
  readonly membershipActive?: boolean
}): Promise<string> {
  const tenantId = args.tenantId ?? TENANT_ID
  const token = args.token ?? TOKEN
  const userId = `user-${tenantId}`

  await unscoped.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      tenantId,
      mobile: `0912${tenantId.slice(-1)}`,
      firstName: 'کاربر',
      lastName: 'تست',
      passwordHash: 'hash',
      isActive: args.userActive ?? true,
    },
    update: { isActive: args.userActive ?? true },
  })
  const membership = await unscoped.membership.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: {
      userId,
      tenantId,
      role: args.role ?? ROLES[0],
      clinicId: args.clinicId === undefined ? 'clinic-1' : args.clinicId,
      isActive: args.membershipActive ?? true,
    },
    update: { isActive: args.membershipActive ?? true },
  })
  await unscoped.session.create({
    data: {
      userId,
      tenantId,
      tokenHash: hashToken(token),
      expiresAt: args.expiresAt ?? LATER,
      revokedAt: args.revokedAt ?? null,
    },
  })
  return membership.id
}

describe('getTenantContext', () => {
  it('resolves the membership the token was issued for', async () => {
    // A user with two memberships is the ordinary case the architecture supports
    // (`02-architecture.md` §2), and the token — not the row order — is what picks
    // one. The membership in the other tenant exists and is active, so a resolution
    // that read "the first membership" would return the wrong tenant.
    await sessionForTenant({ tenantId: OTHER_TENANT_ID, token: 'for-two', clinicId: null })
    const membershipId = await sessionForTenant({ tenantId: TENANT_ID, clinicId: 'clinic-1' })

    const context = await getTenantContext({
      client: unscoped,
      token: TOKEN,
      now: NOW,
      multiTenant: true,
    })

    expect(context).toEqual({
      tenantId: TENANT_ID,
      clinicId: 'clinic-1',
      role: ROLES[0],
      userId: `user-${TENANT_ID}`,
      overrides: EMPTY_PERMISSION_OVERRIDES,
      membershipId,
      isSingleTenantMode: false,
    })
  })

  it('takes the role from the membership, not from the user', async () => {
    // The role is a fact about the relationship, not about the person, which is why
    // it is not on `User`. Two memberships of one user can hold two roles.
    //
    // Both roles are real ones — the resolver refuses a role the three-column matrix
    // has no default for (`04-roles-permissions.md` §1: "There are exactly three"),
    // so a value outside them would be refused rather than read as this membership's
    // role. The point of the test survives any two that differ.
    await sessionForTenant({ tenantId: OTHER_TENANT_ID, token: 'for-two', role: ROLES[0] })
    await sessionForTenant({ tenantId: TENANT_ID, role: ROLES[2] })

    const context = await getTenantContext({
      client: unscoped,
      token: TOKEN,
      now: NOW,
      multiTenant: true,
    })

    expect(context.role).toBe(ROLES[2])
  })

  it('reports single-tenant mode when the flag is off', async () => {
    await sessionForTenant({})

    const context = await getTenantContext({
      client: unscoped,
      token: TOKEN,
      now: NOW,
      multiTenant: false,
    })

    expect(context.isSingleTenantMode).toBe(true)
    // The tenant is still the one the session names. ADR-0004’s single-tenant mode
    // is one seeded tenant, not a code path that skips the resolution.
    expect(context.tenantId).toBe(TENANT_ID)
  })

  it('fails with session-not-found for a token no row holds', async () => {
    await expect(
      getTenantContext({ client: unscoped, token: 'unknown', now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'session-not-found' })
  })

  it('fails with session-not-found for a revoked token, which is a replay', async () => {
    await sessionForTenant({ revokedAt: NOW })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'session-not-found' })
  })

  it('fails with session-expired at and after the expiry', async () => {
    await sessionForTenant({ expiresAt: NOW })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'session-expired' })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: new Date(NOW.getTime() + 1), multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'session-expired' })
  })

  it('fails with no-membership for a deactivated user', async () => {
    await sessionForTenant({ userActive: false })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'no-membership' })
  })

  it('fails with no-membership when the membership is deactivated', async () => {
    await sessionForTenant({ membershipActive: false })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'no-membership' })
  })

  it('fails with tenant-inactive for a closed tenant', async () => {
    await sessionForTenant({})
    await unscoped.tenant.update({ where: { id: TENANT_ID }, data: { isActive: false } })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'tenant-inactive' })
  })

  it('raises TenantResolutionError, which is outside AppError’s taxonomy', async () => {
    await expect(
      getTenantContext({ client: unscoped, token: 'unknown', now: NOW, multiTenant: true }),
    ).rejects.toBeInstanceOf(TenantResolutionError)
  })

  it('parses the membership’s overrides into the resolved context', async () => {
    // `04-roles-permissions.md` §11: the resolved context carries `overrides`, and
    // §2.2 makes them a delta on the role default — so the resolver has to hand
    // `can()` the parsed set, not the raw column.
    await sessionForTenant({})
    const stored = JSON.stringify({ granted: ['view_debts'], revoked: ['manage_leads'] })
    const parsed = parsePermissionOverrides(stored)
    await unscoped.membership.updateMany({
      where: { userId: `user-${TENANT_ID}`, tenantId: TENANT_ID },
      data: { overrides: stored },
    })

    const context = await getTenantContext({
      client: unscoped,
      token: TOKEN,
      now: NOW,
      multiTenant: true,
    })

    expect(context.overrides).toEqual(parsed.overrides)
  })

  it('fails with no-membership when the membership’s role is not one of the three', async () => {
    // A role the matrix has no column for has no default, so the permission set
    // could not be computed. Refusing is fail-closed rather than defaulting to one.
    await sessionForTenant({ role: 'owner' })

    await expect(
      getTenantContext({ client: unscoped, token: TOKEN, now: NOW, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'no-membership' })
  })
})

describe('getTenantContextForJob', () => {
  it('resolves a job’s tenant and takes the manager defaults', async () => {
    const context = await getTenantContextForJob({
      client: unscoped,
      tenantId: TENANT_ID,
      multiTenant: true,
    })

    // A job has no session and no membership, so the membership id is `system` and
    // the role is the manager’s: `can()` needs something to start from, and a job
    // never asks for a permission the manager lacks.
    expect(context).toEqual({
      tenantId: TENANT_ID,
      clinicId: null,
      role: ROLES[0],
      userId: 'system',
      overrides: EMPTY_PERMISSION_OVERRIDES,
      membershipId: 'system',
      isSingleTenantMode: false,
    })
  })

  it('refuses to run a job for a closed tenant', async () => {
    await unscoped.tenant.update({ where: { id: TENANT_ID }, data: { isActive: false } })

    await expect(
      getTenantContextForJob({ client: unscoped, tenantId: TENANT_ID, multiTenant: true }),
    ).rejects.toMatchObject({ reason: 'tenant-inactive' })
  })
})

describe('getTenantContextForCustomer', () => {
  /**
   * A customer session for the tenant under test.
   *
   * `Session` carries exactly one of `userId` and `customerId`, and this is the
   * customer half — the row `getTenantContext` refuses as `no-membership` and this
   * resolver resolves.
   */
  async function customerSession(args: {
    readonly token?: string
    readonly tenantId?: string
    readonly expiresAt?: Date
    readonly revokedAt?: Date | null
  } = {}): Promise<string> {
    const tenantId = args.tenantId ?? TENANT_ID
    const token = args.token ?? TOKEN
    const customerId = `customer-${tenantId}`

    await unscoped.customer.upsert({
      where: { id: customerId },
      create: {
        id: customerId,
        tenantId,
        mobile: `0912${tenantId.slice(-1)}`,
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: 'CUSTOMER',
      },
      update: {},
    })
    await unscoped.session.create({
      data: {
        customerId,
        tenantId,
        tokenHash: hashToken(token),
        expiresAt: args.expiresAt ?? LATER,
        revokedAt: args.revokedAt ?? null,
      },
    })
    return customerId
  }

  it('resolves the customer the token was issued for', async () => {
    // `09-security.md` §7: the session resolves to a `customerId`, and every query
    // the panel issues is scoped to it in addition to the tenant. The id comes from
    // here and from nowhere else.
    const customerId = await customerSession()

    await expect(
      getTenantContextForCustomer({ client: unscoped, token: TOKEN, now: NOW }),
    ).resolves.toEqual({ tenantId: TENANT_ID, customerId })
  })

  it('fails with session-not-found for a token no row holds', async () => {
    await expect(
      getTenantContextForCustomer({ client: unscoped, token: 'unknown', now: NOW }),
    ).rejects.toMatchObject({ reason: 'session-not-found' })
  })

  it('fails with session-not-found for a revoked token and session-expired at the expiry', async () => {
    await customerSession({ revokedAt: NOW })

    await expect(
      getTenantContextForCustomer({ client: unscoped, token: TOKEN, now: NOW }),
    ).rejects.toMatchObject({ reason: 'session-not-found' })

    await customerSession({ token: 'later', expiresAt: NOW })

    await expect(
      getTenantContextForCustomer({ client: unscoped, token: 'later', now: NOW }),
    ).rejects.toMatchObject({ reason: 'session-expired' })
  })

  it('fails with no-membership for a staff session, which this resolver does not read', async () => {
    // The two halves of `Session`'s pair are resolved by two functions; a staff
    // token at the customer panel is the wrong token for it, and the answer names
    // the session rather than the customer.
    await sessionForTenant({})

    await expect(
      getTenantContextForCustomer({ client: unscoped, token: TOKEN, now: NOW }),
    ).rejects.toMatchObject({ reason: 'no-membership' })
  })

  it('fails with tenant-inactive for a closed tenant', async () => {
    await customerSession()
    await unscoped.tenant.update({ where: { id: TENANT_ID }, data: { isActive: false } })

    await expect(
      getTenantContextForCustomer({ client: unscoped, token: TOKEN, now: NOW }),
    ).rejects.toMatchObject({ reason: 'tenant-inactive' })
  })
})

describe('tenantIdOfSlug', () => {
  it('is the tenant’s id, not the slug', async () => {
    await expect(tenantIdOfSlug(unscoped, 'one')).resolves.toBe(TENANT_ID)
  })

  it('is null for a slug no tenant owns', async () => {
    await expect(tenantIdOfSlug(unscoped, 'no-such-slug')).resolves.toBeNull()
  })

  it('is null for a closed tenant, which a subdomain must not resolve', async () => {
    await unscoped.tenant.update({ where: { id: TENANT_ID }, data: { isActive: false } })
    await expect(tenantIdOfSlug(unscoped, 'one')).resolves.toBeNull()
  })
})

describe('hashToken', () => {
  it('is the SHA-256 of the token, hex-encoded', () => {
    // A fixed vector, because the point is that the hash is a function of the token
    // and nothing else — and that a database holding it holds no usable credential.
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('is not the token, and is not reversible from the stored value', () => {
    expect(hashToken(TOKEN)).not.toBe(TOKEN)
    expect(hashToken(TOKEN)).toHaveLength(64)
  })
})
