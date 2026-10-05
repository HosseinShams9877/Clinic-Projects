/**
 * The permission matrix's own write path — Phase 3's DoD 5, DoD 6 and DoD 7, against a
 * real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The three assertions that make a mock worthless:
 *
 * - **DoD 5** — a change the manager makes is what the *next request* reads. The test
 *   does not ask the module's own return value whether it worked; it resolves the
 *   affected person's context the way a request does (`getTenantContext`, from the
 *   session token) and asks `can()`, before and after. There is no permission cache to
 *   invalidate, so the row and the request are the same source and a mock would have
 *   answered whatever the test arranged.
 * - **DoD 6** — a revocation on a manager's membership is refused by the module that
 *   owns the lock, before any write, and the row is what it was. The refusal's
 *   `messageKey` is also the key the app tier's refusal-audit matches on
 *   (`_staff/actions.ts`'s `isManagerColumnRefusal`), so asserting it here is
 *   asserting the wiring the audit half of the DoD depends on.
 * - **DoD 7** — the change wrote one audit row carrying the actor, the target and the
 *   before/after set, in the same transaction.
 *
 * ## Why the suite seeds a session row
 *
 * DoD 5 is a claim about the request path, and the request path starts at a token.
 * The row is seeded here rather than through the login because the login's own suite
 * already covers it; this suite needs the token to resolve, and the person it resolves
 * to is the point.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { Permission, Role } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import type { TenantContext } from '@/core/tenant'
import {
  asClinicId,
  asTenantId,
  asUserId,
  type TenantId,
  type UserId,
} from '@/core/types'
import { getTenantContext, hashToken } from '@/core/db'
import type { PrismaClient } from '@/generated/prisma/client'
import { can } from '@/modules/roles-permissions'

import {
  AuditAction,
  AuditEntity,
  recentAudit,
  updateMembershipPermissions,
} from '../index'
import { DomainError } from '@/core/types'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const MANAGER_ID: UserId = asUserId('manager-a')
const SECRETARY_ID: UserId = asUserId('secretary-a')
const OTHER_MANAGER_ID: UserId = asUserId('manager-b')
const SECRETARY_MEMBERSHIP_ID = 'membership-secretary'
const OTHER_MANAGER_MEMBERSHIP_ID = 'membership-manager-b'

/**
 * The permission the suite grants and revokes.
 *
 * `manage_campaigns` is matrix position 13, which is outside the secretary default's
 * 1–12 (`04-roles-permissions.md` §2.1), so the grant is a real widening and the
 * revoke is a real narrowing — neither is a change the default already held.
 */
const GRANTED_PERMISSION = Permission.ManageCampaigns

/** The token the secretary's session holds, so the request path can resolve it. */
const SECRETARY_TOKEN = 'secretary-token-a'

/** A clock the resolver is happy with: after the seed, before the expiry. */
const NOW = new Date('2026-10-04T10:00:00Z')

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
  await unscoped.$transaction([
    unscoped.auditLog.deleteMany(),
    unscoped.session.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'a', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: 'clinic-a', tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: 210 }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'مدیر',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: SECRETARY_ID,
        tenantId: TENANT_ID,
        mobile: '09120000002',
        firstName: 'منشی',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: OTHER_MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000003',
        firstName: 'مدیر',
        lastName: 'ب',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.membership.createMany({
    data: [
      {
        id: 'membership-manager',
        tenantId: TENANT_ID,
        userId: MANAGER_ID,
        role: Role.Manager,
        isActive: true,
      },
      {
        id: SECRETARY_MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: SECRETARY_ID,
        role: Role.Secretary,
        isActive: true,
      },
      {
        id: OTHER_MANAGER_MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: OTHER_MANAGER_ID,
        role: Role.Manager,
        isActive: true,
      },
    ],
  })
  await unscoped.session.create({
    data: {
      tenantId: TENANT_ID,
      userId: SECRETARY_ID,
      tokenHash: hashToken(SECRETARY_TOKEN),
      expiresAt: new Date('2026-10-11T10:00:00Z'),
    },
  })
})

