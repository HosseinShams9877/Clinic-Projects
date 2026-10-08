/**
 * Creating a cycle and advancing it — `03-data-model.md` §2.4.1 rules 1–3.
 *
 * **Rule 1 is the reason this module exists.** A cycle is created when an appointment
 * reaches `COMPLETED`, and not at booking and not at arrival: creating at booking
 * would fill the contact list with people who never had a session, and creating at
 * arrival would fill it with people whose session never happened. The appointment
 * module records the transition and hands the facts over; this module owns what the
 * transition *means*.
 *
 * ## How a completed session finds its cycle
 *
 * Three candidate anchors, in order, and the order is the rule:
 *
 * 1. **The appointment's own `cycleId`.** A session booked from the contact list is
 *    linked at booking, because the booking carries the cycle it continues. This is
 *    the ordinary second session and every one after it.
 * 2. **The tenant's open cycle for the same customer, service and doctor.** A
 *    customer who walks in and books without the list in front of the desk still
 *    continues the one course they are on, and a second cycle for one course would be
 *    two drop-off rows for one person. Found most-recent-first, and only among the
 *    three open statuses.
 * 3. **A new row.** The first session of a course, which is also the anchor the
 *    `UNIQUE` on `(tenantId, customerId, serviceId, startedAt)` exists for: a retried
 *    completion is the same appointment on the same day, so it resolves to the same
 *    key and the same row.
 *
 * ## Why the counts are derived and not incremented
 *
 * `completedSessions` and `currentSessionNumber` are columns, but the module writes
 * them as *functions of the appointment rows* and never as `+ 1`. The count of a
 * cycle's `COMPLETED` appointments is the truth the column caches, and deriving it is
 * what makes a retried completion a no-op by construction: the appointment is already
 * one of the rows being counted, so the number does not move. An incrementing counter
 * would need a guard against its own retry, and the guard would be a second
 * implementation of the same rule.
 *
 * ## Why the interval is snapshotted and never re-read
 *
 * Rule 2: the interval comes from the **cycle**, not the service. A customer whose
 * third session slipped by a week must have their fourth slip too, or the treatment
 * spacing collapses. The service's `defaultIntervalDays` is read **once**, on
 * creation, and written onto the row; every later due date is computed from the row.
 * A manager who changes the catalogue's default moves the cycles that start after the
 * change and none of the ones already running — which is DoD 3, and the test that
 * asserts it does so by changing the service and reading the cycle.
 *
 * ## Unbounded courses
 *
 * `totalSessions` is the service's `defaultSessions`, and `0` means the clinic sells an
 * open-ended course — a maintenance treatment with no final session. Such a cycle never
 * reaches `COMPLETED` on its own; the manager closes it from the page, which is why
 * `completeCycle` is a separate write and not an internal detail.
 *
 * ## «دوره تکمیل شده»
 *
 * Completing the last session is what puts the customer in the completed-course
 * audience group. The group is a **saved query** (`03-data-model.md` §2.7, Decision 3),
 * not a member list — there is no join table to write, and membership is the group's
 * predicate evaluated against this row. A cycle reaching `COMPLETED` is what makes the
 * predicate true, so the transition *is* the entry, and the group's seed and predicate
 * are Phase 7's to write against a status this module now produces.
 */

import { AppointmentStatus, CycleStatus } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import type { Prisma } from '@/generated/prisma/client'
import { DomainError, NotFoundError } from '@/core/types'

import type { CyclesMessageKey } from '../catalog'
import type { CompletedSessionFacts, CycleRow } from '../types'
import { readUtcOffsetMinutes } from './settings'
import { nextDueInstant } from './next-due'
import { asCycleStatus, assertCycleTransition, isCycleClosed, OPEN_CYCLE_STATUSES } from './status'

/** The appointment columns the module links a completed session through. */
const LINK_SELECT = {
  id: true,
  cycleId: true,
} as const

/** The service columns a cycle snapshots at creation. */
const SERVICE_SELECT = {
  id: true,
  defaultIntervalDays: true,
  defaultSessions: true,
  isActive: true,
} as const

