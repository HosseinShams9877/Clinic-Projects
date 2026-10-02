/**
 * §2's permission matrix, and the two directions it is read from.
 *
 * Phase 1 requires "the 96-test permission matrix (16 permissions × 3 roles × 2
 * directions) **GREEN before any feature work begins**". The arithmetic is
 * `16 × 3 × 2 = 96`, and the two directions are the two ways a caller asks the
 * question:
 *
 * 1. `can(ctx, permission)` — the enforcement primitive, which is what a module
 *    function actually branches on.
 * 2. `effectivePermissions(role, overrides).includes(permission)` — the set the
 *    staff screen renders and counts, and the value the tenant invariant is stated
 *    over.
 *
 * ## Why the expectations are typed out rather than derived
 *
 * The obvious implementation of this file is to compute the expected value from
 * `ROLE_DEFAULTS` — and that would test nothing. It would assert that a value equals
 * itself, and it would pass just as green if `ROLE_DEFAULTS` were wrong in every
 * cell. So the expected marks below are transcribed from `04-roles-permissions.md`
 * §2's مدیر / پزشک / منشی columns, written as **literal slugs**, which is a
 * representation `ROLE_DEFAULTS` does not use — it writes `DOCTOR` as three
 * positions of `PERMISSIONS`. The two representations agree only if the positions
 * are right, and the last test in this file is the one that pins them to §2.1's
 * numbering.
 *
 * §2 records where its table came from and that it is a reconstruction: the
 * specification's own matrix "was destroyed in PDF→text extraction", so it was
 * rebuilt from `clinic/admin/staff.html` — whose cells are explicit
 * `<input type="checkbox" checked>` — and cross-validated against the same file's
 * «۱۲ دسترسی از ۱۶» beside منشی مریم صالحی. That cross-check is reproduced here as
 * the §2.2 fixture below, which is the reason to trust the table this file
 * transcribes.
 */

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, Permission, ROLES, Role } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import type { PermissionOverrides, TenantContext } from '@/core/tenant'
import { asClinicId, asTenantId, asUserId } from '@/core/types'

import { ROLE_DEFAULTS, can, effectivePermissions } from '../index'

/* ── The fixtures ─────────────────────────────────────────────────────────── */

/** A resolved context. Every field but `role` and `overrides` is fixed. */
function contextFor(
  role: Role,
  overrides: PermissionOverrides = EMPTY_PERMISSION_OVERRIDES,
): TenantContext {
  return {
    userId: asUserId('user_maryam'),
    tenantId: asTenantId('tenant_demo'),
    clinicId: asClinicId('clinic_central'),
    role,
    overrides,
  }
}

/**
 * §2's three columns, transcribed slug by slug.
 *
 * «همیشه» becomes the sixteen slugs for `MANAGER`; the ✓ and — marks become the
 * other two lists. Read down §2's table and you get these three sets, in this order.
 */
const GRANTED_BY_DEFAULT: Readonly<Record<Role, readonly Permission[]>> = {
  MANAGER: [
    'view_own_schedule',
    'view_all_schedules',
    'manage_appointments',
    'record_appointment_result',
    'view_own_customer_records',
    'view_all_customers',
    'view_debts',
    'record_payment',
    'follow_up_debt',
    'view_own_cycles',
    'act_on_cycles',
    'manage_leads',
    'manage_campaigns',
    'manage_services',
    'manage_clinic_settings',
    'manage_users',
  ],
  // ✓ on rows 1, 5 and 10; — on the other thirteen.
  DOCTOR: ['view_own_schedule', 'view_own_customer_records', 'view_own_cycles'],
  // ✓ on rows 1–12; — on rows 13–16, the four a secretary never holds.
  SECRETARY: [
    'view_own_schedule',
    'view_all_schedules',
    'manage_appointments',
    'record_appointment_result',
    'view_own_customer_records',
    'view_all_customers',
    'view_debts',
    'record_payment',
    'follow_up_debt',
    'view_own_cycles',
    'act_on_cycles',
    'manage_leads',
  ],
}

/** The 48 (role, permission) pairs, in §2's row order within each role. */
const PAIRS: [Role, Permission][] = ROLES.flatMap((role) =>
  PERMISSIONS.map((permission): [Role, Permission] => [role, permission]),
)

