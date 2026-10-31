/**
 * The three doors and the navigation they admit — area 4's route level.
 *
 * The audit's premise for this area is "a permission whose target role's panel
 * lacks the route/page is invalid". The repository has no validator that rejects
 * such an assignment; what it has are the two mechanisms that make the
 * assignment harmless, and this suite drives both against the real code:
 *
 * - `resolveStaffPanel`'s **door** — `ROLE_PANEL[role] !== panel` throws with
 *   reason `no-membership`, so a membership's *role* opens a panel and nothing
 *   else does. A doctor holding every admin-level permission through overrides
 *   still cannot pass the admin door, which is the honest form of the premise:
 *   no assignment of permissions can open a panel the role does not hold.
 * - `staffNavigation`'s **filter** — every gated item and gated group child is
 *   dropped unless `can()` holds on the *effective* set (role defaults ∪
 *   granted, minus revoked), so the navigation a person sees tracks their
 *   permissions and not their role's label.
 *
 * The resolver is exercised for real: only `next/headers`' cookie store,
 * `@/core/db`'s client and the clock are replaced, so `getTenantContext` runs
 * against a seeded session and the door check runs against its answer. The
 * cookie and the clock are what make the door a testable boundary — the token
 * is what the request carries, and `realClock` is what expires it.
 *
 * One defensive note: `resolveStaffPanel`'s `getMultiTenant()` parses the
 * environment with the schema in `env.ts`, whose `NEXTAUTH_SECRET` has no
 * default. The values are set defensively below (not stubbed, so the schema's
 * own defaults stay in force) so the boot check cannot depend on the machine's
 * `.env`, and `MULTI_TENANT` defaults to `true` so no single-tenant licence
 * check is triggered.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import { hashToken } from '@/core/db/context'
import { SESSION_COOKIE } from '@/modules/auth'
import type { PrismaClient } from '@prisma/client'

import { resolveAnyStaffPanel, resolveStaffPanel, requireStaffPanel } from './session'
import { staffNavigation, type NavItem, type Panel } from './navigation'

import { can } from '@/modules/roles-permissions'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

// The invitation-less defaults the environment schema requires; see the header.
process.env.NEXTAUTH_SECRET ??= 'a'.repeat(64)
process.env.MULTI_TENANT ??= 'true'

const TENANT_ID: TenantId = asTenantId('tenant-panel-access')
const CLINIC_ID = asClinicId('clinic-panel-access')
const USER_ID: UserId = asUserId('user-panel-access')

/** The tokens the cookie store hands the resolver, one per seeded session. */
const MANAGER_TOKEN = 'token-manager-panel-access'
const DOCTOR_TOKEN = 'token-doctor-panel-access'
const SECRETARY_TOKEN = 'token-secretary-panel-access'

/** The fixed clock — ۱۴۰۵/۰۷/۱۴, and the moment sessions are expired against. */
const NOW = vi.hoisted(() => new Date('2026-10-06T10:00:00.000Z'))

/** The per-file database, handed to the mocked `unscopedPrisma()` through the hoisted ref. */
const clientRef = vi.hoisted(() => ({ current: null as PrismaClient | null }))

/** The cookie the request carries — `null` is the request that carries no session. */
const cookieRef = vi.hoisted(() => ({ token: null as string | null }))

/** Where the mocked `redirect()` sent the request. */
const redirectRef = vi.hoisted(() => ({ path: '' }))

vi.mock('@/core/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/db')>()
  return { ...actual, unscopedPrisma: () => clientRef.current, prisma: () => clientRef.current }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieRef.token !== null ? { value: cookieRef.token } : undefined,
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    redirectRef.path = path
    throw new Error(`redirected:${path}`)
  },
}))

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
    unscoped.session.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])
  cookieRef.token = null
  redirectRef.path = ''

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'panel-access', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
})

/**
 * One person, one membership and one session, seeded for the role the case needs.
 *
 * `overrides` is written as the column stores it — a JSON string — so the
 * resolver's `parsePermissionOverrides` runs on a row like the production one.
 */
async function seedSession(args: {
  readonly role: Role
  readonly token: string
  readonly overrides?: { readonly granted: readonly Permission[]; readonly revoked: readonly Permission[] }
  readonly expiresAt?: Date
}): Promise<void> {
  await unscoped.user.create({
    data: {
      id: USER_ID,
      tenantId: TENANT_ID,
      mobile: '09120000070',
      firstName: 'کاربر',
      lastName: 'تست',
      passwordHash: 'x',
      isActive: true,
    },
  })
  await unscoped.membership.create({
    data: {
      userId: USER_ID,
      tenantId: TENANT_ID,
      role: args.role,
      clinicId: CLINIC_ID,
      isActive: true,
      overrides: args.overrides === undefined ? null : JSON.stringify(args.overrides),
    },
  })
  // Far enough in the future that the only reason a session fails is the one the
  // case names; the expiry case sets its own value.
  await unscoped.session.create({
    data: {
      userId: USER_ID,
      tenantId: TENANT_ID,
      tokenHash: hashToken(args.token),
      expiresAt: args.expiresAt ?? new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: null,
    },
  })
  cookieRef.token = args.token
}