/**
 * Records a completed session — creating the cycle on the first one and advancing it
 * on every one after.
 *
 * Idempotent on the appointment: a completion recorded twice is one session, because
 * the counts are derived from the rows and the second call counts the same rows. This
 * is DoD 1's retried-completion half, and it is a property of the arithmetic rather
 * than a guard against a retry.
 *
 * The function takes no permission of its own. It is a *consequence* of the transition
 * the caller already held `record_appointment_result` for, and a second gate here
 * would be a second place the two permissions could disagree — every role default that
 * holds the one holds the other (`04-roles-permissions.md` §2.1). The writes that are
 * the desk's own authority — the abandonment and the contact result — do gate.
 *
 * @throws NotFoundError — the service is outside the caller's tenant.
 * @throws DomainError, as `cycle.noInterval` — the service anchors no spacing, so a
 *   cycle built on it would have no due date to sweep.
 * @throws DomainError, as `cycle.closed` — the linked cycle already ended.
 */
export async function recordCompletedSession(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly facts: CompletedSessionFacts
  readonly now: Date
}): Promise<CycleRow> {
  const service = await loadCycleService(args)
  const offset = await readUtcOffsetMinutes(args.tx, args.ctx.tenantId)

  const cycleId = await resolveCycleId(args)
  if (cycleId === null) {
    const created = await createCycle(args, service, offset)
    await linkSession(args, created.id)
    await recomputeCycle(args.tx, args.ctx.tenantId, created.id, offset)
    return loadCycleRow(args.tx, args.ctx.tenantId, created.id)
  }

  await linkSession(args, cycleId)
  await recomputeCycle(args.tx, args.ctx.tenantId, cycleId, offset)
  return loadCycleRow(args.tx, args.ctx.tenantId, cycleId)
}

/**
 * The service the cycle is built on, with the two values this module snapshots.
 *
 * Read here and not taken from the caller, because the interval rule is this module's
 * own: the snapshot is taken at the moment of creation and from the tenant's own
 * catalogue, and a caller that passed a value would be a caller that could pass a
 * stale one.
 *
 * @throws NotFoundError — the service is not in this tenant.
 * @throws DomainError, as `cycle.noInterval` — no spacing is configured.
 */
async function loadCycleService(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly facts: CompletedSessionFacts
}): Promise<ServiceSnapshot> {
  const row = await args.tx.service.findFirst({
    where: { id: args.facts.serviceId, tenantId: args.ctx.tenantId },
    select: SERVICE_SELECT,
  })
  if (row === null) {
    throw new NotFoundError(`Service ${args.facts.serviceId} was not found in this tenant.`, {
      messageKey: 'cycle.notFound' satisfies CyclesMessageKey,
      detail: { serviceId: args.facts.serviceId },
    })
  }
  if (row.defaultIntervalDays <= 0) {
    throw new DomainError(
      `Service ${row.id} holds defaultIntervalDays=${row.defaultIntervalDays}, which anchors no cycle.`,
      {
        messageKey: 'cycle.noInterval' satisfies CyclesMessageKey,
        detail: { serviceId: row.id, defaultIntervalDays: row.defaultIntervalDays },
      },
    )
  }

  return {
    id: row.id,
    defaultIntervalDays: row.defaultIntervalDays,
    defaultSessions: row.defaultSessions,
    isActive: row.isActive,
  }
}

/**
 * The cycle this completed session belongs to, or `null` when the session starts a new
 * one. The three anchors, in the order the file header states them.
 *
 * The first anchor is unconditional on purpose. An appointment that already carries a
 * `cycleId` was booked for that course, and the module does not second-guess the
 * booking — including when the cycle has since closed, which is the retried completion
 * of a finished course: the appointment knows where it belongs, and the derived counts
 * in `recomputeCycle` are what make the second call a no-op rather than a second
 * session.
 */