/** The mark §2 gives a cell. */
function expectedFor(role: Role, permission: Permission): boolean {
  return GRANTED_BY_DEFAULT[role].includes(permission)
}

/* ── The 96 cases ─────────────────────────────────────────────────────────── */

describe('§2 matrix — direction one: can()', () => {
  it.each(PAIRS)('%s · %s', (role, permission) => {
    expect(can(contextFor(role), permission)).toBe(expectedFor(role, permission))
  })
})

describe('§2 matrix — direction two: effectivePermissions()', () => {
  it.each(PAIRS)('%s · %s', (role, permission) => {
    const effective = effectivePermissions(role, EMPTY_PERMISSION_OVERRIDES)

    expect(effective.includes(permission)).toBe(expectedFor(role, permission))
  })
})

/* ── §2.1's counts, and the numbering the ranges are written against ──────── */

describe('§2.1 role defaults', () => {
  it('counts 16, 3 and 12', () => {
    // §2.1's «تعداد» column, and the arithmetic §2.2 checks against it: منشی
    // مریم صالحی's «۱۲ دسترسی از ۱۶» is the secretary default with no overrides.
    expect(ROLE_DEFAULTS.MANAGER).toHaveLength(16)
    expect(ROLE_DEFAULTS.DOCTOR).toHaveLength(3)
    expect(ROLE_DEFAULTS.SECRETARY).toHaveLength(12)
  })

  it('gives the manager all sixteen, in order', () => {
    expect(ROLE_DEFAULTS.MANAGER).toEqual([...PERMISSIONS])
  })

  it("puts the doctor's three at §2.1's positions 1, 5 and 10", () => {
    // `ROLE_DEFAULTS` writes `DOCTOR` as `PERMISSIONS[0]`, `[4]` and `[9]`. §2.1
    // writes it as «1, 5, 10». This is the test that fails when the offsets and the
    // numbering drift apart — and it is the one an off-by-one actually breaks,
    // because the slug lists above would still be internally consistent.
    expect(ROLE_DEFAULTS.DOCTOR).toEqual([
      'view_own_schedule',
      'view_own_customer_records',
      'view_own_cycles',
    ])
    expect(PERMISSIONS.indexOf('view_own_schedule')).toBe(0)
    expect(PERMISSIONS.indexOf('view_own_customer_records')).toBe(4)
    expect(PERMISSIONS.indexOf('view_own_cycles')).toBe(9)
  })

  it("takes the secretary's twelve as §2.1's range 1–12", () => {
    expect(ROLE_DEFAULTS.SECRETARY).toEqual([...PERMISSIONS.slice(0, 12)])
    // The four it stops short of — §2.1's rows 13–16, the ones §2.1 calls the
    // secretary's ceiling: campaigns, services, clinic settings, users.
    expect(ROLE_DEFAULTS.SECRETARY).not.toContain(Permission.ManageCampaigns)
    expect(ROLE_DEFAULTS.SECRETARY).not.toContain(Permission.ManageServices)
    expect(ROLE_DEFAULTS.SECRETARY).not.toContain(Permission.ManageClinicSettings)
    expect(ROLE_DEFAULTS.SECRETARY).not.toContain(Permission.ManageUsers)
  })

  it('cannot be mutated through the record it is exported as', () => {
    // Every authorisation decision in the product derives from this value, and it is
    // shared module state. Frozen at both levels: the record and each list.
    expect(Object.isFrozen(ROLE_DEFAULTS)).toBe(true)
    expect(Object.isFrozen(ROLE_DEFAULTS.MANAGER)).toBe(true)
    expect(Object.isFrozen(ROLE_DEFAULTS.DOCTOR)).toBe(true)
    expect(Object.isFrozen(ROLE_DEFAULTS.SECRETARY)).toBe(true)
  })
})

/* ── §2.2's arithmetic, over the four live examples ───────────────────────── */

