/**
 * The locked manager column — `04-roles-permissions.md` §2.3.
 *
 * §2.3 calls the guarantee **structural** and says it is enforced in three places.
 * Two of them are code in this module and both are tested here:
 *
 * 2. "The `roles-permissions` module rejects any write that would remove a
 *    permission from a `MANAGER` membership" — `assertOverridesAllowed`.
 * 3. "A database-level invariant check inside the same transaction refuses to commit
 *    a tenant whose last active `MANAGER` would lose `manage_users` or
 *    `manage_clinic_settings`" — `assertTenantKeepsRecoveryManager`.
 *
 * The first of the three is the UI rendering no control for the column, which is
 * Phase 2's screen.
 *
 * The read path is tested here too, and it is the half that is easiest to leave out:
 * `effectivePermissions` ignores a manager's `revoked` list as well as refusing to
 * write one. A guard only on the way in protects rows written by this version, and
 * the row that already exists — from an older release, a hand-edited database, a
 * migration that half-applied — is exactly the row that would take the last manager's
 * access away.
 */

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, Permission, ROLES, Role } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import type { PermissionOverrides } from '@/core/tenant'
import { DomainError } from '@/core/types'

import type { MembershipSnapshot } from '../index'
import {
  assertOverridesAllowed,
  assertTenantKeepsRecoveryManager,
  effectivePermissions,
  isManagerColumnLocked,
  tenantHasRecoveryManager,
} from '../index'

/** A stored override set, written the way a membership row holds it. */
function overrides(
  granted: readonly Permission[],
  revoked: readonly Permission[],
): PermissionOverrides {
  return { granted, revoked }
}

/** A membership as the tenant invariant sees it. */
function membership(
  role: Role,
  options: { readonly overrides?: PermissionOverrides; readonly active?: boolean } = {},
): MembershipSnapshot {
  return {
    role,
    overrides: options.overrides ?? EMPTY_PERMISSION_OVERRIDES,
    active: options.active ?? true,
  }
}

/* ── Enforcement point 2: the write path ──────────────────────────────────── */

describe('isManagerColumnLocked', () => {
  it.each([...ROLES])('locks %s only', (role) => {
    // §2.3 names exactly one locked column. `MANAGER` is it, and the other two are
    // freely editable — DOCTOR and SECRETARY are the roles a manager hires,
    // promotes and narrows.
    expect(isManagerColumnLocked(role)).toBe(role === Role.Manager)
  })
})

describe('assertOverridesAllowed', () => {
  it('refuses a revocation on a manager membership', () => {
    // Immutable rule 9's sibling: this is not a user raising their own access but a
    // tenant ending up with nobody able to administer it.
    expect(() =>
      assertOverridesAllowed(Role.Manager, overrides([], [Permission.ManageUsers])),
    ).toThrow(DomainError)
  })

  it('refuses it even when another manager is granting at the same time', () => {
    // A grant in the same payload must not buy the revocation past the guard. The
    // two sets are applied independently by §2.2's formula, and — for a manager —
    // the grant is a no-op while the revocation is not.
    expect(() =>
      assertOverridesAllowed(
        Role.Manager,
        overrides([...PERMISSIONS], [Permission.ManageClinicSettings]),
      ),
    ).toThrow(DomainError)
  })

  it('raises the catalog key the boundary renders', () => {
    try {
      assertOverridesAllowed(Role.Manager, overrides([], [Permission.ManageUsers]))
      throw new Error('assertOverridesAllowed returned for a manager revocation')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('DOMAIN')
      expect((error as DomainError).messageKey).toBe('permission.managerColumnLocked')
      expect((error as DomainError).detail).toEqual({
        role: Role.Manager,
        revoked: [Permission.ManageUsers],
      })
    }
  })

  it('allows a manager with no overrides at all', () => {
    expect(() =>
      assertOverridesAllowed(Role.Manager, EMPTY_PERMISSION_OVERRIDES),
    ).not.toThrow()
  })

  it('allows a grant on a manager membership, which is a no-op', () => {
    // §2.3 refuses removals, and only removals. A manager default is all sixteen
    // permissions, so there is nothing a grant could add; refusing it would be a
    // rule the specification does not state, enforced against a write that changes
    // nothing.
    expect(() =>
      assertOverridesAllowed(Role.Manager, overrides([Permission.ViewDebts], [])),
    ).not.toThrow()
  })

  it.each([Role.Doctor, Role.Secretary])('allows a revocation on a %s membership', (role) => {
    // §2.2's four live examples are all of this shape — «−۲ از پیشفرض» for a
    // secretary — so the guard has to let them through.
    expect(() =>
      assertOverridesAllowed(role, overrides([], [Permission.ViewAllSchedules])),
    ).not.toThrow()
  })
})

/* ── The read path: the same guarantee, for the row that is already there ─── */

describe('the manager column on the read path', () => {
  it('ignores a stored revocation of every permission', () => {
    const storedRow = overrides([], [...PERMISSIONS])

    expect(effectivePermissions(Role.Manager, storedRow)).toHaveLength(16)
  })

  it('ignores a stored revocation of the two recovery permissions', () => {
    const storedRow = overrides([], [Permission.ManageUsers, Permission.ManageClinicSettings])

    const effective = effectivePermissions(Role.Manager, storedRow)

    expect(effective).toContain(Permission.ManageUsers)
    expect(effective).toContain(Permission.ManageClinicSettings)
  })

  it('still honours a revocation for the other two roles', () => {
    // The lock is the manager's alone. If the read path ignored revocations
    // generally, every «−۲ از پیشفرض» in the product would silently stop working.
    const storedRow = overrides([], [Permission.ViewAllSchedules])

    expect(effectivePermissions(Role.Secretary, storedRow)).toHaveLength(11)
  })

  it('does not duplicate a permission that is both default and granted', () => {
    const effective = effectivePermissions(
      Role.Manager,
      overrides([Permission.ManageUsers, Permission.ManageUsers], []),
    )

    expect(effective).toHaveLength(16)
  })
})