async function resolveCycleId(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly facts: CompletedSessionFacts
}): Promise<string | null> {
  const linked = await args.tx.appointment.findUnique({
    where: { id: args.facts.appointmentId },
    select: LINK_SELECT,
  })
  if (linked !== null && linked.cycleId !== null) return linked.cycleId

  const open = await args.tx.treatmentCycle.findFirst({
    where: {
      tenantId: args.ctx.tenantId,
      customerId: args.facts.customerId,
      serviceId: args.facts.serviceId,
      doctorId: args.facts.doctorId,
      status: { in: [...OPEN_CYCLE_STATUSES] },
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  })
  return open === null ? null : open.id
}

/**
 * The first row of a course.
 *
 * `startedAt` is the completed session's own slot, which is what makes the unique key
 * refuse a second cycle on the same day and accept a repeat course later. The counts
 * start at zero and are filled by `recomputeCycle`, so the row's shape and the
 * recomputation's shape cannot disagree about what a fresh cycle holds.
 */
async function createCycle(
  args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly facts: CompletedSessionFacts
  },
  service: ServiceSnapshot,
  utcOffsetMinutes: number,
): Promise<{ readonly id: string }> {
  const row = await args.tx.treatmentCycle.create({
    data: {
      tenantId: args.ctx.tenantId,
      customerId: args.facts.customerId,
      serviceId: args.facts.serviceId,
      doctorId: args.facts.doctorId,
      intervalDays: service.defaultIntervalDays,
      totalSessions: service.defaultSessions,
      completedSessions: 0,
      currentSessionNumber: 1,
      startedAt: args.facts.scheduledAt,
      lastSessionAt: null,
      nextDueDate: null,
      status: CycleStatus.Active,
      abandonmentReason: null,
      inContactList: false,
    },
    select: { id: true },
  })

  // The interval belongs to the row and not the service: the due date below is the one
  // this cycle will carry for the rest of its course.
  await args.tx.treatmentCycle.update({
    where: { id: row.id },
    data: { nextDueDate: nextDueInstant(args.facts.scheduledAt, service.defaultIntervalDays, utcOffsetMinutes) },
  })

  return row
}

/**
 * Points the completed appointment at its cycle.
 *
 * A session that is not linked is a session the cycle cannot count, and linking is what
 * makes the appointment grid's `cycleId` column and the cycle's own session table one
 * set of rows. The link is written before the recompute for the same reason the counts
 * are derived: the row being counted has to be countable when the count runs.
 */
async function linkSession(
  args: {
    readonly tx: TransactionClient
    readonly facts: CompletedSessionFacts
  },
  cycleId: string,
): Promise<void> {
  await args.tx.appointment.update({
    where: { id: args.facts.appointmentId },
    data: { cycleId },
  })
}

/**
 * Rewrites a cycle's derived facts from its own rows.
 *
 * The one place `completedSessions`, `currentSessionNumber`, `lastSessionAt`,
 * `nextDueDate` and `status` are written, so the five are one fact and never five
 * writes that can disagree. Called after every completed session — the first and every
 * one after — and by nothing else, because nothing else changes which sessions a cycle
 * has.
 *
 * `status` is `COMPLETED` when the course has a total and reached it, and `ACTIVE`
 * otherwise: a customer who just attended is not due, and the sweep will move them to
 * `DUE` when their day arrives. A cycle with no total (`defaultSessions = 0`) stays
 * open until the manager closes it.
 */
async function recomputeCycle(
  tx: TransactionClient,
  tenantId: string,
  cycleId: string,
  utcOffsetMinutes: number,
): Promise<void> {
  const cycle = await tx.treatmentCycle.findUnique({
    where: { id: cycleId, tenantId },
    select: { id: true, intervalDays: true, totalSessions: true, status: true },
  })
  if (cycle === null) return

  // A course that reached a terminal state does not move its own facts. Unreachable on
  // the ordinary path — the first anchor resolves a completion to the cycle the
  // appointment was booked for, and a cycle is abandoned or completed by a write that
  // runs in its own transaction — and handled rather than assumed, because the two
  // writes are both things a desk can have in flight.
  if (isCycleClosed(cycle.status)) return

  const sessions = await tx.appointment.findMany({
    where: {
      tenantId,
      cycleId,
      isSlotBlock: false,
      status: AppointmentStatus.Completed,
    },
    select: { scheduledAt: true },
    orderBy: { scheduledAt: 'asc' },
  })

  // The empty case is unreachable in practice — the session that triggered the recompute
  // is linked before it runs — but the length check is the guard the compiler will not
  // supply, so the narrowing below is what keeps the restored flag honest.
  if (sessions.length === 0) return

  const last = sessions[sessions.length - 1]
  if (last === undefined) return
  const lastSessionAt = last.scheduledAt
  const finished = cycle.totalSessions > 0 && sessions.length >= cycle.totalSessions

  if (finished) {
    // The only transition this write performs: an open course reaching its total. The
    // guard is what keeps the closure honest — and it cannot fire on a retry, because a
    // cycle already at `COMPLETED` is returned by the early return above.
    assertCycleTransition(asCycleStatus(cycle.status), CycleStatus.Completed)
  }

  await tx.treatmentCycle.update({
    where: { id: cycle.id },
    data: {
      completedSessions: sessions.length,
      currentSessionNumber: sessions.length + 1,
      lastSessionAt,
      nextDueDate: nextDueInstant(lastSessionAt, cycle.intervalDays, utcOffsetMinutes),
      status: finished ? CycleStatus.Completed : CycleStatus.Active,
      // A customer who attended is not on the desk's list. This is rule 5's third exit,
      // and it runs here rather than in the contact-list refresh so a completion and its
      // list exit are one write.
      inContactList: false,
    },
  })
}

