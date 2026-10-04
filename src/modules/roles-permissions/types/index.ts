/**
 * The shapes `roles-permissions` uses, and nothing else.
 *
 * `TenantContext` and `PermissionOverrides` are **not** redeclared here. They live
 * in `@/core/tenant` because all twenty modules of `02-architecture.md` §7 need
 * them and a module may not import another module's private types — so this file
 * holds only what is this module's own vocabulary.
 *
 * The one type below is deliberately not a `Membership` row. A row carries an id, a
 * tenant, a clinic list, a join date and a status; none of that changes the answer
 * to "may this person do this", and a type that carried it would make every caller
 * construct a database row to ask a question about authority. This is the row
 * **narrowed to the three fields the rule reads**.
 */

import type { Permission, Role } from '@/core/constants'
import type { PermissionOverrides, TenantContext } from '@/core/tenant'
import type { UserId } from '@/core/types'

import type { RolesPermissionsMessageKey } from '../catalog'
import { Toggle } from '../lib/toggles'

/**
 * One membership, as the permission rules see it.
 *
 * `active` is on it because `04-roles-permissions.md` §2.3's tenant invariant is
 * stated over **active** managers — "refuses to commit a tenant whose last active
 * MANAGER would lose `manage_users` or `manage_clinic_settings`". A deactivated
 * membership keeps its row and its overrides, and a rule that ignored the status
 * would count a disabled manager as cover for a tenant that has none.
 */
export interface MembershipSnapshot {
  /** The membership's role. One of exactly three (`04-roles-permissions.md` §1). */
  readonly role: Role

  /** The membership's per-user overrides on top of the role default. */
  readonly overrides: PermissionOverrides

  /** Whether the membership is active. A deactivated manager does not count. */
  readonly active: boolean
}

/* ── §15.5 The override contract ────────────────────────────────────────────── */

/**
 * This module's public surface, as a contract an override must reproduce —
 * `05-conventions.md` §15.5.
 *
 * The barrel at `src/modules/roles-permissions/index.ts` **is** the surface; this
 * interface is the *name* of it, and the name is what the override mechanism needs.
 * `02-architecture.md` §13.3 types every registered override as its module's
 * interface, so an override whose `index.ts` drops a function or widens a parameter
 * is a **compile error** rather than a clinic being served a module whose answers
 * come from a shape the caller did not agree to. The interface is written by hand
 * against the barrel and not derived from it, for the reason §15.5 states: it has to
 * be "explicit — a named, exported interface, not an inferred shape, so an override
 * cannot accidentally satisfy it by exporting something adjacent".
 *
 * ## Why this module is the only one to have one
 *
 * `roles-permissions` is the sole module of §7's twenty with an implementation
 * today, so it is the sole module whose contract can be stated. The registry's
 * index of module surfaces (`src/modules/registry/types.ts`) lists exactly the
 * modules that have one here; a module gains an interface and an index entry in the
 * same change — the interface when the implementation is written, the index entry
 * when the first override of it becomes possible. Anything else would be nineteen
 * stub contracts, and a stub contract is a contract an override can satisfy by
 * exporting nothing.
 *
 * ## What the contract covers
 *
 * The module's **values** — its functions and constants — because those are what the
 * registry loads and what a caller calls. The two *types* this module exports
 * (`MembershipSnapshot`, `RolesPermissionsMessageKey`) travel with its `types/` and
 * are re-exported by an override's own barrel; they are not members of a value
 * interface, and conformance there is a barrel-to-barrel question rather than one
 * the registry can ask of a loaded object.
 *
 * ## Keeping the interface and the barrel in step
 *
 * The interface is a hand-written restatement of the barrel, and drift is the one
 * defect here the type checker cannot catch on its own. An interface **wider** than
 * the barrel is caught immediately: the fixture under
 * `src/modules/registry/tests/` re-exports this barrel and assigns it to
 * `RolesPermissionsModule`, which fails to compile the moment the interface names
 * something the barrel does not. An interface narrower than the barrel compiles and
 * would let an override omit a function the default has — so keeping the two in step
 * is a review obligation on a change to the barrel, called out here because no tool
 * below catches it.
 *
 * `Toggle` is imported as a value rather than as a type because the surface names the
 * constant itself (`Toggle: typeof Toggle`) alongside the type it derives; the other
 * imports here are types, and `import type` keeps the file free of runtime code.
 */
export interface RolesPermissionsModule {
  /* ── §3.1 The two enforcement primitives */
  /** Whether the caller holds a permission. Never takes a role or a permission list. */
  readonly can: (ctx: TenantContext, permission: Permission) => boolean

  /**
   * The same question, as a guard.
   * @throws PermissionError — never a `NotFoundError`; see `lib/matrix.ts`.
   */
  readonly requirePermission: (ctx: TenantContext, permission: Permission) => void

  /* ── §2.2 The effective set */
  /** A membership's effective permissions, in §2's documented order 1–16. */
  readonly effectivePermissions: (
    role: Role,
    overrides: PermissionOverrides,
  ) => readonly Permission[]

  /** §2.1's three columns, frozen. The starting point of every decision, not a ceiling. */
  readonly ROLE_DEFAULTS: Readonly<Record<Role, readonly Permission[]>>

  /* ── §2.3 The tenant invariant */
  /** Whether the tenant still has an active manager holding both recovery permissions. */
  readonly tenantHasRecoveryManager: (memberships: readonly MembershipSnapshot[]) => boolean

  /**
   * The same question, as an assertion inside the committing transaction.
   * @throws DomainError — a rule about the tenant's staff, not the caller's capability.
   */
  readonly assertTenantKeepsRecoveryManager: (memberships: readonly MembershipSnapshot[]) => void

  /* ── §2.3 The locked manager column */
  /** Whether the role's permission set is locked against revocation. */
  readonly isManagerColumnLocked: (role: Role) => boolean

  /**
   * Refuses an override set that would remove a permission from a manager.
   * @throws DomainError, and only for a `MANAGER` membership with a non-empty `revoked`.
   */
  readonly assertOverridesAllowed: (role: Role, overrides: PermissionOverrides) => void

  /* ── §3.3 The self-edit guard */
  /**
   * Refuses a membership write whose subject is the caller.
   * @throws PermissionError when the caller and the subject are the same person.
   */
  readonly assertNotSelfEdit: (ctx: TenantContext, subjectUserId: UserId) => void

  /* ── §4 The eight behavioural toggles */
  /** Whether a stored value is one of the eight. */
  readonly isToggle: (value: unknown) => value is Toggle

  /** The eight codes, keyed as the settings screen names them. */
  readonly Toggle: typeof Toggle

  /** The eight toggles in §4's documented order, 1–8. */
  readonly TOGGLES: readonly Toggle[]

  /** §4's «پیش‌فرض» column. Frozen, so a screen that reads it cannot write to it. */
  readonly TOGGLE_DEFAULTS: Readonly<Record<Toggle, boolean>>

  /* ── The catalog */
  /** The Persian sentence for each key this module raises. */
  readonly MESSAGES: Readonly<Record<RolesPermissionsMessageKey, string>>
}
