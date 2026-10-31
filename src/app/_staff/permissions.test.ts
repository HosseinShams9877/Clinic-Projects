/**
 * The staff page's writes, as permissions restrict them — area 4's Server Action level.
 *
 * `recordResultAction`'s harness in `_appointments` established the shape this file
 * reuses: the database is pointed at a file-local client, `next/cache` is silenced
 * and the clock is pinned. This suite adds the one thing the staff page's actions
 * need in place of a session: `resolveStaffPanel` is replaced with a ref the case
 * sets, because the *question* here is exactly what the action does with the
 * session it resolved — and the action must see the session the case chose.
 *
 * What the four cases name:
 *
 * - a DOCTOR session is refused by `requireStaff(ctx, 'manage_users')` — the matrix
 *   gives a doctor three permissions and none of them is this one — and the answer
 *   is a sentence the form renders, with no row written;
 * - a SECRETARY session is refused the same way, because her column stops at the
 *   twelfth permission — but the same session *with* `manage_users` granted in the
 *   overrides succeeds, which is the effective set (`defaults ∪ granted, minus
 *   revoked`) read at the action boundary and not the role's label;
 * - a MANAGER session succeeds and writes the invited membership, the audit row
 *   the ledger expects;
 * - a session that resolves to *no panel* rejects — `inTenantScope`'s promise
 *   chain maps a permission refusal to an answer but lets a resolution failure
 *   raise, because the two failures have different callers: a person's form and
 *   a shell that is navigating away.
 *
 * The tenant the cases seed is the invited row's home: `inviteStaff` writes the
 * user and membership against `ctx.tenantId`, so the membership the last case
 * reads back is the one the action wrote and not a fixture.
 *
 * The seed also carries two facts the matrix-edit cases depend on: the target
 * membership belongs to a *second* person (`assertNotSelfEdit` refuses a
 * manager editing their own column), and the acting manager holds an active
 * MANAGER membership of the seeded clinic — the last-manager guard raises when
 * a clinic would be left with none.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import { TenantResolutionError } from '@/core/db/context'
import type { PanelSession } from '@/app/_shell/session'
import { MESSAGES as ROLES_MESSAGES } from '@/modules/roles-permissions/catalog'
import type { PrismaClient } from '@prisma/client'

import { inviteStaffAction, updateMembershipPermissionsAction } from './actions'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-staff-permissions')
const CLINIC_ID = asClinicId('clinic-staff-permissions')
const MANAGER_ID: UserId = asUserId('manager-staff-permissions')
const TARGET_USER_ID: UserId = asUserId('target-staff-permissions')
const STAFF_MOBILE = '09120000099'
const TARGET_MEMBERSHIP_ID = 'membership-target-staff-permissions'

/** The fixed clock — the audit's pinned instant, which action timestamps read. */
const NOW = vi.hoisted(() => new Date('2026-10-06T10:00:00.000Z'))

/** The per-file database, handed to the mocked `prisma()` through the hoisted ref. */
const clientRef = vi.hoisted(() => ({ current: null as PrismaClient | null }))

/** The session `resolveStaffPanel` answers with — `null` is a session that opens no panel. */
const sessionRef = vi.hoisted(() => ({ current: null as PanelSession | null }))

vi.mock('@/core/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/db')>()
  return { ...actual, prisma: () => clientRef.current }
})

vi.mock('@/app/_shell/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/_shell/session')>()
  return {
    ...actual,
    resolveStaffPanel: async () => {
      if (sessionRef.current === null) {
        throw new TenantResolutionError('The membership opens no staff panel.', 'no-membership')
      }
      return sessionRef.current
    },
  }
})

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

vi.mock('@/core/lib/clock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/lib/clock')>()
  return { ...actual, realClock: () => NOW }
})

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
  clientRef.current = unscoped
})

