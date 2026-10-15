/**
 * The module's reads — the three surfaces of `02-architecture.md` §9 that render a
 * cycle, and the two the desk's own page and the customer profile read.
 *
 * | Read | Surface | Scope |
 * |---|---|---|
 * | `contactList` | `reception/cycles.html` | the clinic's cycles that are on the list |
 * | `receptionActiveCycles` | `reception/cycles.html` | every open cycle, on the list or not |
 * | `clinicCycles` | `admin/cycles.html` | the clinic's cycles, read-only oversight |
 * | `doctorCycles` | `doctor/cycles.html` | the caller's own, by `doctorId` |
 * | `customerCycles` | the customer profile | one customer's courses |
 *
 * ## Why the contact list recomputes as it reads
 *
 * `03-data-model.md` §2.4's index table calls the contact list "the primary revenue
 * query in the product", and a list that is stale is a list the desk stops trusting. The
 * read therefore runs the recompute over every cycle it returns, which is the same
 * function the sweep and the booking path run — one rule, three callers — and the list a
 * receptionist opens is the list the clock has already made.
 *
 * ## Why the desk's second tab reads every open cycle
 *
 * `contactList` is the follow-up queue: the courses whose day arrived and whose
 * customer has not booked. That is the queue the desk works through, and it is the
 * right default. But a course whose day has *not* arrived yet is a course the desk may
 * still book the next session against — the customer who calls early, or the one who
 * books the next session while they are still at the desk. `receptionActiveCycles` is
 * that second read: every cycle in the three open statuses, recomputed like the
 * contact list so `inContactList` is honest, and ordered so the soonest due day is
 * first. The two tabs are two questions over the same rows, and neither re-derives
 * the other's set.
 *
 * ## Why the names are relations and not columns
 *
 * Neither `Appointment` nor `TreatmentCycle` holds a `serviceName` — Phase 3 established
 * that the catalogue's name is a value the catalogue may change, and the schema snapshots
 * the price and the duration but never the name (`reports/phase-03-report.md` §5). The
 * cycle UI renders the name through the live `service` relation, so a renamed service
 * shows its new name on the historical row. That is the option the phase's instruction
 * named, and no column was added.
 *
 * ## Why the doctor's read is a `where` clause
 *
 * `09-security.md` §6.3's 404-not-403 rule: another doctor's cycle is absent from this
 * doctor's read and never present-then-refused, because the scoping is in the query and
 * not a guard after it. The doctor's own cycles are selected by `doctorId`, which holds
 * the `User` id — the same id every `doctorId` column in the schema holds, and the one
 * `TenantContext.userId` is.
 */

import { CycleStatus } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import type { Prisma } from '@prisma/client'
import { fromUtcInstant } from '@/core/localization'
import { requirePermission } from '@/modules/roles-permissions'

import type { ContactListEntry, CycleRow } from '../types'
import { asCycleRow, CYCLE_SELECT, type CycleSelectRow } from './creation'
import { refreshContactListForCycle } from './contact-list'
import { readUtcOffsetMinutes } from './settings'

/** The most a page reads in one go; a list is scrolled, not paged. */
const LIST_LIMIT = 200

/** The three open statuses, as the read's own filter array. */
const OPEN_STATUSES: string[] = [
  CycleStatus.Active,
  CycleStatus.Due,
  CycleStatus.AtRisk,
]

/**
 * «دوره‌های فعال با موعد رسیده» — the desk's contact list.
 *
 * The list is the cycles currently carrying `inContactList`, which is the flag the
 * recompute owns. Reading by the flag and not by a date comparison is what keeps the
 * list and the sweep honest about the same set: a cycle is on the list because the rule
 * put it there, and not because a query re-derived the rule at read time.
 *
 * @throws PermissionError — no `act_on_cycles`, which §2.1's 1–12 gives the desk.
 */
export async function contactList(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly now: Date
}): Promise<readonly ContactListEntry[]> {
  requirePermission(args.ctx, 'act_on_cycles')

  const offset = await readUtcOffsetMinutes(args.tx, args.ctx.tenantId)

  const onList = await args.tx.treatmentCycle.findMany({
    where: { tenantId: args.ctx.tenantId, inContactList: true },
    select: CONTACT_LIST_SELECT,
    orderBy: [{ nextDueDate: 'asc' }, { lastContactAt: { sort: 'asc', nulls: 'first' } }],
    take: LIST_LIMIT,
  })

  const entries: ContactListEntry[] = []
  for (const row of onList) {
    const stillOnList = await refreshContactListForCycle({
      tx: args.tx,
      tenantId: args.ctx.tenantId,
      cycleId: row.id,
      now: args.now,
    })
    if (!stillOnList) continue

    entries.push(asContactListEntry(row, offset))
  }

  return entries
}

