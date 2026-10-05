/**
 * The staff page's seven writers, as the manager panel renders them.
 *
 * The page is a read and seven writes — a person is invited, a membership's
 * permissions change, its role changes, it is activated or deactivated, and a leave
 * request is approved or rejected — and the seven are one server-action file because
 * they are the two tables' own affordances. A failure the module raised lands on the
 * row or the form that raised it, as `moduleFailureMessage`'s Persian sentence.
 *
 * ## Why a refused permission change is still audited (DoD 6)
 *
 * The module refuses a manager-column revocation before it writes, and the refusal
 * alone would leave no trace — the module audits after the write, and a refused write
 * wrote nothing. The attempt is a fact the clinic wants, so the action records it
 * itself, with the diff the manager tried, under the audit's own `refused` key. The
 * refusal and the record are two facts, and the first does not mean the second was not
 * tried.
 *
 * ## Why the permissions action takes the whole grid
 *
 * The modal is a checkbox grid over all sixteen and the caller holds the whole set, so
 * the action receives `granted` and `revoked` as the two complete lists and the module
 * reconciles them. A delta would force the modal to track what was checked before it
 * opened, which is a second source of truth for the same row.
 *
 * ## Why the leave approvals take a clock
 *
 * `approvedAt` is an instant the module does not read from the wall, because a test
 * that stamps it is a test that can assert it (`10-testing-strategy.md`'s clock rule);
 * the action passes `realClock().now()` and the module writes it, so the stamp is the
 * transaction's and not the module's guess.
 *
 * ## Why no action here deletes a membership
 *
 * A deactivated membership keeps its row and its overrides (`04-roles-permissions.md`),
 * because the audit trail still names the person and the appointments they recorded
 * still record them. The delete path does not exist, for the same reason `services`
 * has no `deleteService`.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import { realClock } from '@/core/lib/clock'
import { isAppError } from '@/core/types'
import { Permission, isMember } from '@/core/constants'
import {
  activateMembership,
  approveLeaveRequest,
  changeMembershipRole,
  deactivateMembership,
  inviteStaff,
  rejectLeaveRequest,
  updateMembershipPermissions,
  recordAudit,
  AuditAction,
  AuditEntity,
} from '@/modules/staff'
import type { AuditDetail } from '@/modules/staff'

import { moduleFailureMessage } from '@/app/_shared/module-failure'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

/** The staff page's own panel, which the manager column holds. */
const STAFF_PANEL: Panel = 'admin'

/** The answer every form reads: a done, or a sentence about why it was not done. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The invite form's fields, as the form holds them. */
export interface InviteInput {
  readonly mobile: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly role: string
}

/** The permission modal's checkbox grid, as the two lists the column stores. */
export interface PermissionsInput {
  readonly granted: readonly string[]
  readonly revoked: readonly string[]
}

/** One action's own scope: the transaction and the caller's own context. */
interface ScopeArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}

/** The sentinel a block returns when it has nothing but a success to report. */
const SUCCESS = { succeeded: true } as const

/* ── The seven writes ──────────────────────────────────────────────────────── */

/**
 * «دعوت کاربر» — the one create, which makes a person and their membership together.
 *
 * A mobile the list already holds comes back onto the form as the module's own
 * sentence, which points the manager at the existing row rather than at a refusal.
 */
