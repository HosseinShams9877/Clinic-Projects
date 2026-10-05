/**
 * The audit writer — immutable rule 12 and DoD 7.
 *
 * `09-security.md` requires every permission change to leave an audit row, and the
 * `AuditLog` table (`03-data-model.md` §8) was built for it. Nothing in `src/` wrote
 * to it before this file: the model existed, the writer did not, and a table with no
 * writer is a rule the specification states and the product does not keep.
 *
 * ## Why the writer is in `staff` and not in `core`
 *
 * The two things a clinic most needs an audit of are both here — who changed a
 * membership, and who approved a leave — and `02-architecture.md` §10 rule 2 says the
 * module that owns the write owns the record of the write. A writer in `core` would be
 * a function every module reached for, and each of them would have decided for itself
 * what `action` and `entity` mean; the names below are the module's own vocabulary,
 * and keeping them here keeps them closed.
 *
 * Other modules reach it through this barrel. `customers` and `services` do not need
 * it in Phase 3 — their writes are a person's record and a catalogue, and the pages
 * that render them are the record.
 *
 * ## What the row holds, and what it deliberately does not
 *
 * `actorUserId`, `action`, `entity`, `entityId`, `detail`, `ip`, `at` — the seven
 * columns the model carries. `detail` is JSON, and `03-data-model.md` §5 puts it there
 * as a `String` holding JSON on both engines. The before/after sets (DoD 7) ride in
 * `detail`, because the two arrays are the whole point of the row and a generic
 * `description` column would have flattened them into prose a script cannot diff.
 *
 * No Persian text is written to the row. `action` and `entity` are ASCII keys, so an
 * operator's report reads the same in any locale and the catalog is the only place a
 * sentence lives.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

/** The actions the staff module audits, as the audit row's `action` stores them. */
export const AuditAction = {
  StaffInvited: 'staff.invited',
  MembershipPermissionChanged: 'membership.permission_changed',
  /**
   * A permission change the manager column refused (DoD 6).
   *
   * The refusal is not the change, and the row records the attempt rather than the
   * outcome: a clinic that needs to know who tried to remove a manager's permission
   * needs the attempt, and a row written only on success would show a trail with a
   * gap exactly where the interesting thing happened.
   */
  MembershipPermissionRefused: 'membership.permission_refused',
  MembershipRoleChanged: 'membership.role_changed',
  MembershipActivated: 'membership.activated',
  MembershipDeactivated: 'membership.deactivated',
  LeaveRequested: 'leave.requested',
  LeaveApproved: 'leave.approved',
  LeaveRejected: 'leave.rejected',
} as const
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

/** The entities the staff module audits, as the audit row's `entity` stores them. */
export const AuditEntity = {
  Membership: 'membership',
  LeaveRequest: 'leave_request',
} as const
export type AuditEntity = (typeof AuditEntity)[keyof typeof AuditEntity]

/** The before/after pair DoD 7 requires, for any two values the change moved between. */
export interface AuditDiff<T> {
  readonly before: T
  readonly after: T
}

/** A permission change's before/after, in the shape the matrix speaks. */
export interface PermissionDiff {
  readonly role: string
  readonly granted: AuditDiff<readonly string[]>
  readonly revoked: AuditDiff<readonly string[]>
}

/**
 * The audit row's own `detail`, so a reader of `audit_logs` knows the shape without
 * reading the writer.
 */
export interface AuditDetail {
  /** The membership the change was about, when the entity is a membership. */
  readonly membershipId?: string
  /** The person the change was about, for the report that groups by subject. */
  readonly subjectUserId?: string
  /** The permission change's before/after (DoD 7). */
  readonly permissions?: PermissionDiff
  /** Any other fact the change moved between, named by the caller. */
  readonly [key: string]: unknown
}

/**
 * «ثبت رویداد» — the one writer of an `AuditLog` row.
 *
 * Writes inside the caller's transaction, which is what makes the row part of the
 * change rather than a note about it: a change that rolls back leaves no audit row, so
 * an audit trail cannot show a permission change the database does not have. `at` is
 * the column's own `@default(now())`, so the row's clock is the transaction's.
 *
 * The row is never updated and never deleted. `03-data-model.md` §8's index
 * (`audit_tenant_at_idx`) exists to be read backwards, and a trail a writer could
 * rewrite is not a trail.
 *
 * @throws nothing the caller can correct. A failed audit write fails the change, which
 *   is the only safe direction: a silent audit failure would be a permission change
 *   the clinic has no record of.
 */
export async function recordAudit(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly action: AuditAction
  readonly entity: AuditEntity
  readonly entityId: string
  readonly detail?: AuditDetail
  /** The caller's IP, when the boundary has one; a worker does not. */
  readonly ip?: string
}): Promise<void> {
  await args.tx.auditLog.create({
    data: {
      tenantId: args.ctx.tenantId,
      actorUserId: args.ctx.userId,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId,
      detail: args.detail === undefined ? null : JSON.stringify(args.detail),
      ip: args.ip ?? null,
    },
  })
}

/**
 * The audit rows a page reads, newest first.
 *
 * Takes no permission because the only page that renders it already holds
 * `manage_users`; the rows are the tenant's own and the `where` keeps them there.
 */
export async function recentAudit(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  /** The most a page reads in one go; an audit trail is a list and not a page. */
  readonly take?: number
}): Promise<readonly AuditRow[]> {
  const rows = await args.tx.auditLog.findMany({
    where: { tenantId: args.ctx.tenantId },
    orderBy: { at: 'desc' },
    take: args.take ?? 50,
    select: {
      id: true,
      actorUserId: true,
      action: true,
      entity: true,
      entityId: true,
      detail: true,
      ip: true,
      at: true,
    },
  })

  return rows.map((row) => ({
    ...row,
    detail: row.detail === null ? null : tryParse(row.detail),
  }))
}

/** One audit row, as the page renders it — `detail` parsed back to an object. */
export interface AuditRow {
  readonly id: string
  readonly actorUserId: string | null
  readonly action: string
  readonly entity: string
  readonly entityId: string | null
  readonly detail: unknown
  readonly ip: string | null
  readonly at: Date
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/**
 * The detail column back to an object, or `null` when it is not JSON.
 *
 * The row is written by this module and read by this module, so a row that does not
 * parse is a row from a release with a different shape — and the page's job is to
 * render the row it can see, not to refuse the page.
 */
function tryParse(detail: string): unknown {
  try {
    return JSON.parse(detail)
  } catch {
    return null
  }
}
