/**
 * The locked manager column — `04-roles-permissions.md` §2.3.
 *
 * The rule, in the specification's own words:
 *
 * > **«ستون مدیر قفل است — اگر مدیر بتواند دسترسی خودش را بردارد، کلینیک
 * > می‌تواند بدون هیچ مدیری بماند.»**
 * >
 * > *The manager column is locked. If a manager could remove their own access,
 * > the clinic could be left with no manager at all.*
 *
 * §2.3 says the guarantee is **structural**, and that it is enforced in three
 * places. This file is the second of the three — "the `roles-permissions` module
 * rejects any write that would remove a permission from a `MANAGER` membership" —
 * and the first half of the third, the tenant-level invariant, lives beside the
 * matrix it is stated over (`lib/matrix.ts`).
 *
 * ## Why the check is on `revoked` alone
 *
 * A grant on a `MANAGER` membership is **allowed**, and it is a no-op: the manager
 * default is all sixteen permissions, so there is nothing left to add. Refusing it
 * would be a rule the specification does not state, and it would make a stored row
 * that the read path ignores into a write the user is told off for making. A
 * revocation is refused because it is the only edit in this column that can take
 * something away.
 *
 * ## Why the read path checks it too
 *
 * `effectivePermissions` ignores a `MANAGER`'s revocations as well, which looks
 * redundant against this file until you consider where a stale row comes from: an
 * older release, a hand-edited database, a partially applied migration. Writing the
 * guard only on the way in means the guarantee holds for rows written by this
 * version and not for the row that was already there. Both halves are cheap, and the
 * read half can never widen access past the role default — which for a manager is
 * already every permission there is.
 */

import { Role } from '@/core/constants'
import type { PermissionOverrides } from '@/core/tenant'
import { DomainError } from '@/core/types'

/**
 * Whether a role's permission set is locked against revocation.
 *
 * A one-line predicate with a name, because the matrix and this file both need the
 * question answered and neither should be the one that decides it. §2.3 names
 * exactly one locked column, so this is `=== MANAGER` and not a set.
 */
export function isManagerColumnLocked(role: Role): boolean {
  return role === Role.Manager
}

/**
 * Refuses an override set that would remove a permission from a manager.
 *
 * Called by the write path **inside the transaction that would commit the change**,
 * which is what makes it a guard rather than a suggestion: the same transaction is
 * also the place §2.3's third check runs, so a change that passes this one and
 * fails that one commits nothing.
 *
 * @throws DomainError rather than `PermissionError`. The caller is not lacking a
 * permission — whoever reached this line holds `manage_users` — and the refusal is
 * not about who they are: another manager doing exactly the same thing gets exactly
 * the same answer. It is a rule about the shape of the tenant's staff, which is a
 * domain rule, and `09-security.md` §6.3's rule that a not-found is a 404 rather
 * than a 403 comes from the same instinct: the status should say what actually
 * happened.
 */
export function assertOverridesAllowed(role: Role, overrides: PermissionOverrides): void {
  if (!isManagerColumnLocked(role)) return
  if (overrides.revoked.length === 0) return

  throw new DomainError('A manager’s permissions cannot be revoked', {
    messageKey: 'permission.managerColumnLocked',
    detail: { role, revoked: overrides.revoked },
  })
}
