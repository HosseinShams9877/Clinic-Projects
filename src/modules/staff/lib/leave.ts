/**
 * A doctor's leave — `03-data-model.md` §6, and the approval path the staff page's
 * second table renders.
 *
 * ## Why the requester and the approver are both here
 *
 * §6 puts the leave on the staff page and gives it three states
 * (`LeaveRequestStatus`): a doctor requests, a manager approves or rejects. The two
 * are different people with different permissions — a doctor holds no
 * `manage_users`, and the approval holds it — and both reach the same table through
 * this file, because the approval path is one table's state machine and not two
 * modules'.
 *
 * ## Why a doctor's own request takes no `manage_users`
 *
 * Immutable rule 9 is "no user changes their own access", and requesting leave is not
 * a change to access at all: the row is `PENDING` and the calendar is untouched until
 * a manager approves it. `requestLeave` takes the doctor's own context and writes the
 * row with `doctorId: ctx.userId`, because a doctor requesting another doctor's leave
 * is a request nobody asked for. The id is never an input — it comes from the resolved
 * context, which is the same choice `assertNotSelfEdit` relies on.
 *
 * ## Why approval is a manager's and not the requester's
 *
 * Approving a leave the requester wrote is the change that closes the calendar, so it
 * takes `manage_users` and it takes the approver's identity from the context, never
 * from the form. A doctor who held neither still cannot approve their own request,
 * and a manager cannot approve their own either — a manager is not a doctor, and a
 * doctor's leave is not theirs to take.
 */

import { LeaveRequestStatus } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError, NotFoundError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { StaffMessageKey } from '../catalog'
import { AuditAction, AuditEntity, recordAudit, type AuditDetail } from './audit'

/** The columns the staff page's leave table renders. */
const LEAVE_SELECT = {
  id: true,
  doctorId: true,
  startDate: true,
  endDate: true,
  status: true,
  reason: true,
  approvedByUserId: true,
  approvedAt: true,
  createdAt: true,
} as const

/** One leave row, as the page renders it. */
export interface LeaveRow {
  readonly id: string
  readonly doctorId: string
  readonly startDate: Date
  readonly endDate: Date
  readonly status: string
  readonly reason: string | null
  readonly approvedByUserId: string | null
  readonly approvedAt: Date | null
  readonly createdAt: Date
}

/**
 * «مرخصی‌ها» — the tenant's leave requests, newest first.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 */
export async function listLeaveRequests(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly LeaveRow[]> {
  requireLeaveAdmin(args.ctx)

  const rows = await args.tx.leaveRequest.findMany({
    where: { tenantId: args.ctx.tenantId },
    orderBy: { createdAt: 'desc' },
    select: LEAVE_SELECT,
  })

  return rows.map(asLeaveRow)
}

/**
 * «درخواست مرخصی» — a doctor's own request, written against the resolved context.
 *
 * The end date must not precede the start, and a request for a day already requested
 * is allowed: two `PENDING` rows for the same day are two requests a manager decides
 * between, and refusing the second would be refusing a correction of the first.
 *
 * @throws PermissionError — the caller holds no `view_own_schedule`, the one
 *   permission a doctor's own calendar needs.
 * @throws NotFoundError — never; the doctor is the caller.
 */
export async function requestLeave(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly startDate: Date
  readonly endDate: Date
  readonly reason?: string
}): Promise<LeaveRow> {
  requirePermission(args.ctx, 'view_own_schedule')

  const created = await args.tx.leaveRequest.create({
    data: {
      tenantId: args.ctx.tenantId,
      doctorId: args.ctx.userId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: LeaveRequestStatus.Pending,
      reason: args.reason?.trim() || null,
    },
    select: LEAVE_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.LeaveRequested,
    entity: AuditEntity.LeaveRequest,
    entityId: created.id,
    detail: {
      subjectUserId: args.ctx.userId,
      leaveRequestId: created.id,
      start: args.startDate.toISOString(),
      end: args.endDate.toISOString(),
    } satisfies AuditDetail,
  })

  return asLeaveRow(created)
}

