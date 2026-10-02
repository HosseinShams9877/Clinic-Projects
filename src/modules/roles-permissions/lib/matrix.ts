/**
 * The permission matrix, and the two primitives every module enforces with.
 *
 * `04-roles-permissions.md` §2 is the source of record for the numbers below: a
 * sixteen-row table of permissions against three roles, reconstructed from the live
 * rendered table in `clinic/admin/staff.html` because the specification's own matrix
 * did not survive PDF extraction. §2.1 states the result as ranges, and this file
 * writes them as ranges rather than as three hand-typed lists — the thirty-two true
 * cells are a great deal of typing to get wrong, and the two facts that matter
 * (`SECRETARY = 1–12`, `DOCTOR = 1, 5, 10`) are each one line here.
 *
 * ## The formula
 *
 * ```
 * effective(user) = (roleDefault(role) ∪ granted(user)) \ revoked(user)
 * ```
 *
 * §2.2: "The role default is a **starting point**, not a ceiling." `granted` and
 * `revoked` are additions to and subtractions from one role default, so neither is
 * a full permission list — a stored full list would freeze a membership at the
 * matrix as it was on the day it was written.
 *
 * ## The two primitives
 *
 * §3.1 gives `roles-permissions` exactly one enforcement surface:
 *
 * ```ts
 * can(ctx: TenantContext, permission: Permission): boolean
 * requirePermission(ctx: TenantContext, permission: Permission): void  // throws
 * ```
 *
 * and one prohibition: "There is no overload that accepts a role, a user id, or a
 * permission list from a caller, a request body, or a cookie." That is why both take
 * a whole `TenantContext` and there is no `can(role, permission)` beside them. A
 * convenience overload taking a role is the exact shape the sentence forbids, and it
 * would be reached for by a caller who had a role in hand — which is a caller who
 * got it from somewhere other than the session.
 *
 * ## Why the check lives here and not in a page
 *
 * §3.2: the same module function is called by a Server Component, a Server Action, a
 * Route Handler **and the background worker**. A check in a page is a check the other
 * three skip. Placing it at the module boundary is what makes «سطح دسترسی باید در
 * سمت سرور بررسی شود، نه با پنهان کردن دکمه» true rather than aspirational — and
 * the specific consequence §3.3 names is that a secretary who knows a page's URL
 * otherwise "reaches the financial report".
 */

import { PERMISSIONS, Permission, type Role } from '@/core/constants'
import type { PermissionOverrides, TenantContext } from '@/core/tenant'
import { DomainError, PermissionError } from '@/core/types'

import type { MembershipSnapshot } from '../types'
import { isManagerColumnLocked } from './manager-lock'

/* ── §2.1 Role defaults ───────────────────────────────────────────────────── */

/**
 * §2.1 — «SECRETARY | 1–12 | 12».
 *
 * A named constant because the number is a fact about the specification and not an
 * arithmetic detail: `PERMISSIONS.slice(0, SECRETARY_DEFAULT_COUNT)` is a claim that
 * is checkable against §2.1, where `slice(0, 12)` is a magic number that a reader
 * has to go and count.
 */
const SECRETARY_DEFAULT_COUNT = 12

/**
 * The permissions each role holds with no overrides — §2's مدیر / پزشک / منشی
 * columns, which are «همیشه» / ✓ / — per row.
 *
 * `MANAGER` is «همیشه» on all sixteen: §2.1 says the row is "1–16, **locked**", and
 * the lock is `lib/manager-lock.ts`. `DOCTOR` is `PERMISSIONS` positions 1, 5 and 10
 * — `view_own_schedule`, `view_own_customer_records`, `view_own_cycles` — which §2.1
 * states as "1, 5, 10" and which is exactly the doctor's scope: "a doctor sees
 * **only their own** schedule, **only their own** patients' records, and **only
 * their own** cycles. They cannot see the clinic-wide schedule, the full customer
 * bank, the debt list, or any money at all."
 *
 * Frozen at both levels. This is the value every authorisation decision in the
 * product is derived from, and a mutable module-level record is one accidental
 * `ROLE_DEFAULTS.DOCTOR.push(...)` away from granting a doctor the debt list.
 */
export const ROLE_DEFAULTS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  MANAGER: Object.freeze([...PERMISSIONS]),
  DOCTOR: Object.freeze([PERMISSIONS[0], PERMISSIONS[4], PERMISSIONS[9]]),
  SECRETARY: Object.freeze(PERMISSIONS.slice(0, SECRETARY_DEFAULT_COUNT)),
})

/* ── The effective set ────────────────────────────────────────────────────── */

/**
 * The role default with the overrides applied, as a set.
 *
 * The single implementation of §2.2's formula. `effectivePermissions` and `can`
 * both read it, so the ordered list a screen renders and the boolean a guard
 * branches on cannot disagree — which is the failure that matters here, because it
 * would show a permission the server then refuses, or hide one it would allow.
 */
function effectiveSet(role: Role, overrides: PermissionOverrides): Set<Permission> {
  const permissions = new Set<Permission>(ROLE_DEFAULTS[role])

  for (const permission of overrides.granted) permissions.add(permission)

  // `\ revoked` — except for a manager, whose column is locked. See
  // `lib/manager-lock.ts` for why the read path checks it as well as the write path:
  // a stale row from an older release would otherwise be honoured.
  if (!isManagerColumnLocked(role)) {
    for (const permission of overrides.revoked) permissions.delete(permission)
  }

  return permissions
}