/** The service facts a cycle snapshots, as the row holds them. */
interface ServiceSnapshot {
  readonly id: string
  readonly defaultIntervalDays: number
  readonly defaultSessions: number
  readonly isActive: boolean
}

/**
 * One cycle as the module answers it, with the names read through the live relations.
 *
 * `service` and `doctor` are relations and not snapshots — Phase 3 established that no
 * `serviceName` column exists anywhere in the schema, so the cycle UI renders what the
 * row points at and the catalogue's rename is visible on the historical row. See
 * `reports/phase-03-report.md` §5.
 */
export async function loadCycleRow(
  tx: TransactionClient,
  tenantId: string,
  cycleId: string,
): Promise<CycleRow> {
  const row = await tx.treatmentCycle.findUnique({
    where: { id: cycleId, tenantId },
    select: CYCLE_SELECT,
  })
  if (row === null) {
    throw new NotFoundError(`Cycle ${cycleId} was not found in this tenant.`, {
      messageKey: 'cycle.notFound' satisfies CyclesMessageKey,
      detail: { cycleId },
    })
  }
  return asCycleRow(row)
}

/** The columns a cycle row is read with, including the two relations the names come from. */
export const CYCLE_SELECT = {
  id: true,
  customerId: true,
  customer: { select: { firstName: true, lastName: true } },
  serviceId: true,
  service: { select: { name: true } },
  doctorId: true,
  doctor: { select: { firstName: true, lastName: true } },
  intervalDays: true,
  totalSessions: true,
  completedSessions: true,
  currentSessionNumber: true,
  startedAt: true,
  lastSessionAt: true,
  nextDueDate: true,
  status: true,
  abandonmentReason: true,
  inContactList: true,
  lastContactAt: true,
  nextContactAt: true,
} as const satisfies Prisma.TreatmentCycleSelect

/** A row as the module's own shape, with the two names joined and the rest as stored. */
export function asCycleRow(row: CycleSelectRow): CycleRow {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: [row.customer.firstName, row.customer.lastName].filter(Boolean).join(' '),
    serviceId: row.serviceId,
    serviceName: row.service.name,
    doctorId: row.doctorId,
    doctorName: [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' '),
    intervalDays: row.intervalDays,
    totalSessions: row.totalSessions,
    completedSessions: row.completedSessions,
    currentSessionNumber: row.currentSessionNumber,
    startedAt: row.startedAt,
    lastSessionAt: row.lastSessionAt,
    nextDueDate: row.nextDueDate,
    status: row.status,
    abandonmentReason: row.abandonmentReason,
    inContactList: row.inContactList,
    lastContactAt: row.lastContactAt,
    nextContactAt: row.nextContactAt,
  }
}

/** The shape Prisma hands back from the cycle read the module performs. */
export type CycleSelectRow = {
  readonly id: string
  readonly customerId: string
  readonly customer: { readonly firstName: string; readonly lastName: string | null }
  readonly serviceId: string
  readonly service: { readonly name: string }
  readonly doctorId: string
  readonly doctor: { readonly firstName: string; readonly lastName: string | null }
  readonly intervalDays: number
  readonly totalSessions: number
  readonly completedSessions: number
  readonly currentSessionNumber: number
  readonly startedAt: Date
  readonly lastSessionAt: Date | null
  readonly nextDueDate: Date | null
  readonly status: string
  readonly abandonmentReason: string | null
  readonly inContactList: boolean
  readonly lastContactAt: Date | null
  readonly nextContactAt: Date | null
}
