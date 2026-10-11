/**
 * The role-aware notification feed behind the topbar bell, built once per request.
 *
 * `PanelShell` is otherwise pure composition, but the bell is a shell-level element
 * every panel carries (see that file's header for the documented exception). This
 * module holds the one place the bell's rows are read, and it reads a *different* set
 * per panel because the specification splits notifications by role:
 *
 * - **قاعده دوم** — anything that needs follow-up is the منشی cartable, not a manager
 *   or doctor dashboard. So the reception bell holds the full cartable set, while the
 *   manager bell holds only what is the manager's to decide and the doctor bell only
 *   what is the doctor's own.
 * - Every row is a real read. A kind with a zero count is dropped, so an empty panel
 *   shows no badge and the bell's empty state — nothing is invented to fill it.
 *
 * Each row is one summary — a cartable chip with a live count and the page that clears
 * it — rather than a per-item feed, which is the shape the spec's own cartable chips
 * take. A permission-gated read is only called when the resolved context holds the
 * permission, so a secretary whose overrides removed `view_debts` simply has no debt
 * row rather than a thrown read.
 */

import { prisma, runInTenantScope } from '@/core/db'
import { AppointmentStatus, Permission } from '@/core/constants'
import { realClock } from '@/core/lib/clock'
import { formatNumber, todayLocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { CustomerId, TenantId } from '@/core/types'

import { clinicDay, customerAppointments, doctorDay, unrecordedCartable } from '@/modules/appointments'
import { clinicDebts, customerDebts } from '@/modules/debts'
import { contactList as cycleContactList, doctorCycles } from '@/modules/cycles'
import { leadCounts, ownCareInstructions } from '@/modules/customers'
import { listLeaveRequests } from '@/modules/staff'
import { can } from '@/modules/roles-permissions'

import { NOTIFICATION_KINDS, NOTIFICATIONS_POPOVER } from './catalog'
import type { NotificationItem } from './NotificationBell'
import type { Panel } from './navigation'

/** The db scope a tenant-scoped read runs under, which both session kinds satisfy. */
type ScopeContext = Parameters<typeof runInTenantScope>[0]

/** One kind's own row, or `null` when the kind holds nothing to show. */
function kindRow(
  id: string,
  lead: string,
  count: number,
  href: string,
): NotificationItem | null {
  if (count <= 0) return null
  return {
    id,
    lead,
    text: `${formatNumber(count)}${NOTIFICATIONS_POPOVER.itemsSuffix}`,
    count,
    href,
  }
}

/**
 * The bell's rows for a staff panel, each a cartable chip with a live count.
 *
 * The panel decides which reads run: the reception desk sees the whole cartable, the
 * manager the approvals and the capacity signal, the doctor their own two. The reads
 * run in one tenant-scoped transaction so the counts a manager reads are one moment
 * and not several. The permission context is the membership's own, so `can()` gates a
 * read a secretary's overrides may have removed.
 */
export async function loadStaffNotifications(
  panel: Panel,
  permissions: TenantContext,
  tenantId: TenantId,
): Promise<readonly NotificationItem[]> {
  if (panel === 'reception') return loadReceptionBell(permissions, tenantId)
  if (panel === 'admin') return loadAdminBell(permissions)
  return loadDoctorBell(permissions, tenantId)
}

/** منشی — the full cartable: unrecorded results, cycle calls, overdue debts, leads. */
async function loadReceptionBell(permissions: TenantContext, tenantId: TenantId): Promise<readonly NotificationItem[]> {
  const now = realClock()
  return runInTenantScope(permissions, prisma(), async (tx) => {
    const unrecorded = await unrecordedCartable({ tx, tenantId })

    const cycleCalls = can(permissions, Permission.ActOnCycles)
      ? (await cycleContactList({ tx, ctx: permissions, now })).length
      : 0

    const overdueDebts = can(permissions, Permission.ViewDebts)
      ? await overdueDebtCount(tx, permissions, now)
      : 0

    const newLeads = can(permissions, Permission.ManageLeads)
      ? (await leadCounts({ tx, ctx: permissions })).newCount
      : 0

    return compact([
      kindRow('unrecorded', NOTIFICATION_KINDS.unrecordedResult, unrecorded.length, '/reception/appointments?view=cartable'),
      kindRow('cycle-calls', NOTIFICATION_KINDS.cycleCalls, cycleCalls, '/reception/cycles'),
      kindRow('overdue-debt', NOTIFICATION_KINDS.overdueDebt, overdueDebts, '/reception/debts'),
      kindRow('new-lead', NOTIFICATION_KINDS.newLead, newLeads, '/reception/leads'),
    ])
  })
}

/** مدیر — the approvals and the capacity signal, kept off the follow-up cartable. */
async function loadAdminBell(permissions: TenantContext): Promise<readonly NotificationItem[]> {
  const today = todayLocalDate(realClock())
  return runInTenantScope(permissions, prisma(), async (tx) => {
    const leaveRequests = can(permissions, Permission.ManageUsers)
      ? (await listLeaveRequests({ tx, ctx: permissions })).filter((row) => row.status === 'PENDING').length
      : 0

    const day = await clinicDay({ tx, ctx: permissions, clinicId: permissions.clinicId, localDate: today })
    const cancelledToday = day.filter((row) => row.status === AppointmentStatus.Cancelled).length

    return compact([
      kindRow('leave', NOTIFICATION_KINDS.leaveRequest, leaveRequests, '/admin/staff'),
      kindRow('cancelled', NOTIFICATION_KINDS.cancelledToday, cancelledToday, '/admin/appointments'),
    ])
  })
}

/** پزشک — the doctor's own unrecorded results and their own due cycles. */
async function loadDoctorBell(permissions: TenantContext, tenantId: TenantId): Promise<readonly NotificationItem[]> {
  const today = todayLocalDate(realClock())
  const doctorId = permissions.userId
  return runInTenantScope(permissions, prisma(), async (tx) => {
    const day = await doctorDay({ tx, tenantId, doctorId, localDate: today })
    const unrecorded = day.filter((row) => row.status === AppointmentStatus.ResultNotRecorded).length

    const dueCycles = can(permissions, Permission.ViewOwnCycles)
      ? (await doctorCycles({ tx, ctx: permissions })).filter(isCycleDue).length
      : 0

    return compact([
      kindRow('my-unrecorded', NOTIFICATION_KINDS.myUnrecorded, unrecorded, '/doctor'),
      kindRow('my-cycle-due', NOTIFICATION_KINDS.myCycleDue, dueCycles, '/doctor/cycles'),
    ])
  })
}

/** مشتری — the four surfaces the customer's own dashboard holds. */
export async function loadCustomerNotifications(
  permissions: ScopeContext,
  tenantId: TenantId,
  customerId: CustomerId,
): Promise<readonly NotificationItem[]> {
  const now = realClock()
  return runInTenantScope(permissions, prisma(), async (tx) => {
    const [appointments, debts, care] = await Promise.all([
      customerAppointments({ tx, tenantId, customerId, now }),
      customerDebts({ tx, tenantId, customerId, now }),
      ownCareInstructions({ tx, tenantId, customerId }),
    ])
    const owed = debts.filter((row) => row.balance > 0n).length

    return compact([
      kindRow('next-appointment', NOTIFICATION_KINDS.nextAppointment, appointments.upcoming.length, '/account/appointments'),
      kindRow('my-balance', NOTIFICATION_KINDS.myBalance, owed, '/account/payments'),
      kindRow('care', NOTIFICATION_KINDS.careInstructions, care.length, '/account/care'),
    ])
  })
}

/** The past-due balances, which are the three overdue buckets and not «نزدیک سررسید». */
async function overdueDebtCount(
  tx: Parameters<Parameters<typeof runInTenantScope>[2]>[0],
  ctx: TenantContext,
  now: Date,
): Promise<number> {
  const buckets = await clinicDebts({ tx, ctx, now })
  return buckets.overdue30.length + buckets.overdue7.length + buckets.overdue.length
}

/** Whether a cycle has reached its due day with no future appointment — a due call. */
function isCycleDue(cycle: { readonly inContactList: boolean }): boolean {
  // `inContactList` is the sweep's own answer to "is this cycle waiting for a call",
  // which is exactly «موعد رسیده و نوبت آینده‌ای ثبت نشده» — the page need not re-derive it.
  return cycle.inContactList
}

/** Drops the kinds that held nothing, so the bell shows only live rows. */
function compact(rows: readonly (NotificationItem | null)[]): readonly NotificationItem[] {
  return rows.filter((row): row is NotificationItem => row !== null)
}
