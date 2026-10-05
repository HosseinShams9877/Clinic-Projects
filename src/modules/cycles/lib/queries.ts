/**
 * The module's reads — the three surfaces of `02-architecture.md` §9 that render a
 * cycle, and the one the customer profile reads.
 *
 * | Read | Surface | Scope |
 * |---|---|---|
 * | `contactList` | `reception/cycles.html` | the clinic's cycles that are on the list |
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
import type { Prisma } from '@/generated/prisma/client'
import { fromUtcInstant } from '@/core/localization'
import { requirePermission } from '@/modules/roles-permissions'

import type { ContactListEntry, CycleRow } from '../types'
import { asCycleRow, CYCLE_SELECT, type CycleSelectRow } from './creation'
import { refreshContactListForCycle } from './contact-list'
import { readUtcOffsetMinutes } from './settings'

/** The most a page reads in one go; a list is scrolled, not paged. */
const LIST_LIMIT = 200

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
    // The recompute is the same one the sweep runs, so a cycle whose future appointment
    // landed between the sweep's tick and this read leaves the list in this read rather
    // than on the next sweep. Its cost is one bounded query per row, and the list is the
    // one query the product runs constantly.
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
  readonly customer: { readonly firstName: string; readonly lastName: string | null; readonly mobile: string }
}

/**
 * The clinic's cycles — the manager's read-only oversight, and the drop-off curve's
 * entry point.
 *
 * Read-only is the page's, not the query's: the same rows are the ones the manager's
 * own `act_on_cycles` writes close, and the oversight table is where the manager reads
 * the courses before deciding which one to abandon. Ordered by the last session so a
 * manager scanning for stalled courses finds them at the top.
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
 * The `where` clause is the 404-not-403 rule's read half: another doctor's cycles are
 * absent from this read, and the doctor's page cannot render a course that is not
 * theirs. `doctorId` holds the `User` id, which is `TenantContext.userId`.
 *
 * @throws PermissionError — no `view_own_cycles`, which §2.1's 1, 5, 10 gives the doctor.
 */
export async function doctorCycles(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly CycleRow[]> {
  requirePermission(args.ctx, 'view_own_cycles')

  const rows = await args.tx.treatmentCycle.findMany({
    where: { tenantId: args.ctx.tenantId, doctorId: args.ctx.userId },
    select: CYCLE_SELECT,
    orderBy: [
      { status: 'asc' },
      { lastSessionAt: { sort: 'desc', nulls: 'last' } },
    ],
    take: LIST_LIMIT,
  })

  return rows.map(asCycleRow)
}

/**
 * One customer's cycles — the cycle table on the customer profile, and the progress bar
 * in the customer panel.
 *
 * Takes no permission: the caller is a page that already established its own scope (the
 * profile's `view_all_customers` or the doctor's `view_own_customer_records`), and the
 * tenant scoping is still enforced by the `where` clause.
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
