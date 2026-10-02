/**
 * The self-edit guard — immutable rule 9, and escalation path three of four.
 *
 * The rule is stated twice in the specification and both statements are absolute:
 *
 * > «هیچ کاربری نمی‌تواند دسترسی خودش را بالا ببرد.»
 * >
 * > *No user can raise their own access.*
 *
 * and, as immutable rule 9, "**No user changes their own access.**"
 *
 * `04-roles-permissions.md` §3.3 lists the attack this closes — "Grant oneself a
 * permission via the permissions form" — and names two closures: "The write path
 * requires `manage_users` and validates that the actor is not the subject; a user
 * cannot edit their own membership."
 *
 * ## Why both halves are needed
 *
 * `requirePermission(ctx, Permission.ManageUsers)` is necessary and not sufficient.
 * It stops a secretary from reaching the form at all, but a manager **holds**
 * `manage_users`, so the permission check alone would let a manager grant
 * themselves anything — and a manager already has everything, so the interesting
 * case is not the grant. It is the manager who is also the only person who can undo
 * a change they made: they could remove a colleague's recovery permissions today and
 * restore their own tomorrow, and no permission check would notice, because at every
 * step they were authorised for the step they took.
 *
 * So the guard is on the **identity comparison**, not on the capability, and it is
 * a `PermissionError` for that reason: the request is refused because of who is
 * asking, which is what a permission error is, and 403 is the honest status.
 *
 * ## There is no "except when"
 *
 * No exemption for a manager, no exemption for a tenant's only staff member, no
 * flag. §2.3's own reasoning is why: a rule with an exception is a rule whose
 * exception is the thing an attacker reaches for. A tenant whose only manager must
 * change their own permissions is a tenant that needs an operator, and that is the
 * same conclusion §2.3 reaches about a tenant with no manager at all — "prevented
 * rather than repaired".
 */

import type { TenantContext } from '@/core/tenant'
import { PermissionError } from '@/core/types'
import type { UserId } from '@/core/types'

/**
 * Refuses a membership write whose subject is the caller.
 *
 * @param ctx The **server-resolved** context. `ctx.userId` comes from the signed
 * session cookie and never from the request, which is the whole reason this
 * comparison means anything: if the subject were read from a form field, a caller
 * could simply write someone else's id into it and the guard would pass.
 * @param subjectUserId The membership being edited, as resolved from the payload the
 * caller sent.
 * @throws PermissionError when the two are the same person.
 */
export function assertNotSelfEdit(ctx: TenantContext, subjectUserId: UserId): void {
  if (ctx.userId !== subjectUserId) return

  throw new PermissionError('A caller cannot change their own membership', {
    messageKey: 'permission.selfEdit',
    // The user id is here and the email or name is not: `05-conventions.md` §11
    // forbids PII in a log line, and an id is what the audit trail joins on.
    detail: { userId: ctx.userId, tenantId: ctx.tenantId },
  })
}