export async function inviteStaffAction(input: InviteInput): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    inviteStaff({
      tx,
      ctx,
      mobile: input.mobile,
      firstName: input.firstName,
      lastName: input.lastName,
      password: input.password,
      role: input.role,
    }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/**
 * «ویرایش دسترسی‌ها» — the permission matrix's own write (DoD 5, DoD 6, DoD 7).
 *
 * This is the one action that does not use the shared wrapper, because a refused
 * manager-column change is audited here and a wrapper that caught the error would
 * catch it before the row could be written. The refusal is returned to the modal as
 * the lock's own sentence, and the attempt is on the trail.
 */
export async function updateMembershipPermissionsAction(
  membershipId: string,
  input: PermissionsInput,
): Promise<ActionResult> {
  const session = await resolveStaffPanel(STAFF_PANEL)
  const [granted, revoked] = asPermissions(input)

  const result = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    try {
      await updateMembershipPermissions({
        tx,
        ctx: session.permissions,
        membershipId,
        granted,
        revoked,
      })
      return SUCCESS
    } catch (error: unknown) {
      if (isManagerColumnRefusal(error)) {
        await recordAudit({
          tx,
          ctx: session.permissions,
          action: AuditAction.MembershipPermissionRefused,
          entity: AuditEntity.Membership,
          entityId: membershipId,
          detail: {
            membershipId,
            attempted: { granted, revoked },
            refused: true,
          } satisfies AuditDetail,
        })
      }
      return { ok: false, message: moduleFailureMessage(error) }
    }
  })

  if ('succeeded' in result) {
    revalidateStaff()
    return { ok: true }
  }
  return result
}

/**
 * «تغییر نقش» — the role column's own write, which clears the overrides with it.
 *
 * The modal's role control is one of three, and a fourth is refused by the module as a
 * role the matrix does not hold.
 */
export async function changeMembershipRoleAction(
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    changeMembershipRole({ tx, ctx, membershipId, role }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/**
 * «فعال کردن» — the membership's own switch, which the last active manager cannot use
 * on themselves.
 */
export async function activateMembershipAction(membershipId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    activateMembership({ tx, ctx, membershipId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/**
 * «غیرفعال کردن» — the row and its overrides stay, because the audit trail still names
 * the person and the appointments still record them.
 */
export async function deactivateMembershipAction(membershipId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    deactivateMembership({ tx, ctx, membershipId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/**
 * «تأیید مرخصی» — a manager closes the request and the module stamps the approver from
 * the context, never from the form.
 */
export async function approveLeaveRequestAction(leaveRequestId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    approveLeaveRequest({ tx, ctx, leaveRequestId, now: realClock() }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/**
 * «رد مرخصی» — the approver's other answer, stamped the same way.
 */
export async function rejectLeaveRequestAction(leaveRequestId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    rejectLeaveRequest({ tx, ctx, leaveRequestId, now: realClock() }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/* ── The scope every action runs in ────────────────────────────────────────── */

/**
 * One action's write, inside the tenant scope the shell resolved.
 *
 * The catch is the one place the file speaks Persian: a module's `AppError` carries an
 * English message and a catalog key, and the form reads the key's own sentence. A
 * throw that is not an `AppError` is the platform's, and the fallback sentence is the
 * catalog's apology for it.
 */
async function inTenantScope<T>(
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(STAFF_PANEL)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions }),
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const)
}

/** The staff page and the two surfaces a membership change reaches. */
function revalidateStaff(): void {
  revalidatePath('/admin/staff')
  revalidatePath('/reception/appointments')
}

/**
 * The two checkbox lists the modal sends, as the two closed arrays the module takes.
 *
 * A slug that is not one of the sixteen is dropped here and not stored, which is the
 * same direction the module drops one in: a permission that no longer exists is
 * nothing to grant.
 */
function asPermissions(input: PermissionsInput): [readonly string[], readonly string[]] {
  const granted = input.granted.filter((slug) => isMember(Permission, slug))
  const revoked = input.revoked.filter((slug) => isMember(Permission, slug))
  return [granted, revoked]
}

/**
 * Whether a refusal is the manager column's own lock (DoD 6).
 *
 * The key is the one `roles-permissions` raises from `assertOverridesAllowed`, read
 * here as a literal because the key is the rule's name and the two modules already
 * share the catalog.
 */
function isManagerColumnRefusal(error: unknown): boolean {
  return isAppError(error) && error.messageKey === 'permission.managerColumnLocked'
}