/**
 * «همه‌ی چرخه‌های فعال» — every open cycle, whether or not it is on the desk's list.
 *
 * The read is the one the desk's second tab renders. It answers the question "which
 * courses is the clinic still running", which is what the desk needs when the
 * customer calls *before* the due day to book the next session. The recompute runs
 * per row for the same reason it runs in `contactList`: the row's `inContactList`
 * flag is what tells the desk which courses are already queued for a call, and a
 * stale flag would put a row on the wrong tab.
 *
 * @throws PermissionError — no `act_on_cycles`.
 */
export async function receptionActiveCycles(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly now: Date
}): Promise<readonly ContactListEntry[]> {
  requirePermission(args.ctx, 'act_on_cycles')

  const offset = await readUtcOffsetMinutes(args.tx, args.ctx.tenantId)

  const rows = await args.tx.treatmentCycle.findMany({
    where: {
      tenantId: args.ctx.tenantId,
      status: { in: OPEN_STATUSES },
    },
    select: CONTACT_LIST_SELECT,
    orderBy: [
      { nextDueDate: { sort: 'asc', nulls: 'last' } },
      { startedAt: 'desc' },
    ],
    take: LIST_LIMIT,
  })

  const entries: ContactListEntry[] = []
  for (const row of rows) {
    await refreshContactListForCycle({
      tx: args.tx,
      tenantId: args.ctx.tenantId,
      cycleId: row.id,
      now: args.now,
    })
    entries.push(asContactListEntry(row, offset))
  }

  return entries
}

/** The contact list reads the cycle's columns plus the mobile the desk dials. */
const CONTACT_LIST_SELECT = {
  ...CYCLE_SELECT,
  customer: { select: { firstName: true, lastName: true, mobile: true } },
} as const satisfies Prisma.TreatmentCycleSelect

/** One row of the list, with its due day and the mobile the desk dials. */
function asContactListEntry(row: ContactListSelectRow, utcOffsetMinutes: number): ContactListEntry {
  const due = row.nextDueDate === null ? null : fromUtcInstant(row.nextDueDate, utcOffsetMinutes)
  return {
    ...asCycleRow(row),
    dueSessionNumber: row.currentSessionNumber,
    dueLocalDate: due === null ? null : due.localDate,
    mobile: row.customer.mobile,
  }
}

/** The shape Prisma hands back from the contact list's read. */
type ContactListSelectRow = CycleSelectRow & {
  readonly customer: {
    readonly firstName: string
    readonly lastName: string | null
    readonly mobile: string
  }
}

/**
 * The clinic's cycles — the manager's read-only oversight, and the drop-off curve's
 * entry point.
 *
 * @throws PermissionError — no `act_on_cycles`.
 */
export async function clinicCycles(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly CycleRow[]> {
  requirePermission(args.ctx, 'act_on_cycles')

  const rows = await args.tx.treatmentCycle.findMany({
    where: { tenantId: args.ctx.tenantId },
    select: CYCLE_SELECT,
    orderBy: [{ status: 'asc' }, { lastSessionAt: { sort: 'desc', nulls: 'last' } }],
    take: LIST_LIMIT,
  })

  return rows.map(asCycleRow)
}

/**
 * «چرخه درمان» — the doctor's own cycles, scoped by `doctorId`.
 *
 * @throws PermissionError — no `view_own_cycles`.
 */
export async function doctorCycles(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly CycleRow[]> {
  requirePermission(args.ctx, 'view_own_cycles')

  const rows = await args.tx.treatmentCycle.findMany({
    where: { tenantId: args.ctx.tenantId, doctorId: args.ctx.userId },
    select: CYCLE_SELECT,
    orderBy: [{ status: 'asc' }, { lastSessionAt: { sort: 'desc', nulls: 'last' } }],
    take: LIST_LIMIT,
  })

  return rows.map(asCycleRow)
}

/**
 * One customer's cycles.
 */
export async function customerCycles(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<readonly CycleRow[]> {
  const rows = await args.tx.treatmentCycle.findMany({
    where: { tenantId: args.tenantId, customerId: args.customerId },
    select: CYCLE_SELECT,
    orderBy: { startedAt: 'desc' },
    take: LIST_LIMIT,
  })

  return rows.map(asCycleRow)
}

/** The statuses the oversight table groups a course into, for the page's own columns. */
export const CYCLE_STATUS_ORDER: readonly CycleStatus[] = [
  CycleStatus.Due,
  CycleStatus.AtRisk,
  CycleStatus.Active,
  CycleStatus.Completed,
  CycleStatus.Abandoned,
]