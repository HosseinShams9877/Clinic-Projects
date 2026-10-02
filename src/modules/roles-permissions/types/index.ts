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

import type { Role } from '@/core/constants'
import type { PermissionOverrides } from '@/core/tenant'

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
