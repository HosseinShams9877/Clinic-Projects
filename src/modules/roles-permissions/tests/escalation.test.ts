/**
 * The four escalation paths of `04-roles-permissions.md` §3.3, one describe each.
 *
 * §3.3 is a table of attacks and the mechanism that closes each one. Two of the
 * four are closed by a module boundary this repository enforces structurally — "the
 * page's module call performs `requirePermission`; the page renders a 403 regardless
 * of how it was reached" — and the other two are guards that do not exist anywhere
 * else. Phase 1's definition of done names the whole suite: "Self-escalation
 * impossible and the tests prove it."
 *
 * The four rows, verbatim:
 *
 * | Attack | Closed by |
 * |---|---|
 * | Set `tenantId`/`clinicId` in a form field or query string | Nothing reads a client-supplied tenant. Resolution is from `Membership` only. |
 * | Call a page URL directly, bypassing a hidden menu item | The page's module call performs `requirePermission`; the page renders a 403 regardless of how it was reached. |
 * | Grant oneself a permission via the permissions form | The write path requires `manage_users` and validates that the actor is not the subject; a user cannot edit their own membership. |
 * | Remove the last manager's access | §2.3 — rejected at module and transaction level. |
 *
 * ## What a unit test can and cannot prove about the first row
 *
 * Row one is closed by the **absence** of a code path — nothing reads a tenant from
 * a request — and an absence is not provable by asserting on a function. What is
 * provable is the property that makes the absence matter: an authorisation decision
 * is a function of the membership alone, so a context carrying a tenant a caller
 * chose answers exactly what a context carrying the real one answers. That is the
 * assertion below, and it is the strongest form available at this layer. The
 * corresponding end-to-end check — a forged `tenantId` in a POST body changing
 * nothing — needs a running request, and it belongs to the cross-tenant suite that
 * `09-security.md` §4 requires against PostgreSQL.
 */

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, Permission, Role } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import type { TenantContext } from '@/core/tenant'
import { PermissionError, asClinicId, asTenantId, asUserId } from '@/core/types'

import {
  assertNotSelfEdit,
  assertOverridesAllowed,
  assertTenantKeepsRecoveryManager,
  can,
  requirePermission,
} from '../index'
import type { MembershipSnapshot } from '../index'