/** A permission context the case chooses, so navigation and `can` see what the case means. */
function contextFor(
  role: Role,
  overrides: { readonly granted: readonly Permission[]; readonly revoked: readonly Permission[] } = {
    granted: [],
    revoked: [],
  },
): TenantContext {
  return Object.freeze({
    userId: USER_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role,
    overrides: Object.freeze(overrides),
  })
}

/** Every destination the navigation offers, groups flattened into their children. */
function hrefsOf(items: readonly NavItem[]): readonly string[] {
  return items.flatMap((item) =>
    item.children ? hrefsOf(item.children) : item.href === undefined ? [] : [item.href],
  )
}

describe("resolveStaffPanel — the door reads the role, and not the permissions", () => {
  it("resolves a manager under admin and builds the context the navigation reads", async () => {
    await seedSession({ role: Role.Manager, token: MANAGER_TOKEN })

    const session = await resolveStaffPanel('admin')
    expect(session.role).toBe(Role.Manager)
    expect(session.tenantId).toBe(TENANT_ID)
    // The ids are branded at this boundary, and the session is frozen — the shell
    // cannot hand a page an unbranded id or mutate the one it got.
    expect(session.permissions.userId).toBe(USER_ID)
    expect(session.permissions.tenantId).toBe(TENANT_ID)
    expect(session.permissions.clinicId).toBe(CLINIC_ID)
    expect(Object.isFrozen(session)).toBe(true)
    expect(Object.isFrozen(session.permissions)).toBe(true)
    // A manager's locked column: every permission holds, and a revoked one is not.
    expect(can(session.permissions, Permission.ManageClinicSettings)).toBe(true)

    // The shared surfaces' resolver answers the same session without the door, so
    // a campaign a receptionist and a manager both act on resolves for both.
    const any = await resolveAnyStaffPanel()
    expect(any.role).toBe(Role.Manager)
  })

  it('refuses a doctor at the admin door even when the membership grants the admin permissions', async () => {
    // The audit's premise, as the repository implements it: the *role* opens the
    // panel, and no grant on top of it does. This doctor holds manage_users,
    // manage_clinic_settings and view_debts — enough to render the whole admin
    // navigation — and the admin door still closes in their face.
    await seedSession({
      role: Role.Doctor,
      token: DOCTOR_TOKEN,
      overrides: {
        granted: [Permission.ManageUsers, Permission.ManageClinicSettings, Permission.ViewDebts],
        revoked: [],
      },
    })

    await expect(resolveStaffPanel('admin')).rejects.toMatchObject({ reason: 'no-membership' })
    // Their own door opens, and the granted permissions arrive in the context —
    // the panel they do hold renders the extra items.
    const session = await resolveStaffPanel('doctor')
    expect(session.role).toBe(Role.Doctor)
    expect(can(session.permissions, Permission.ViewDebts)).toBe(true)
  })

  it('refuses a secretary at the admin door and resolves at the reception one', async () => {
    await seedSession({ role: Role.Secretary, token: SECRETARY_TOKEN })

    await expect(resolveStaffPanel('admin')).rejects.toMatchObject({ reason: 'no-membership' })
    const session = await resolveStaffPanel('reception')
    expect(session.role).toBe(Role.Secretary)
    // The secretary's column stops at the twelfth permission, so the four the
    // admin panel gates behind ۱۳–۱۶ are absent without any override.
    expect(can(session.permissions, Permission.ManageCampaigns)).toBe(false)
    expect(can(session.permissions, Permission.ManageUsers)).toBe(false)
    expect(can(session.permissions, Permission.ViewAllSchedules)).toBe(true)
  })

  it("redirects to the staff login when the request carries no session it can use", async () => {
    // No cookie at all — the desk's shared machine, closed tab, any reason.
    cookieRef.token = null
    await expect(requireStaffPanel('admin')).rejects.toThrow('redirected:/login')
    expect(redirectRef.path).toBe('/login')

    // A cookie whose token no session row holds.
    cookieRef.token = 'token-nobody-ever-issued'
    await expect(requireStaffPanel('admin')).rejects.toThrow('redirected:/login')

    // A session the clock has passed.
    await seedSession({
      role: Role.Manager,
      token: MANAGER_TOKEN,
      expiresAt: new Date(NOW.getTime() - 60_000),
    })
    await expect(requireStaffPanel('admin')).rejects.toThrow('redirected:/login')

    // The row is untouched; `requireStaffPanel` navigates and never writes.
    expect(await unscoped.user.count()).toBe(1)
  })
})