describe('§2.2 overrides', () => {
  /**
   * The four rows of §2.2's table, as counts.
   *
   * §2.2 states each as «n از ۱۶» and gives the delta rather than naming which
   * permissions moved — «−۲ از پیشفرض» is the whole of it. So the counts are the
   * documented facts and are asserted exactly; **which** two permissions the fixture
   * revokes, and which two it grants, is this file's choice, and the assertions are
   * written so that the choice cannot matter: a count is what §2.2 publishes.
   */
  it('counts the secretary default at 12 with no overrides', () => {
    // منشی مریم صالحی — «۱۲ از ۱۶» — none.
    const effective = effectivePermissions(Role.Secretary, EMPTY_PERMISSION_OVERRIDES)

    expect(effective).toHaveLength(12)
  })

  it('counts a secretary with two revocations at 10', () => {
    // منشی سحر رحیمی — «۱۰ از ۱۶» — −۲ from default.
    const overrides: PermissionOverrides = {
      granted: [],
      revoked: [Permission.ViewAllSchedules, Permission.FollowUpDebt],
    }

    expect(effectivePermissions(Role.Secretary, overrides)).toHaveLength(10)
  })

  it('counts a doctor with two grants at 5', () => {
    // دکتر آرش کیانی — «۵ از ۱۶» — +۲ over default (3 + 2 = 5).
    const overrides: PermissionOverrides = {
      granted: [Permission.ManageAppointments, Permission.RecordAppointmentResult],
      revoked: [],
    }

    expect(effectivePermissions(Role.Doctor, overrides)).toHaveLength(5)
  })

  it('counts a doctor with one grant at 4', () => {
    // دکتر سارا نادری — «۴ از ۱۶» — +۱ over default (3 + 1 = 4).
    const overrides: PermissionOverrides = {
      granted: [Permission.ViewAllCustomers],
      revoked: [],
    }

    expect(effectivePermissions(Role.Doctor, overrides)).toHaveLength(4)
  })

  it('subtracts before it counts, when a permission is both granted and revoked', () => {
    // §2.2's formula is `(roleDefault ∪ granted) \ revoked` — the subtraction is
    // last, so a permission that appears in both sets is **gone**. Reading the
    // formula left to right gives this; a `Set` built by adding the grants after
    // deleting the revocations would give the opposite, and the two differ only on
    // a row a UI should never write. Pinned because the precedence is the formula.
    const overrides: PermissionOverrides = {
      granted: [Permission.ManageAppointments],
      revoked: [Permission.ManageAppointments],
    }

    expect(effectivePermissions(Role.Secretary, overrides)).not.toContain(
      Permission.ManageAppointments,
    )
    expect(effectivePermissions(Role.Secretary, overrides)).toHaveLength(11)
  })

  it('cannot be widened past the permissions that exist', () => {
    // A grant is an addition to a closed set of sixteen. A row naming something
    // outside it is caught by `core/tenant`'s reader before it reaches here, so the
    // only claim this file can make is the one worth making: the result is a subset
    // of the sixteen and never a seventeenth.
    const overrides: PermissionOverrides = {
      granted: [...PERMISSIONS],
      revoked: [],
    }

    expect(effectivePermissions(Role.Doctor, overrides)).toHaveLength(16)
  })

  it('returns the permissions in §2 order, not in insertion order', () => {
    // The staff screen renders the list and counts it. «۱۰ از ۱۶» has to mean the
    // tenth permission of §2, and a set's insertion order is whatever the override
    // row happened to be written in.
    const overrides: PermissionOverrides = {
      granted: [Permission.ManageServices, Permission.ViewAllCustomers],
      revoked: [],
    }

    const effective = effectivePermissions(Role.Doctor, overrides)

    expect(effective).toEqual([
      'view_own_schedule',
      'view_own_customer_records',
      'view_all_customers',
      'view_own_cycles',
      'manage_services',
    ])
  })

  it('ignores a duplicate grant', () => {
    const overrides: PermissionOverrides = {
      granted: [Permission.ManageAppointments, Permission.ManageAppointments],
      revoked: [],
    }

    const effective = effectivePermissions(Role.Secretary, overrides)

    expect(effective).toHaveLength(12)
    expect(
      effective.filter((permission) => permission === Permission.ManageAppointments),
    ).toHaveLength(1)
  })

  it('ignores a revocation of something the role never held', () => {
    const overrides: PermissionOverrides = {
      granted: [],
      revoked: [Permission.ManageUsers],
    }

    expect(effectivePermissions(Role.Doctor, overrides)).toHaveLength(3)
  })
})