/** A resolved context for one fixed person at one fixed tenant. */
function contextFor(role: Role): TenantContext {
  return {
    userId: asUserId('user_maryam'),
    tenantId: asTenantId('tenant_demo'),
    clinicId: asClinicId('clinic_central'),
    role,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/* ── Path one: a client-supplied tenant ───────────────────────────────────── */

describe('§3.3 path one — setting tenantId or clinicId in the request', () => {
  /**
   * Two contexts that differ in every field a client could influence.
   *
   * One is "the real one". The other carries a different tenant, a different clinic,
   * a different user id and no clinic at all — which is what a forged body would
   * look like if anything read it. The membership is identical, because it is the
   * only part that comes from the `Membership` row.
   */
  const genuine: TenantContext = {
    userId: asUserId('user_maryam'),
    tenantId: asTenantId('tenant_demo'),
    clinicId: asClinicId('clinic_central'),
    role: Role.Secretary,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }

  const forged: TenantContext = {
    userId: asUserId('user_attacker'),
    tenantId: asTenantId('tenant_someone_else'),
    clinicId: null,
    role: Role.Secretary,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }

  it.each([...PERMISSIONS])('answers the same for %s', (permission) => {
    // Nothing reads a client-supplied tenant — `02-architecture.md` §11: "A forged
    // `clinicId` in a request body changes nothing, because nothing reads it." The
    // test of that claim at this layer is that every other field is inert.
    expect(can(forged, permission)).toBe(can(genuine, permission))
  })

  it('refuses the same permission for the same reason', () => {
    // `requirePermission` throws for the forged context exactly where it throws for
    // the genuine one, and carries the context it was handed rather than a resolved
    // tenant — which is why the audit line is written by the caller that resolved it.
    expect(() => {
      requirePermission(forged, Permission.ManageUsers)
    }).toThrow(PermissionError)
    expect(can(forged, Permission.ManageUsers)).toBe(false)
  })
})

/* ── Path two: calling a page URL directly ────────────────────────────────── */

describe('§3.3 path two — reaching a page by its URL', () => {
  it('refuses a secretary the staff screen', () => {
    // «اگر فقط منو را مخفی کنیم، منشی با دانستن آدرس صفحه به گزارش مالی میرسد» —
    // hiding a menu item is not a control. The module call is the control, and it
    // refuses on the permission and not on how the caller arrived.
    expect(() => {
      requirePermission(contextFor(Role.Secretary), Permission.ManageUsers)
    }).toThrow(PermissionError)
  })

  it('lets the same secretary into a page the matrix gives them', () => {
    // The negative half of the pair, and the one that matters for a false refusal:
    // `record_payment` is row 8, inside the secretary's default range of 1–12.
    expect(() => {
      requirePermission(contextFor(Role.Secretary), Permission.RecordPayment)
    }).not.toThrow()
  })

  it('refuses a doctor the financial report', () => {
    // §2.1: a doctor "cannot see the clinic-wide schedule, the full customer bank,
    // the debt list, or any money at all."
    expect(() => {
      requirePermission(contextFor(Role.Doctor), Permission.ViewDebts)
    }).toThrow(PermissionError)
  })

  it('lets a doctor into their own schedule', () => {
    expect(() => {
      requirePermission(contextFor(Role.Doctor), Permission.ViewOwnSchedule)
    }).not.toThrow()
  })

  it('carries the code, the key and the four detail fields', () => {
    try {
      requirePermission(contextFor(Role.Secretary), Permission.ManageCampaigns)
      throw new Error('requirePermission returned for a secretary asking for campaigns')
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionError)
      expect((error as PermissionError).code).toBe('PERMISSION_DENIED')
      expect((error as PermissionError).messageKey).toBe('permission.denied')
      expect((error as PermissionError).detail).toEqual({
        permission: Permission.ManageCampaigns,
        role: Role.Secretary,
        userId: 'user_maryam',
        tenantId: 'tenant_demo',
      })
    }
  })
})

/* ── Path three: granting oneself a permission ────────────────────────────── */

describe('§3.3 path three — editing one’s own membership', () => {
  it('refuses a manager editing their own membership', () => {
    // The case a permission check cannot catch. A manager **holds** `manage_users`,
    // so §3.3's first closure is satisfied and the request is authorised — the
    // refusal has to come from the identity comparison.
    const ctx = contextFor(Role.Manager)

    expect(() => {
      assertNotSelfEdit(ctx, ctx.userId)
    }).toThrow(PermissionError)
  })

  it('raises the catalog key the boundary renders', () => {
    const ctx = contextFor(Role.Manager)

    try {
      assertNotSelfEdit(ctx, ctx.userId)
      throw new Error('assertNotSelfEdit returned for the caller’s own id')
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionError)
      expect((error as PermissionError).code).toBe('PERMISSION_DENIED')
      expect((error as PermissionError).messageKey).toBe('permission.selfEdit')
      expect((error as PermissionError).detail).toEqual({
        userId: 'user_maryam',
        tenantId: 'tenant_demo',
      })
    }
  })

  it('allows editing anybody else, which is the whole job', () => {
    const ctx = contextFor(Role.Manager)

    expect(() => {
      assertNotSelfEdit(ctx, asUserId('user_sahar'))
    }).not.toThrow()
  })

  it('has no exemption for a manager, a sole staff member, or anyone else', () => {
    // §2.3's reasoning is why: "a rule with an exception is a rule whose exception
    // is the thing an attacker reaches for." Every role is refused, including the
    // one that could otherwise grant itself anything.
    for (const role of [Role.Manager, Role.Doctor, Role.Secretary]) {
      const ctx = contextFor(role)

      expect(() => {
        assertNotSelfEdit(ctx, ctx.userId)
      }).toThrow(PermissionError)
    }
  })

  it('still requires manage_users before the subject is even considered', () => {
    // The two closures are ordered: the capability first, then the identity. A
    // secretary is refused for the first reason and never reaches the second, which
    // is what makes "a user cannot edit their own membership" true for everybody
    // rather than only for the people who could not get in anyway.
    const secretary = contextFor(Role.Secretary)

    expect(() => {
      requirePermission(secretary, Permission.ManageUsers)
    }).toThrow(PermissionError)

    // ...and if they somehow got past it, the identity check is still there.
    expect(() => {
      assertNotSelfEdit(secretary, secretary.userId)
    }).toThrow(PermissionError)
  })
})

/* ── Path four: removing the last manager's access ────────────────────────── */

describe('§3.3 path four — removing the last manager’s access', () => {
  it('is refused at the module level when the manager’s permissions are edited', () => {
    // §2.3's second enforcement point.
    expect(() =>
      assertOverridesAllowed(Role.Manager, {
        granted: [],
        revoked: [Permission.ManageUsers],
      }),
    ).toThrow()
  })

  it('is refused at the transaction level when the manager is demoted', () => {
    // The route the permission guard cannot see, because no override row changes:
    // the role does. §2.3's third enforcement point runs over the tenant's
    // memberships as the transaction would commit them.
    const afterDemotion: readonly MembershipSnapshot[] = [
      { role: Role.Secretary, overrides: EMPTY_PERMISSION_OVERRIDES, active: true },
      { role: Role.Doctor, overrides: EMPTY_PERMISSION_OVERRIDES, active: true },
    ]

    expect(() => {
      assertTenantKeepsRecoveryManager(afterDemotion)
    }).toThrow()
  })

  it('is refused when the last manager is deactivated', () => {
    const afterDeactivation: readonly MembershipSnapshot[] = [
      { role: Role.Manager, overrides: EMPTY_PERMISSION_OVERRIDES, active: false },
    ]

    expect(() => {
      assertTenantKeepsRecoveryManager(afterDeactivation)
    }).toThrow()
  })

  it('is allowed once a second manager exists', () => {
    // The guard refuses the change that loses the last manager, not the change that
    // touches a manager. A tenant with two can demote one, which is the ordinary
    // case the rule has to let through.
    const afterDemotion: readonly MembershipSnapshot[] = [
      { role: Role.Manager, overrides: EMPTY_PERMISSION_OVERRIDES, active: true },
      { role: Role.Secretary, overrides: EMPTY_PERMISSION_OVERRIDES, active: true },
    ]

    expect(() => {
      assertTenantKeepsRecoveryManager(afterDemotion)
    }).not.toThrow()
  })
})