afterAll(async () => {
  clientRef.current = null
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.auditLog.deleteMany(),
    unscoped.session.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])
  sessionRef.current = null

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'staff-permissions', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  // Two people: the manager who acts, and a second person whose membership the
  // matrix-edit cases target — the edit must land on another person's column,
  // because a manager cannot edit their own membership's permissions.
  await unscoped.user.createMany({
    data: [
      {
        id: MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000070',
        firstName: 'مدیر',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: TARGET_USER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000071',
        firstName: 'هدف',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.membership.createMany({
    data: [
      {
        id: TARGET_MEMBERSHIP_ID,
        userId: TARGET_USER_ID,
        tenantId: TENANT_ID,
        role: Role.Secretary,
        clinicId: CLINIC_ID,
        isActive: true,
        overrides: null,
      },
      {
        id: 'membership-manager-staff-permissions',
        userId: MANAGER_ID,
        tenantId: TENANT_ID,
        role: Role.Manager,
        clinicId: CLINIC_ID,
        isActive: true,
        overrides: null,
      },
    ],
  })
})

/** The session the case wants the action to act under. */
function session(
  role: Role,
  overrides: { readonly granted: readonly Permission[]; readonly revoked: readonly Permission[] } = {
    granted: [],
    revoked: [],
  },
): PanelSession {
  const permissions: TenantContext = Object.freeze({
    userId: MANAGER_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role,
    overrides: Object.freeze(overrides),
  })
  return Object.freeze({ permissions, tenantId: TENANT_ID, role })
}

const grantedSession = session(Role.Secretary, {
  granted: [Permission.ManageUsers],
  revoked: [],
})

async function invite() {
  return inviteStaffAction({
    mobile: STAFF_MOBILE,
    firstName: 'منشی',
    lastName: 'جدید',
    password: '12345678',
    role: 'SECRETARY',
  })
}

describe('inviteStaffAction — the door the permission keeps', () => {
  it('refuses a doctor with the permission sentence, and writes no user and no membership', async () => {
    sessionRef.current = session(Role.Doctor)

    const result = await invite()
    // The sentence is the one the owning module's own catalog holds —
    // `moduleFailureMessage` maps `permission.denied` here, and the constant is
    // read rather than retyped.
    expect(result).toEqual({ ok: false, message: ROLES_MESSAGES['permission.denied'] })

    // Only the seeded pair of people and their two memberships exist: the
    // refusal is not a partial write.
    expect(await unscoped.user.count()).toBe(2)
    expect(await unscoped.membership.count()).toBe(2)
    expect(await unscoped.auditLog.count()).toBe(0)
  })

  it("refuses a secretary the same way — the column stops at twelve — and then admits her once manage_users is granted", async () => {
    // Her defaults carry twelve permissions; `manage_users` is the sixteenth, so
    // the plain secretary column does not open this action.
    sessionRef.current = session(Role.Secretary)
    const refused = await invite()
    expect(refused.ok).toBe(false)
    expect(await unscoped.membership.count()).toBe(2)

    // The same session with the grant in the overrides is admitted: the effective
    // set is the union, and the action reads it at the boundary — the role label
    // alone told the truth about the default column and nothing more.
    sessionRef.current = grantedSession
    const granted = await invite()
    expect(granted).toEqual({ ok: true })

    const invited = await unscoped.membership.findFirstOrThrow({
      where: { tenantId: TENANT_ID, user: { mobile: STAFF_MOBILE } },
      include: { user: { select: { mobile: true, firstName: true } } },
    })
    expect(invited.role).toBe(Role.Secretary)
    expect(invited.user.mobile).toBe(STAFF_MOBILE)
  })

  it("writes the invited membership and the audit row a manager's invitation carries", async () => {
    sessionRef.current = session(Role.Manager)

    const result = await invite()
    expect(result).toEqual({ ok: true })

    // Three people and three memberships — the seeded two plus the invite's own
    // pair, created together, which is what keeps a person from existing
    // without a tenant.
    expect(await unscoped.user.count()).toBe(3)
    expect(await unscoped.membership.count()).toBe(3)

    // The write is audited, so the change the manager made is a fact the ledger
    // holds even before the person's first login.
    const invited = await unscoped.membership.findFirstOrThrow({
      where: { tenantId: TENANT_ID, user: { mobile: STAFF_MOBILE } },
    })
    const audit = await unscoped.auditLog.findFirstOrThrow({
      where: { tenantId: TENANT_ID, entityId: invited.id },
    })
    expect(audit.action).toBe('staff.invited')
  })
})

describe('updateMembershipPermissionsAction — the matrix edit, and the door before it', () => {
  it('refuses a doctor the sentence and leaves the target membership untouched', async () => {
    sessionRef.current = session(Role.Doctor)

    const result = await updateMembershipPermissionsAction(TARGET_MEMBERSHIP_ID, {
      granted: ['view_debts'],
      revoked: [],
    })
    expect(result.ok).toBe(false)

    // The target row still holds the shape it had — the refusal did not write
    // half of an edit onto the column the case meant to change.
    const target = await unscoped.membership.findUniqueOrThrow({
      where: { id: TARGET_MEMBERSHIP_ID },
    })
    expect(target.overrides).toBeNull()
  })

  it('raises rather than answers when the session opens no staff panel at all', async () => {
    sessionRef.current = null

    // The two actions differ in how they call the resolver — `inTenantScope`
    // resolves before the promise chain that maps errors, and the permissions
    // action resolves on its own — and both let the resolution failure raise,
    // because the caller of a resolution failure is a shell, not a form.
    await expect(invite()).rejects.toMatchObject({ reason: 'no-membership' })
    await expect(
      updateMembershipPermissionsAction(TARGET_MEMBERSHIP_ID, {
        granted: ['view_debts'],
        revoked: [],
      }),
    ).rejects.toMatchObject({ reason: 'no-membership' })

    expect(await unscoped.membership.count()).toBe(2)
  })

  it("applies a manager's edit to the secretary's column as the delta the form sent", async () => {
    sessionRef.current = session(Role.Manager)

    const result = await updateMembershipPermissionsAction(TARGET_MEMBERSHIP_ID, {
      granted: ['view_debts', 'manage_campaigns', 'not-a-permission'],
      revoked: [],
    })
    expect(result).toEqual({ ok: true })

    // The unknown slug is dropped and the two real ones land as the JSON string
    // the column stores — the parse round-trips through `parsePermissionOverrides`.
    const target = await unscoped.membership.findUniqueOrThrow({
      where: { id: TARGET_MEMBERSHIP_ID },
    })
    expect(JSON.parse(target.overrides ?? 'null')).toEqual({
      granted: ['view_debts', 'manage_campaigns'],
      revoked: [],
    })
  })
})