/** The manager's context, which the matrix's own write requires. */
function managerContext(): TenantContext {
  return {
    userId: MANAGER_ID,
    tenantId: TENANT_ID,
    clinicId: null,
    role: Role.Manager,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/**
 * The secretary's context, resolved the way a request resolves it.
 *
 * `getTenantContext` takes the unscoped client, because a tenant scope does not exist
 * until it has run — a scoped client would refuse the very reads the resolution is
 * (`core/db/context.ts`'s own header names this as the reason `createUnscopedClient`
 * exists). The test's question is the one the request asks, so the client is the one
 * the request's resolver takes.
 */
async function secretaryContext(): Promise<TenantContext> {
  const resolved = await getTenantContext({
    client: unscoped,
    token: SECRETARY_TOKEN,
    now: NOW,
    multiTenant: true,
  })

  // Re-branded for `can()`: the resolver answers the scope module's `TenantContext` and
  // the permission primitive reads core's, and the two differ only in the id brands.
  return {
    userId: asUserId(resolved.userId),
    tenantId: asTenantId(resolved.tenantId),
    clinicId: resolved.clinicId === null ? null : asClinicId(resolved.clinicId),
    role: resolved.role,
    overrides: resolved.overrides,
  }
}

/* ── DoD 5: the change is what the next request reads ──────────────────────── */

describe('a permission change taking effect', () => {
  it('is live on the next request the affected person makes', async () => {
    // The secretary's default holds positions 1–12, so 13 is not theirs before the change.
    const before = await secretaryContext()
    expect(can(before, GRANTED_PERMISSION)).toBe(false)

    await updateMembershipPermissions({
      tx: unscoped as never,
      ctx: managerContext(),
      membershipId: SECRETARY_MEMBERSHIP_ID,
      granted: [GRANTED_PERMISSION],
      revoked: [],
    })

    // Resolved again, from the token and not from the module's return value.
    const after = await secretaryContext()
    expect(after.overrides.granted).toEqual([GRANTED_PERMISSION])
    expect(can(after, GRANTED_PERMISSION)).toBe(true)

    // And the same permission revoked is the same permission gone, on the next request.
    await updateMembershipPermissions({
      tx: unscoped as never,
      ctx: managerContext(),
      membershipId: SECRETARY_MEMBERSHIP_ID,
      granted: [],
      revoked: [GRANTED_PERMISSION],
    })

    const revoked = await secretaryContext()
    expect(can(revoked, GRANTED_PERMISSION)).toBe(false)
    expect(revoked.overrides.granted).toEqual([])
  })

  it('keeps every other permission the role default grants', async () => {
    await updateMembershipPermissions({
      tx: unscoped as never,
      ctx: managerContext(),
      membershipId: SECRETARY_MEMBERSHIP_ID,
      granted: [GRANTED_PERMISSION],
      revoked: [],
    })

    const after = await secretaryContext()
    // The grant added one permission and subtracted nothing: a secretary's whole
    // default is still the effective set, because the overrides sit on top of it.
    expect(can(after, Permission.ManageAppointments)).toBe(true)
    expect(can(after, Permission.ViewAllCustomers)).toBe(true)
    expect(can(after, Permission.ManageUsers)).toBe(false)
  })
})

/* ── DoD 6: the manager column is locked ───────────────────────────────────── */

describe('a revocation on a manager membership', () => {
  it('is refused by the module before any write', async () => {
    await expect(
      updateMembershipPermissions({
        tx: unscoped as never,
        ctx: managerContext(),
        membershipId: OTHER_MANAGER_MEMBERSHIP_ID,
        granted: [],
        revoked: [GRANTED_PERMISSION],
      }),
    ).rejects.toBeInstanceOf(DomainError)

    // The key is the one the app tier matches on when it audits the refused attempt,
    // so a drift here is a drift in what gets recorded.
    await expect(
      updateMembershipPermissions({
        tx: unscoped as never,
        ctx: managerContext(),
        membershipId: OTHER_MANAGER_MEMBERSHIP_ID,
        granted: [],
        revoked: [GRANTED_PERMISSION],
      }),
    ).rejects.toMatchObject({ messageKey: 'permission.managerColumnLocked' })

    // Nothing was written: the row is the null overrides it started with.
    const row = await unscoped.membership.findUniqueOrThrow({
      where: { id: OTHER_MANAGER_MEMBERSHIP_ID },
    })
    expect(row.overrides).toBeNull()

    // And no change row was audited, because no change happened — the refused attempt's
    // own row is the caller's to write.
    const audit = await recentAudit({ tx: unscoped as never, ctx: managerContext() })
    expect(audit.map((row) => row.action)).not.toContain(
      AuditAction.MembershipPermissionChanged,
    )
  })
})

/* ── DoD 7: every change carries an actor, a target and a before/after ─────── */

describe('the audit row a permission change writes', () => {
  it('records the manager, the membership and the before/after set', async () => {
    await updateMembershipPermissions({
      tx: unscoped as never,
      ctx: managerContext(),
      membershipId: SECRETARY_MEMBERSHIP_ID,
      granted: [GRANTED_PERMISSION],
      revoked: [],
    })

    const audit = await recentAudit({ tx: unscoped as never, ctx: managerContext() })
    expect(audit).toHaveLength(1)

    const [row] = audit
    expect(row.action).toBe(AuditAction.MembershipPermissionChanged)
    expect(row.entity).toBe(AuditEntity.Membership)
    expect(row.actorUserId).toBe(MANAGER_ID)
    expect(row.entityId).toBe(SECRETARY_MEMBERSHIP_ID)

    const detail = row.detail as {
      membershipId: string
      subjectUserId: string
      permissions: {
        role: string
        granted: { before: readonly string[]; after: readonly string[] }
        revoked: { before: readonly string[]; after: readonly string[] }
      }
    }
    expect(detail.membershipId).toBe(SECRETARY_MEMBERSHIP_ID)
    expect(detail.subjectUserId).toBe(SECRETARY_ID)
    expect(detail.permissions.role).toBe(Role.Secretary)
    expect(detail.permissions.granted.before).toEqual([])
    expect(detail.permissions.granted.after).toEqual([GRANTED_PERMISSION])
    expect(detail.permissions.revoked.before).toEqual([])
    expect(detail.permissions.revoked.after).toEqual([])
  })
})