/**
 * A membership's effective permissions, in §2's documented order 1–16.
 *
 * Ordered rather than returned as the set, because the first screen that renders
 * this renders it as a list and the count beside it is the «۱۲ از ۱۶» that
 * `admin/staff.html` shows. Deriving both from the same ordered sequence is what
 * makes «۱۰ از ۱۶» mean the tenth permission and not the tenth insertion.
 */
export function effectivePermissions(
  role: Role,
  overrides: PermissionOverrides,
): readonly Permission[] {
  const permissions = effectiveSet(role, overrides)
  return PERMISSIONS.filter((permission) => permissions.has(permission))
}

/* ── §3.1 The enforcement primitives ──────────────────────────────────────── */

/**
 * Whether the caller holds a permission.
 *
 * Takes the **server-resolved** context. `02-architecture.md` §11: "Tenant context
 * is resolved, never received. A forged `clinicId` in a request body changes
 * nothing, because nothing reads it." Nothing here reads anything else either — the
 * answer is a function of `ctx.role` and `ctx.overrides` alone, and `escalation.test.ts`
 * asserts that by varying every other field and checking no answer moves.
 */
export function can(ctx: TenantContext, permission: Permission): boolean {
  return effectiveSet(ctx.role, ctx.overrides).has(permission)
}

/**
 * The same question, as a guard: returns `undefined` or throws.
 *
 * A `@throws PermissionError` and not a `NotFoundError`. `09-security.md` §6.3 makes
 * a resource outside the caller's scope a 404 — "returning 'forbidden' would confirm
 * the record's existence" — but that is the rule for a **record** the caller named.
 * A missing capability is not a secret: the caller already knows the page exists,
 * which is how they reached the code that refused them, and telling them a page
 * vanished would send them looking for a bug instead of asking their manager. The
 * 404 rule is applied where §3.4 says it applies — a doctor opening another doctor's
 * patient — and that check lives in the module that owns the customer query.
 */
export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (can(ctx, permission)) return

  throw new PermissionError(`The ${permission} permission is required`, {
    messageKey: 'permission.denied',
    detail: {
      permission,
      role: ctx.role,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    },
  })
}

/* ── §2.3 The tenant invariant ────────────────────────────────────────────── */

/**
 * The two permissions §2.3 names as the ones a tenant cannot be left without.
 *
 * Both, not either: `manage_users` alone leaves a manager who can appoint staff but
 * not configure the clinic, and `manage_clinic_settings` alone leaves one who can
 * configure the clinic but not appoint a replacement. §2.3's own sentence is "would
 * lose `manage_users` or `manage_clinic_settings`" — the refusal is on losing either.
 */
const RECOVERY_PERMISSIONS = [Permission.ManageUsers, Permission.ManageClinicSettings] as const

/**
 * Whether a tenant still has someone who can administer it.
 *
 * Stated over **effective** permissions rather than over the role, which is the
 * faithful reading of §2.3 and the more durable one. Today the two are the same
 * question — a manager's column is locked and their default is all sixteen, so "is a
 * manager" and "holds both" cannot disagree. If the lock ever changed, "holds both"
 * would still be the property that matters, and this would still be correct.
 *
 * `active` is required: §2.3 says "last active `MANAGER`", and a deactivated
 * membership is not cover for a tenant with nobody running it.
 *
 * @param memberships Every membership of one tenant, **after** the proposed change.
 */
export function tenantHasRecoveryManager(
  memberships: readonly MembershipSnapshot[],
): boolean {
  return memberships.some((membership) => {
    if (!membership.active) return false
    const effective = effectivePermissions(membership.role, membership.overrides)
    return RECOVERY_PERMISSIONS.every((permission) => effective.includes(permission))
  })
}

/**
 * §2.3's third enforcement point: the check that runs **inside the transaction**.
 *
 * §2.3's words: "A database-level invariant check inside the same transaction
 * refuses to commit a tenant whose last active `MANAGER` would lose `manage_users` or
 * `manage_clinic_settings`." The specification calls it database-level and it is
 * implemented as an application-layer assertion over the rows the transaction is
 * about to commit: it must run in the same transaction, over rows the same
 * transaction can see, or it is a check that races the write it is checking. A
 * database trigger could express it on PostgreSQL and not on SQLite, and the schema
 * is portable (`03-data-model.md` §5) — so the transaction is the place, and the
 * portability constraint is what put it there.
 *
 * The last sentence of §2.3 is the reason this refuses rather than repairs: "A
 * tenant with zero managers is unrecoverable without operator intervention, so it is
 * prevented rather than repaired."
 *
 * @throws DomainError — a rule about the tenant's staff, not about the caller's
 * capability. See `assertOverridesAllowed` for the same distinction.
 */
export function assertTenantKeepsRecoveryManager(
  memberships: readonly MembershipSnapshot[],
): void {
  if (tenantHasRecoveryManager(memberships)) return

  throw new DomainError('A tenant must keep a manager who can administer it', {
    messageKey: 'permission.lastManager',
  })
}