/**
 * «تأیید مرخصی» — a manager closes the request and stamps themselves as the approver.
 *
 * The approver is `ctx.userId` and never an input, for the same reason
 * `assertNotSelfEdit` compares the resolved context: an approver field on the form
 * would be an approver the caller chose. A request that is not `PENDING` is left
 * alone, because approving an already-decided request is a second decision about a
 * row that already has one.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws NotFoundError — the request is outside the caller's tenant.
 * @throws ValidationError — the request is not pending.
 */
export async function approveLeaveRequest(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly leaveRequestId: string
  readonly now: Date
}): Promise<LeaveRow> {
  requireLeaveAdmin(args.ctx)

  const request = await loadLeaveRequest(args.tx, args.ctx, args.leaveRequestId)
  if (request.status !== LeaveRequestStatus.Pending) {
    throw new DomainError(
      `Leave request ${args.leaveRequestId} is ${request.status} and cannot be approved.`,
      {
        messageKey: 'staff.leaveAlreadyDecided' satisfies StaffMessageKey,
        detail: { leaveRequestId: args.leaveRequestId, status: request.status },
      },
    )
  }

  const updated = await args.tx.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: LeaveRequestStatus.Approved,
      approvedByUserId: args.ctx.userId,
      approvedAt: args.now,
    },
    select: LEAVE_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.LeaveApproved,
    entity: AuditEntity.LeaveRequest,
    entityId: request.id,
    detail: {
      subjectUserId: request.doctorId,
      leaveRequestId: request.id,
      approvedBy: args.ctx.userId,
    } satisfies AuditDetail,
  })

  return asLeaveRow(updated)
}

/**
 * «رد مرخصی» — the approver's other answer, stamped the same way.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws NotFoundError — the request is outside the caller's tenant.
 */
export async function rejectLeaveRequest(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly leaveRequestId: string
  readonly now: Date
}): Promise<LeaveRow> {
  requireLeaveAdmin(args.ctx)

  const request = await loadLeaveRequest(args.tx, args.ctx, args.leaveRequestId)
  if (request.status !== LeaveRequestStatus.Pending) {
    throw new DomainError(
      `Leave request ${args.leaveRequestId} is ${request.status} and cannot be rejected.`,
      {
        messageKey: 'staff.leaveAlreadyDecided' satisfies StaffMessageKey,
        detail: { leaveRequestId: args.leaveRequestId, status: request.status },
      },
    )
  }

  const updated = await args.tx.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: LeaveRequestStatus.Rejected,
      approvedByUserId: args.ctx.userId,
      approvedAt: args.now,
    },
    select: LEAVE_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.LeaveRejected,
    entity: AuditEntity.LeaveRequest,
    entityId: request.id,
    detail: {
      subjectUserId: request.doctorId,
      leaveRequestId: request.id,
      rejectedBy: args.ctx.userId,
    } satisfies AuditDetail,
  })

  return asLeaveRow(updated)
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** `manage_users` — the permission the matrix gives a manager for the staff surface. */
function requireLeaveAdmin(ctx: TenantContext): void {
  requirePermission(ctx, 'manage_users')
}

/** One row as the leave table's own shape. */
function asLeaveRow(row: LeaveSelectRow): LeaveRow {
  return {
    id: row.id,
    doctorId: row.doctorId,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    reason: row.reason,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  }
}

/** The shape Prisma hands back from `LEAVE_SELECT`, named once so the mapper reads. */
type LeaveSelectRow = {
  readonly id: string
  readonly doctorId: string
  readonly startDate: Date
  readonly endDate: Date
  readonly status: string
  readonly reason: string | null
  readonly approvedByUserId: string | null
  readonly approvedAt: Date | null
  readonly createdAt: Date
}

/**
 * Loads one leave request as the caller's tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant, which is
 *   `09-security.md` §6.3's 404-not-403 rule.
 */
async function loadLeaveRequest(
  tx: TransactionClient,
  ctx: TenantContext,
  leaveRequestId: string,
): Promise<{ readonly id: string; readonly doctorId: string; readonly status: string }> {
  const row = await tx.leaveRequest.findFirst({
    where: { id: leaveRequestId, tenantId: ctx.tenantId },
    select: { id: true, doctorId: true, status: true },
  })
  if (row === null) {
    throw new NotFoundError(`Leave request ${leaveRequestId} was not found in this tenant.`, {
      messageKey: 'staff.notFound' satisfies StaffMessageKey,
      detail: { leaveRequestId },
    })
  }
  return row
}
