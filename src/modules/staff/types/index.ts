/**
 * The `staff` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel for the reason §15.5
 * states — it has to be "explicit … so an override cannot accidentally satisfy it by
 * exporting something adjacent".
 *
 * ## What the contract covers
 *
 * The module's **values** — the staff list, the three membership writes, the audit
 * writer and the three leave writes. The types this module exports (`StaffRow`,
 * `LeaveRow`, `AuditRow`, `PermissionDiff`) travel with `types/` and are re-exported
 * by an override's own barrel; they are not members of a value interface.
 *
 * ## What the contract deliberately omits
 *
 * A user delete and a membership delete. A deactivated membership keeps its row and
 * its overrides (`04-roles-permissions.md`), because the audit trail still names the
 * person and the appointments they recorded still record them. The delete path does
 * not exist, for the same reason `services` has no `deleteService`.
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope (`02-architecture.md` §11).
 */

import type { TenantContext, TransactionClient } from '@/core/db/scope'
import type { PermissionOverrides } from '@/core/tenant'

import type { StaffMessageKey } from '../catalog'
import type { StaffRow } from '../lib/memberships'
import type { LeaveRow } from '../lib/leave'
import type {
  AuditAction,
  AuditDetail,
  AuditDiff,
  AuditEntity,
  AuditRow,
  PermissionDiff,
} from '../lib/audit'

/** Re-exported so an override's barrel names the shapes from one place. */
export type {
  AuditAction,
  AuditDetail,
  AuditDiff,
  AuditEntity,
  AuditRow,
  LeaveRow,
  PermissionDiff,
  StaffMessageKey,
  StaffRow,
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers: an interface **wider** than the barrel fails to compile against the
 * fixture, an interface narrower than the barrel does not. See the note in
 * `roles-permissions/types/index.ts` for the same asymmetry.
 */
export interface StaffModule {
  /* ── The staff list */
  /** «فهرست کارکنان» — the tenant's memberships, managers first. */
  readonly listStaff: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<readonly StaffRow[]>

  /**
   * «دعوت کاربر» — makes a person and their membership together.
   * @throws DomainError, as `staff.mobileTaken` — the mobile is already on the list.
   */
  readonly inviteStaff: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly mobile: string
    readonly firstName: string
    readonly lastName: string
    readonly password: string
    readonly role: string
    readonly clinicId?: string
  }) => Promise<StaffRow>

  /* ── The membership writes (DoDs 5, 6, 7) */
  /**
   * «ویرایش دسترسی‌ها» — the permission matrix's own write.
   * @throws PermissionError — the caller is the subject (immutable rule 9).
   * @throws DomainError, as `permission.managerColumnLocked` — the subject is a
   *   manager and the change would remove a permission (DoD 6).
   * @throws DomainError, as `permission.lastManager` — the tenant would keep no
   *   manager who can administer it.
   */
  readonly updateMembershipPermissions: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly membershipId: string
    readonly granted: readonly string[]
    readonly revoked: readonly string[]
  }) => Promise<StaffRow>

  /** «تغییر نقش» — clears the overrides, because they adjusted a set the role no longer holds. */
  readonly changeMembershipRole: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly membershipId: string
    readonly role: string
  }) => Promise<StaffRow>

  /** «فعال کردن». */
  readonly activateMembership: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly membershipId: string
  }) => Promise<StaffRow>

  /**
   * «غیرفعال کردن» — the row and its overrides stay.
   * @throws DomainError, as `staff.lastManager` — the tenant would keep no manager.
   */
  readonly deactivateMembership: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly membershipId: string
  }) => Promise<StaffRow>

  /* ── The audit trail (DoD 7) */
  /** The one writer of an `AuditLog` row, inside the caller's transaction. */
  readonly recordAudit: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly action: AuditAction
    readonly entity: AuditEntity
    readonly entityId: string
    readonly detail?: AuditDetail
    readonly ip?: string
  }) => Promise<void>

  /** The audit rows a page reads, newest first. */
  readonly recentAudit: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly take?: number
  }) => Promise<readonly AuditRow[]>

  /* ── Leave (§6) */
  /** «مرخصی‌ها» — the tenant's leave requests. */
  readonly listLeaveRequests: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<readonly LeaveRow[]>

  /** «درخواست مرخصی» — a doctor's own request, written against the resolved context. */
  readonly requestLeave: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly startDate: Date
    readonly endDate: Date
    readonly reason?: string
  }) => Promise<LeaveRow>

  /** «تأیید مرخصی» — stamps the approver from the context and never the form. */
  readonly approveLeaveRequest: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly leaveRequestId: string
    readonly now: Date
  }) => Promise<LeaveRow>

  /** «رد مرخصی» — the approver's other answer. */
  readonly rejectLeaveRequest: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly leaveRequestId: string
    readonly now: Date
  }) => Promise<LeaveRow>

  /* ── The catalog */
  /** The Persian sentence for each key this module raises. */
  readonly MESSAGES: Readonly<Record<StaffMessageKey, string>>

  /** The three leave states, keyed by the stored value. */
  readonly LEAVE_STATUS_LABELS: Readonly<Record<'PENDING' | 'APPROVED' | 'REJECTED', string>>
}

/**
 * The membership's own shape as a page renders it, for callers that build one from a
 * row they already hold rather than through the list.
 */
export interface MembershipView {
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly isActive: boolean
  readonly overrides: PermissionOverrides
}
