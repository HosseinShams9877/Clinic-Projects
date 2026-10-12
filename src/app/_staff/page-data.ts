/**
 * The reads the staff page's three tables share, in one place.
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
import {
  readDoctorWorkingHours,
  readDoctorShiftRanges,
  type DoctorHoursRow,
  type DoctorShiftRangeRow,
} from '@/modules/appointments'
import { effectivePermissions } from '@/modules/roles-permissions'
import { Permission, PERMISSIONS, Role, isMember } from '@/core/constants'

/** The page's own three tables, and the names they render. */
export interface StaffPageData {
  readonly staff: readonly StaffRow[]
  /** Each doctor membership's weekly working hours, keyed by the doctor's user id. */
  readonly doctorHours: Readonly<Record<string, readonly DoctorHoursRow[]>>
  /** Each doctor membership's custom shift ranges, keyed by the doctor's user id. */
  readonly doctorShiftRanges: Readonly<Record<string, readonly DoctorShiftRangeRow[]>>
  readonly audit: readonly (AuditRow & {
    readonly actorName: string | null
  })[]
  readonly leaveRequests: readonly (LeaveRow & {
    readonly doctorName: string | null
    readonly approverName: string | null
  })[]
}

/**
 * The staff page's own three reads, as one transaction.
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

  const doctorRows = staff.filter((row) => isMember(Role, row.role) && row.role === Role.Doctor)
  const [hoursPairs, rangePairs] = await Promise.all([
    Promise.all(
      doctorRows.map(async (row) => [
        row.userId,
        await readDoctorWorkingHours({ tx: args.tx, ctx: args.ctx, doctorId: row.userId }),
      ] as const),
    ),
    Promise.all(
      doctorRows.map(async (row) => [
        row.userId,
        await readDoctorShiftRanges({ tx: args.tx, ctx: args.ctx, doctorId: row.userId }),
      ] as const),
    ),
  ])
  const doctorHours: Record<string, readonly DoctorHoursRow[]> = {}
  for (const [doctorId, rows] of hoursPairs) doctorHours[doctorId] = rows
  const doctorShiftRanges: Record<string, readonly DoctorShiftRangeRow[]> = {}
  for (const [doctorId, rows] of rangePairs) doctorShiftRanges[doctorId] = rows

  const names = await loadUserNames(args.tx, args.ctx.tenantId, [
    ...audit.map((row) => row.actorUserId),
    ...leaveRequests.map((row) => [row.doctorId, row.approvedByUserId]),
  ].flat())

  return {
    staff,
    doctorHours,
    doctorShiftRanges,
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
 * renders them.
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