/* ── Enforcement point 3: the tenant invariant ────────────────────────────── */

describe('tenantHasRecoveryManager', () => {
  it('is true when an active manager is present', () => {
    expect(tenantHasRecoveryManager([membership(Role.Manager)])).toBe(true)
  })

  it('is false for an empty tenant', () => {
    // Fail-closed: a tenant whose memberships could not be read is not a tenant
    // with a manager. §2.3's whole point is that this state is unrecoverable.
    expect(tenantHasRecoveryManager([])).toBe(false)
  })

  it('is false when the only manager is deactivated', () => {
    // §2.3 says "last **active** `MANAGER`". A deactivated membership keeps its row
    // and its role, and counting it would leave the tenant with nobody able to sign
    // in and appoint a replacement.
    expect(tenantHasRecoveryManager([membership(Role.Manager, { active: false })])).toBe(false)
  })

  it('is false when the only manager is demoted', () => {
    // The other half of §2.3's third check, and the one the lock cannot cover: no
    // override row changes here, only the role. A secretary's default stops at
    // `manage_leads`, so the tenant loses both recovery permissions at once.
    expect(tenantHasRecoveryManager([membership(Role.Secretary)])).toBe(false)
  })

  it('is true when a second manager remains', () => {
    const staff = [membership(Role.Manager, { active: false }), membership(Role.Manager)]

    expect(tenantHasRecoveryManager(staff)).toBe(true)
  })

  it('counts a secretary who has been granted both recovery permissions', () => {
    // §2.3's invariant is stated over the **permissions**, not over the role —
    // "would lose `manage_users` or `manage_clinic_settings`". A non-manager holding
    // both can administer the tenant: they can appoint a manager, which is the only
    // capability the invariant exists to preserve. Stating it over the role instead
    // would refuse a change that leaves the tenant perfectly recoverable.
    const promoted = membership(
      Role.Secretary,
      { overrides: overrides([Permission.ManageUsers, Permission.ManageClinicSettings], []) },
    )

    expect(tenantHasRecoveryManager([promoted])).toBe(true)
  })

  it('does not count a manager who holds only one of the two', () => {
    // Only reachable if the lock were absent — which is why it is worth asserting.
    // Both permissions are required: `manage_users` alone cannot configure the
    // clinic and `manage_clinic_settings` alone cannot appoint a successor. With the
    // lock in place a real manager holds both, so this fixture is a hand-built row.
    const halfAppointed = membership(
      Role.Secretary,
      { overrides: overrides([Permission.ManageUsers], []) },
    )

    expect(tenantHasRecoveryManager([halfAppointed])).toBe(false)
  })

  it('counts a manager despite a contradictory stored revocation', () => {
    // The read path and the invariant agree because both read
    // `effectivePermissions`. If the invariant read the row instead, a stale
    // revocation would make the guard refuse every change to the tenant, including
    // the change that would fix it.
    const staleRow = membership(
      Role.Manager,
      { overrides: overrides([], [Permission.ManageUsers]) },
    )

    expect(tenantHasRecoveryManager([staleRow])).toBe(true)
  })
})

describe('assertTenantKeepsRecoveryManager', () => {
  it('returns when a manager remains', () => {
    expect(() =>
      assertTenantKeepsRecoveryManager([membership(Role.Manager)]),
    ).not.toThrow()
  })

  it('refuses a change that would leave the tenant with none', () => {
    expect(() => assertTenantKeepsRecoveryManager([membership(Role.Secretary)])).toThrow(
      DomainError,
    )
  })

  it('raises the catalog key the boundary renders', () => {
    try {
      assertTenantKeepsRecoveryManager([])
      throw new Error('assertTenantKeepsRecoveryManager returned for an empty tenant')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('DOMAIN')
      expect((error as DomainError).messageKey).toBe('permission.lastManager')
    }
  })

  it('is the same predicate the boolean form answers', () => {
    // Two entry points, one rule. A caller that checks the boolean and skips the
    // assert must not be able to reach a different conclusion.
    const allowedCases: readonly (readonly MembershipSnapshot[])[] = [
      [membership(Role.Manager)],
      [membership(Role.Manager, { active: false }), membership(Role.Manager)],
    ]
    const refusedCases: readonly (readonly MembershipSnapshot[])[] = [
      [],
      [membership(Role.Manager, { active: false })],
      [membership(Role.Secretary)],
      [membership(Role.Doctor), membership(Role.Secretary)],
    ]

    for (const memberships of allowedCases) {
      expect(tenantHasRecoveryManager(memberships)).toBe(true)
      expect(() => {
        assertTenantKeepsRecoveryManager(memberships)
      }).not.toThrow()
    }

    for (const memberships of refusedCases) {
      expect(tenantHasRecoveryManager(memberships)).toBe(false)
      expect(() => {
        assertTenantKeepsRecoveryManager(memberships)
      }).toThrow(DomainError)
    }
  })
})
