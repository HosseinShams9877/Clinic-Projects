/**
 * The role-aware notification feed behind the topbar bell and the notifications page.
 *
 * `PanelShell` is otherwise pure composition, but the bell and its page are shell-level
 * surfaces every panel carries. This module holds the one place their rows are read, so
 * the bell's unread count and the page's list are the same reads — a *different* set per
 * panel, because the specification splits notifications by role (قاعده دوم): the
 * reception desk sees the whole follow-up cartable, the manager only approvals and the
 * capacity signal, the doctor only their own, the customer their own four.
 *
 * Each notification is one real entity with a stable key (`<kind>:<entityId>`), so it
 * can be marked read or hidden per principal (`notification-state.ts`). A kind with a
 * permission gate is only read when the context holds it; a hidden key is dropped; and
 * nothing is invented — every entry is a row one of these reads returned.
 */

import { prisma, runInTenantScope } from '@/core/db'
import { AppointmentStatus, Permission } from '@/core/constants'
import { realClock } from '@/core/lib/clock'
import { asLocalTime, formatTime, todayLocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { IconName } from '@/core/components/icons'

import { clinicDay, customerAppointments, doctorDay, unrecordedCartable } from '@/modules/appointments'
import { clinicDebts, customerDebts } from '@/modules/debts'
import { contactList as cycleContactList, doctorCycles } from '@/modules/cycles'
import { listLeads, ownCareInstructions } from '@/modules/customers'
import { listLeaveRequests } from '@/modules/staff'
import { can } from '@/modules/roles-permissions'

import { NOTIFICATION_KINDS } from './catalog'
import {
  hideNotification,
  loadNotificationState,
  markNotificationsRead,
  type NotificationPrincipal,
} from './notification-state'
import type { Panel } from './navigation'

/** The db scope a tenant-scoped read runs under, which both session kinds satisfy. */
type ScopeContext = Parameters<typeof runInTenantScope>[0]

/** One notification, as the bell row and the page row both render it. */
export interface NotificationEntry {
  /** The stable key the read/hidden state is kept against. */
  readonly key: string
  /** The kind label — the cartable chip's name. */
  readonly title: string
  /** The entity's own detail: a customer's name, a date — data, not a sentence. */
  readonly detail: string
  /** A time, when the entity has one (an appointment's slot), else ''. */
  readonly time: string
  /** The icon the kind renders with. */
  readonly icon: IconName
  /** The page a click navigates to, where the kind is cleared. */
  readonly href: string
  /** Whether this principal has already read it. */
  readonly read: boolean
}

/** The feed for a panel: its visible entries, and how many are unread. */
export interface NotificationFeed {
  readonly entries: readonly NotificationEntry[]
  readonly unreadCount: number
}

/* ── Per-kind presentation ──────────────────────────────────────────────────── */

/** The icon each kind renders with — existing icon names only. */
const KIND_ICON = {
  unrecorded: 'alert',
  cycle: 'treatment',
  debt: 'debt',
  lead: 'customers',
  leave: 'calendar',
  cancelled: 'close',
  appointment: 'appointment',
  care: 'treatment',
} satisfies Record<string, IconName>

/** A raw candidate before the read/hidden state is folded in. */
interface Candidate {
  readonly key: string
  readonly title: string
  readonly detail: string
  readonly time: string
  readonly icon: IconName
  readonly href: string
}

/* ── The panels ─────────────────────────────────────────────────────────────── */

/** The notification feed for a staff panel. */
export async function loadStaffFeed(
  panel: Panel,
  permissions: TenantContext,
  tenantId: string,
): Promise<NotificationFeed> {
  const principal: NotificationPrincipal = { tenantId, kind: 'staff', id: permissions.userId }
  return runInTenantScope(permissions, prisma(), async (tx) => {
    const candidates =
      panel === 'reception'
        ? await receptionCandidates(tx, permissions, tenantId)
        : panel === 'admin'
          ? await adminCandidates(tx, permissions)
          : await doctorCandidates(tx, permissions, tenantId)
    const state = await loadNotificationState(tx, principal)
    return foldState(candidates, state)
  })
}

/** The notification feed for the customer panel. */
export async function loadCustomerFeed(
  permissions: ScopeContext,
  tenantId: string,
  customerId: string,
): Promise<NotificationFeed> {
  const principal: NotificationPrincipal = { tenantId, kind: 'customer', id: customerId }
  return runInTenantScope(permissions, prisma(), async (tx) => {
    const candidates = await customerCandidates(tx, tenantId, customerId)
    const state = await loadNotificationState(tx, principal)
    return foldState(candidates, state)
  })
}

/** Folds the read/hidden state into the candidates: drop hidden, flag read, count unread. */
function foldState(
  candidates: readonly Candidate[],
  state: { readonly read: ReadonlySet<string>; readonly hidden: ReadonlySet<string> },
): NotificationFeed {
  const entries = candidates
    .filter((candidate) => !state.hidden.has(candidate.key))
    .map((candidate) => ({ ...candidate, read: state.read.has(candidate.key) }))
  return { entries, unreadCount: entries.filter((entry) => !entry.read).length }
}

/* ── منشی ───────────────────────────────────────────────────────────────────── */

async function receptionCandidates(
  tx: Parameters<Parameters<typeof runInTenantScope>[2]>[0],
  ctx: TenantContext,
  tenantId: string,
): Promise<readonly Candidate[]> {
  const now = realClock()
  const out: Candidate[] = []

  for (const row of await unrecordedCartable({ tx, tenantId })) {
    out.push({
      key: `unrecorded:${row.id}`,
      title: NOTIFICATION_KINDS.unrecordedResult,
      detail: row.customerName ?? '',
      time: timeOf(row.localTime),
      icon: KIND_ICON.unrecorded,
      href: '/reception/appointments?view=cartable',
    })
  }

  if (can(ctx, Permission.ActOnCycles)) {
    for (const row of await cycleContactList({ tx, ctx, now })) {
      out.push({
        key: `cycle:${row.id}`,
        title: NOTIFICATION_KINDS.cycleCalls,
        detail: row.customerName,
        time: '',
        icon: KIND_ICON.cycle,
        href: '/reception/cycles',
      })
    }
  }

  if (can(ctx, Permission.ViewDebts)) {
    const buckets = await clinicDebts({ tx, ctx, now })
    for (const row of [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue]) {
      out.push({
        key: `debt:${row.appointmentId}`,
        title: NOTIFICATION_KINDS.overdueDebt,
        detail: debtorName(row),
        time: '',
        icon: KIND_ICON.debt,
        href: '/reception/debts',
      })
    }
  }

  if (can(ctx, Permission.ManageLeads)) {
    for (const row of await listLeads({ tx, ctx })) {
      if (row.leadStatus !== null && row.leadStatus !== 'NEW') continue
      out.push({
        key: `lead:${row.id}`,
        title: NOTIFICATION_KINDS.newLead,
        detail: leadName(row),
        time: '',
        icon: KIND_ICON.lead,
        href: '/reception/leads',
      })
    }
  }

  return out
}

/* ── مدیر ───────────────────────────────────────────────────────────────────── */

async function adminCandidates(
  tx: Parameters<Parameters<typeof runInTenantScope>[2]>[0],
  ctx: TenantContext,
): Promise<readonly Candidate[]> {
  const out: Candidate[] = []

  if (can(ctx, Permission.ManageUsers)) {
    for (const row of await listLeaveRequests({ tx, ctx })) {
      if (row.status !== 'PENDING') continue
      out.push({
        key: `leave:${row.id}`,
        title: NOTIFICATION_KINDS.leaveRequest,
        detail: '',
        time: '',
        icon: KIND_ICON.leave,
        href: '/admin/staff',
      })
    }
  }

  const today = todayLocalDate(realClock())
  for (const row of await clinicDay({ tx, ctx, clinicId: ctx.clinicId, localDate: today })) {
    if (row.status !== AppointmentStatus.Cancelled) continue
    out.push({
      key: `cancelled:${row.id}`,
      title: NOTIFICATION_KINDS.cancelledToday,
      detail: row.customerName ?? '',
      time: timeOf(row.localTime),
      icon: KIND_ICON.cancelled,
      href: '/admin/appointments',
    })
  }

  return out
}

/* ── پزشک ───────────────────────────────────────────────────────────────────── */

async function doctorCandidates(
  tx: Parameters<Parameters<typeof runInTenantScope>[2]>[0],
  ctx: TenantContext,
  tenantId: string,
): Promise<readonly Candidate[]> {
  const today = todayLocalDate(realClock())
  const out: Candidate[] = []

  for (const row of await doctorDay({ tx, tenantId, doctorId: ctx.userId, localDate: today })) {
    if (row.status !== AppointmentStatus.ResultNotRecorded) continue
    out.push({
      key: `unrecorded:${row.id}`,
      title: NOTIFICATION_KINDS.myUnrecorded,
      detail: row.customerName ?? '',
      time: timeOf(row.localTime),
      icon: KIND_ICON.unrecorded,
      href: '/doctor',
    })
  }

  if (can(ctx, Permission.ViewOwnCycles)) {
    for (const row of await doctorCycles({ tx, ctx })) {
      if (!row.inContactList) continue
      out.push({
        key: `cycle:${row.id}`,
        title: NOTIFICATION_KINDS.myCycleDue,
        detail: row.customerName,
        time: '',
        icon: KIND_ICON.cycle,
        href: '/doctor/cycles',
      })
    }
  }

  return out
}

/* ── مشتری ──────────────────────────────────────────────────────────────────── */

async function customerCandidates(
  tx: Parameters<Parameters<typeof runInTenantScope>[2]>[0],
  tenantId: string,
  customerId: string,
): Promise<readonly Candidate[]> {
  const now = realClock()
  const [appointments, debts, care] = await Promise.all([
    customerAppointments({ tx, tenantId, customerId, now }),
    customerDebts({ tx, tenantId, customerId, now }),
    ownCareInstructions({ tx, tenantId, customerId }),
  ])
  const out: Candidate[] = []

  for (const row of appointments.upcoming) {
    out.push({
      key: `appt:${row.id}`,
      title: NOTIFICATION_KINDS.nextAppointment,
      detail: row.serviceName ?? '',
      time: timeOf(row.localTime),
      icon: KIND_ICON.appointment,
      href: '/account/appointments',
    })
  }

  for (const row of debts) {
    if (row.balance <= 0n) continue
    out.push({
      key: `debt:${row.appointmentId}`,
      title: NOTIFICATION_KINDS.myBalance,
      detail: '',
      time: '',
      icon: KIND_ICON.debt,
      href: '/account/payments',
    })
  }

  for (const row of care) {
    out.push({
      key: `care:${row.id}`,
      title: NOTIFICATION_KINDS.careInstructions,
      detail: row.serviceName ?? '',
      time: '',
      icon: KIND_ICON.care,
      href: '/account/care',
    })
  }

  return out
}

/* ── Writes the actions call ──────────────────────────────────────────────────── */

/** Marks every currently-visible key read for this principal. */
export async function markAllReadForPanel(
  panel: Panel,
  permissions: ScopeContext,
  tenantId: string,
  principalId: string,
): Promise<void> {
  const principal: NotificationPrincipal = {
    tenantId,
    kind: panel === 'account' ? 'customer' : 'staff',
    id: principalId,
  }
  const feed =
    panel === 'account'
      ? await loadCustomerFeed(permissions, tenantId, principalId)
      : await loadStaffFeed(panel, permissions as TenantContext, tenantId)
  const keys = feed.entries.map((entry) => entry.key)
  await runInTenantScope(permissions, prisma(), (tx) => markNotificationsRead(tx, principal, keys))
}

/** Marks one key read. */
export async function markOneRead(
  permissions: ScopeContext,
  principal: NotificationPrincipal,
  key: string,
): Promise<void> {
  await runInTenantScope(permissions, prisma(), (tx) => markNotificationsRead(tx, principal, [key]))
}

/** Hides one key for this principal — the per-user delete. */
export async function hideOne(
  permissions: ScopeContext,
  principal: NotificationPrincipal,
  key: string,
): Promise<void> {
  await runInTenantScope(permissions, prisma(), (tx) => hideNotification(tx, principal, key))
}

/* ── Small helpers ────────────────────────────────────────────────────────────── */

/** A stored `HH:mm` as the formatted time, or '' when the row carries none. */
function timeOf(localTime: string): string {
  return localTime === '' ? '' : formatTime(asLocalTime(localTime))
}

/** A debtor's name from the debt row's own name columns. */
function debtorName(row: { readonly customerFirstName: string; readonly customerLastName: string | null }): string {
  return row.customerLastName === null ? row.customerFirstName : `${row.customerFirstName} ${row.customerLastName}`
}

/** A lead's name from the lead row's own name columns. */
function leadName(row: { readonly firstName: string; readonly lastName: string | null }): string {
  return row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
}