describe("staffNavigation — the routes a person's permissions admit", () => {
  it("offers a doctor the doctor's own three destinations and no accounting at all", async () => {
    const nav = staffNavigation('doctor', contextFor(Role.Doctor))
    expect(hrefsOf(nav)).toEqual(['/doctor', '/doctor/customers', '/doctor/cycles'])

    // The accounting group is dropped whole, because every child gates on
    // `view_debts` and the doctor's column does not carry it — a group whose
    // children are all refused is not rendered as an empty heading.
    expect(hrefsOf(nav)).not.toContain('/doctor/debts')
    expect(nav.some((item) => item.children !== undefined)).toBe(false)
  })

  it("keeps the un-gated home and reports on an admin navigation that offers the doctor nothing else", async () => {
    // The doctor's own panel aside: through the admin navigation the doctor sees
    // only the two items that carry no permission — home and /admin/reports.
    // Everything else the admin shell names gates on a permission the doctor's
    // column lacks, which is the route level's answering of the same question.
    const nav = staffNavigation('admin', contextFor(Role.Doctor))
    expect(hrefsOf(nav)).toEqual(['/admin', '/admin/reports'])
  })

  it("admits a doctor's granted view_debts to the accounting group, and only there", async () => {
    // The effective set is the question: the grant is read from the overrides and
    // not from the role label, so the navigation widens for exactly this doctor.
    const ctx = contextFor(Role.Doctor, { granted: [Permission.ViewDebts], revoked: [] })
    const nav = staffNavigation('doctor', ctx)
    expect(hrefsOf(nav)).toEqual([
      '/doctor',
      '/doctor/customers',
      '/doctor/cycles',
      '/doctor/debts',
      '/doctor/installments',
      '/doctor/financial-reports',
    ])

    // The same grant admits the accounting group on the admin navigation too —
    // the group's gate is the permission, and the panel is not part of it. What
    // the grant does *not* do is open any other admin item nor the door itself.
    expect(hrefsOf(staffNavigation('admin', ctx))).toEqual([
      '/admin',
      '/admin/debts',
      '/admin/installments',
      '/admin/financial-reports',
      '/admin/reports',
    ])

    // And a revoked grant closes it again, which is the delta's other direction.
    const revoked = contextFor(Role.Doctor, { granted: [], revoked: [Permission.ViewDebts] })
    expect(hrefsOf(staffNavigation('doctor', revoked))).not.toContain('/doctor/debts')
  })

  it("offers a secretary the desk's eight destinations and withholds campaigns, the column's edge", async () => {
    // The secretary's column is positions ۱–۱۲: the desk, appointments, the
    // accounting group, cycles, leads and all customers all hold, but
    // `manage_campaigns` is position ۱۳ and the campaigns item is gone.
    const nav = staffNavigation('reception', contextFor(Role.Secretary))
    expect(hrefsOf(nav)).toEqual([
      '/reception/desk',
      '/reception/appointments',
      '/reception/debts',
      '/reception/installments',
      '/reception/financial-reports',
      '/reception/cycles',
      '/reception/leads',
      '/reception/customers',
    ])
    expect(hrefsOf(nav)).not.toContain('/reception/campaigns')

    // Through the admin navigation the same secretary is a near-complete reader:
    // her column holds six of the items the admin shell gates on, and the four it
    // does not — campaigns, services, staff, settings, positions ۱۳–۱۶ — are the
    // ones missing. The navigation admits by permission and not by panel, which is
    // the difference between this and the door `resolveStaffPanel` keeps.
    expect(hrefsOf(staffNavigation('admin', contextFor(Role.Secretary)))).toEqual([
      '/admin',
      '/admin/appointments',
      '/admin/customers',
      '/admin/debts',
      '/admin/installments',
      '/admin/financial-reports',
      '/admin/cycles',
      '/admin/reports',
    ])
  })

  it("offers a manager the admin navigation whole, which is the column's locked shape", async () => {
    const nav = staffNavigation('admin', contextFor(Role.Manager))
    expect(hrefsOf(nav)).toEqual([
      '/admin',
      '/admin/appointments',
      '/admin/customers',
      '/admin/debts',
      '/admin/installments',
      '/admin/financial-reports',
      '/admin/cycles',
      '/admin/campaigns',
      '/admin/services',
      '/admin/staff',
      '/admin/reports',
      '/admin/settings',
    ])
    // The navigation is pure: it builds a fresh array per call, so filtering for
    // one reader cannot leak into another.
    expect(staffNavigation('doctor', contextFor(Role.Doctor))).toHaveLength(3)
  })
})

describe('the panel the navigation and the resolver agree on', () => {
  it("answers a door's own navigation for the role that opened it, and no other", async () => {
    // `staffNavigation` takes the panel as an argument and can be asked for any
    // panel from any context; what is rendered is the pair the resolver permits.
    // For every role, the permitted panel is one, and the others' items are the
    // ones the permission set decides.
    await seedSession({ role: Role.Secretary, token: SECRETARY_TOKEN })
    const session = await resolveStaffPanel('reception')
    const own = hrefsOf(staffNavigation('reception', session.permissions))
    expect(own).toContain('/reception/debts')
    expect(own).not.toContain('/reception/campaigns')
    const other = hrefsOf(staffNavigation('admin', session.permissions))
    // The shared permission set, not the panel, decides — the admin navigation
    // offers this secretary seven of its eleven items even though the admin
    // *door* stays closed to her.
    expect(other).toContain('/admin/debts')
    expect(other).not.toContain('/admin/campaigns')
    expect(other).not.toContain('/admin/settings')
  })
})
