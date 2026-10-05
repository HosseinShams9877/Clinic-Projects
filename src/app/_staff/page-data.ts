/**
 * The reads the staff page's three tables share, in one place.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and the staff page composes
 * three of the module's reads into one surface: the staff list, the audit trail, and
 * the leave table. The three are one transaction's worth of queries so the three
 * tables a manager is looking at cannot be three different moments in time — a
 * permission change the audit row names is a change the list already shows.
 *
 * ## Why the names are read once for the whole page
 *
 * The audit row carries an `actorUserId` and the leave row carries a `doctorId` and an
 * `approvedByUserId`, and all three are `User` ids the page renders as a name. One
 * read for the union of them, because a page of twenty audit rows read as twenty
 * per-row queries is twenty trips where one does. The join is the app tier's because it
 * composes `staff`'s rows with `auth`'s people, and a module may not reach into
 * another's tables (`02-architecture.md` §10 rule 2).
 *
 * ## Why the permission counts are here and not in the module
 *
 * `effectivePermissions` is the module's own formula and the modal renders the count it
 * yields («۵ از ۱۶»). The count is derived here from the row the page already holds,
 * which keeps the module's surface to the formula itself and stops a second
 * implementation of it appearing in a page.
 *
 * ## What is deliberately not here
 *
 * A write. Nothing here writes, because a page is a read and a write is an action
 * (`actions.ts`).
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

import {
  listStaff,
  recentAudit,
  listLeaveRequests,
  type AuditRow,
  type LeaveRow,
  type StaffRow,
} from '@/modules/staff'
import { effectivePermissions } from '@/modules/roles-permissions'
import { Permission, PERMISSIONS, Role, isMember } from '@/core/constants'

/** The page's own three tables, and the names they render. */
export interface StaffPageData {
  readonly staff: readonly StaffRow[]
  readonly audit: readonly (AuditRow & {
    /** The actor's name, or `null` for a row a worker wrote. */
    readonly actorName: string | null
  })[]
  readonly leaveRequests: readonly (LeaveRow & {
    /** The doctor's name, as the table's own first column renders it. */
    readonly doctorName: string | null
    /** The approver's name, or `null` while the request is pending. */
    readonly approverName: string | null
  })[]
}

/**
 * The staff page's own three reads, as one transaction.
 *
 * @throws PermissionError — the caller holds no `manage_users`, which is the panel's
 *   own gate and not this read's.
 */
export async function loadStaffPage(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<StaffPageData> {
  const [staff, audit, leaveRequests] = await Promise.all([
    listStaff({ tx: args.tx, ctx: args.ctx }),
    recentAudit({ tx: args.tx, ctx: args.ctx, take: AUDIT_TAKE }),
    listLeaveRequests({ tx: args.tx, ctx: args.ctx }),
  ])

  const names = await loadUserNames(args.tx, args.ctx.tenantId, [
    ...audit.map((row) => row.actorUserId),
    ...leaveRequests.map((row) => [row.doctorId, row.approvedByUserId]),
  ].flat())

  return {
    staff,
    audit: audit.map((row) => ({ ...row, actorName: nameOf(names, row.actorUserId) })),
    leaveRequests: leaveRequests.map((row) => ({
      ...row,
      doctorName: nameOf(names, row.doctorId),
      approverName: nameOf(names, row.approvedByUserId),
    })),
  }
}

/** The most audit rows the page renders — a trail is a list and not a page. */
const AUDIT_TAKE = 20

/**
 * One membership's effective permissions, as the permission modal's checkbox grid
 * renders them: the permission, whether the row holds it, and whether the manager
 * column's lock takes the checkbox away.
 *
 * The manager column is rendered without checkboxes (`04-roles-permissions.md` §2.3),
 * which the page reads as `locked` and not as "all sixteen checked", because a locked
 * column is not a column that happens to be fully checked.
 */
export function permissionGrid(row: StaffRow): readonly {
  readonly permission: Permission
  readonly held: boolean
  readonly locked: boolean
}[] {
  const locked = isManager(row.role)
  const held = new Set(effectivePermissions(row.role as Role, row.overrides))
  return PERMISSIONS.map((permission) => ({
    permission,
    held: held.has(permission),
    locked,
  }))
}

/** The count the modal's header renders, as the module's own formula yields it. */
export function permissionCount(row: StaffRow): number {
  return effectivePermissions(row.role as Role, row.overrides).length
}

/** Whether the row is the manager column, whose permissions no surface edits. */
function isManager(role: string): boolean {
  return isMember(Role, role) && role === Role.Manager
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** The tenant's names for the ids the two tables carry, in one read. */
async function loadUserNames(
  tx: TransactionClient,
  tenantId: string,
  ids: readonly (string | null)[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unique.length === 0) return {}
  const rows = await tx.user.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true, firstName: true, lastName: true },
  })
  const names: Record<string, string> = {}
  for (const row of rows) {
    names[row.id] = [row.firstName, row.lastName].filter(Boolean).join(' ')
  }
  return names
}

/** One id's name, or `null` for an id the tenant no longer holds. */
function nameOf(names: Record<string, string>, id: string | null): string | null {
  if (id === null) return null
  return names[id] ?? null
}
