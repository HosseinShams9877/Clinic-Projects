/**
 * The eight built-in evaluators — `03-data-model.md` §2.7's coverage map, one
 * function per group, each answerable from the index that section names.
 *
 * The map is a claim about the schema, and this file is where the claim is kept. Each
 * evaluator's `where` is written to the index's column order — `customer_tenant_birth_idx`
 * for «متولدین این ماه», `customer_tenant_lastvisit_idx` for «خوابیده‌ها», and so on —
 * because the index is the thing that keeps a group of a clinic's every customer a
 * bounded read, and a query that did not use it is a scan the nightly job pays for
 * every night. The `take` on each read is the same bound the automatic dispatch uses:
 * a group is not thousands of people, and a campaign that exceeds the bound is a
 * campaign the daily cap already throttles.
 *
 * ## Why each group reads what it reads
 *
 * The two facts every group shares are applied once, in `baseWhere`: the record is
 * active, and the person is a customer rather than a lead. A lead is a person the
 * clinic has never served, and a birthday message to one is a message about a
 * relationship that does not exist. The `AND` the conditions form builds is composed
 * *inside* this base, so no stored predicate can widen a group past it.
 *
 * ## Why the three cross-table groups batch their second read
 *
 * «موعد رسیده» reads cycles and then appointments; «بدهکاران» reads appointments and
 * then payments; «دوره تکمیل شده» reads cycles. The second read is a `groupBy` or an
 * `in` on the first read's ids rather than a query per row, because a query per cycle
 * is a hundred queries for a hundred customers, and the set the join exists to answer
 * — which of these customers already booked — is one question with one answer.
 */

import {
  AppointmentStatus,
  AudienceGroupKey,
  CycleStatus,
  CustomerLifecycle,
} from '@/core/constants'
import { todayLocalDate, jalaliMonthOf } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'
import { asBalance } from '@/modules/payments'
import { effectiveDueInstant, readDebtSettings } from '@/modules/debts'

/** A day, as milliseconds, so the windows read as days and not as numbers. */
const DAY_MS = 24 * 60 * 60 * 1000

/** A group is a bounded set; the campaign's daily cap is the backstop above this. */
const GROUP_BATCH = 500

/** The statuses a customer is still expected at — the ones that take a cycle off the list. */
const EXPECTED_STATUSES: readonly string[] = [
  AppointmentStatus.Booked,
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.Arrived,
  AppointmentStatus.ResultNotRecorded,
]

/** The evaluator's arguments: a scoped transaction, the tenant, and the clock. */
export interface EvaluatorArgs {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}

/** What one of the eight answers: the customer ids the group holds at `now`. */
export type AudienceEvaluator = (args: EvaluatorArgs) => Promise<readonly string[]>

/** The two facts every group shares, applied before any group's own predicate. */
function baseWhere(tenantId: string) {
  return {
    tenantId,
    isActive: true,
    lifecycle: CustomerLifecycle.Customer,
  } as const
}

/** «متولدین این ماه» — `birthMonth = currentJalaliMonth`, on `customer_tenant_birth_idx`. */
async function birthday({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const rows = await tx.customer.findMany({
    where: { ...baseWhere(tenantId), birthMonth: jalaliMonthOf(todayLocalDate(now)) },
    select: { id: true },
    take: GROUP_BATCH,
  })
  return rows.map((row) => row.id)
}

/**
 * «خوابیده‌ها» — last visit more than ۹۰ days ago and at least one session, on
 * `customer_tenant_lastvisit_idx`.
 */
async function dormant({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const rows = await tx.customer.findMany({
    where: {
      ...baseWhere(tenantId),
      completedSessions: { gte: 1 },
      lastVisitAt: { lt: new Date(now.getTime() - 90 * DAY_MS) },
    },
    select: { id: true },
    take: GROUP_BATCH,
  })
  return rows.map((row) => row.id)
}

/**
 * «موعد رسیده» — an open cycle past its due date with no future appointment, on
 * `cycle_tenant_status_due_idx` and `appt_tenant_status_sched_idx`.
 *
 * The second condition is the whole point of the group, and it is the same one the
 * desk's contact list keeps: a customer who already booked is not a customer to call,
 * and including them is what the specification calls the fastest way to make a group
 * worthless.
 */
async function cycleDue({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const cycles = await tx.treatmentCycle.findMany({
    where: {
      tenantId,
      status: { in: [CycleStatus.Active, CycleStatus.Due] },
      nextDueDate: { lte: now },
    },
    select: { id: true, customerId: true },
    take: GROUP_BATCH,
  })
  if (cycles.length === 0) return []

  const booked = await tx.appointment.findMany({
    where: {
      tenantId,
      isSlotBlock: false,
      status: { in: [...EXPECTED_STATUSES] },
      scheduledAt: { gt: now },
      cycleId: { in: cycles.map((cycle) => cycle.id) },
    },
    select: { cycleId: true },
  })
  const withFutureAppointment = new Set(booked.map((row) => row.cycleId))

  return unique(
    cycles.filter((cycle) => !withFutureAppointment.has(cycle.id)).map((cycle) => cycle.customerId),
  )
}

/** «وفادارها» — more than five completed sessions, on `customer_tenant_sessions_idx`. */
async function loyal({ tx, tenantId }: EvaluatorArgs): Promise<readonly string[]> {
  const rows = await tx.customer.findMany({
    where: { ...baseWhere(tenantId), completedSessions: { gt: 5 } },
    select: { id: true },
    take: GROUP_BATCH,
  })
  return rows.map((row) => row.id)
}

/**
 * «بدهکاران» — an open balance past its due date, on `appt_tenant_status_sched_idx`
 * and `payment_tenant_customer_paid_idx`.
 *
 * The balance is computed by the same `payments` function the debt list computes it
 * from, because there is no stored balance to read (`03` §4.3) and a group that
 * disagreed with the desk's debt list would be two numbers the clinic cannot
 * reconcile. The due date is `debts`' effective one, so a promise the desk recorded
 * wins over arithmetic for the same reason it does on the reminder.
 */
async function debtors({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const settings = await readDebtSettings(tx, tenantId)

  const appointments = await tx.appointment.findMany({
    where: { tenantId, status: AppointmentStatus.Completed },
    select: {
      id: true,
      customerId: true,
      scheduledAt: true,
      priceAtBooking: true,
      debtDueDateOverride: true,
    },
    orderBy: { scheduledAt: 'asc' },
    take: GROUP_BATCH,
  })

  const ids = appointments.map((row) => row.id)
  const sums = ids.length
    ? await tx.payment.groupBy({
        by: ['appointmentId'],
        where: { tenantId, appointmentId: { in: ids } },
        _sum: { amount: true, discountAmount: true },
      })
    : []
  const byAppointment = new Map(sums.map((sum) => [sum.appointmentId, sum]))

  const debtors: string[] = []
  for (const row of appointments) {
    if (row.customerId === null) continue
    const sum = byAppointment.get(row.id)
    const { balance } = asBalance(
      row.priceAtBooking,
      sum?._sum.discountAmount ?? 0n,
      sum?._sum.amount ?? 0n,
    )
    if (balance <= 0n) continue

    const dueAt = effectiveDueInstant({
      scheduledAt: row.scheduledAt,
      override: row.debtDueDateOverride,
      graceDays: settings.debtGraceDays,
    })
    if (dueAt > now) continue

    debtors.push(row.customerId)
  }

  return unique(debtors)
}

/**
 * «تازه‌واردها» — first visit within the last ۳۰ days, on
 * `customer_tenant_firstvisit_idx`.
 */
async function newCustomers({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const rows = await tx.customer.findMany({
    where: {
      ...baseWhere(tenantId),
      firstVisitAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
    },
    select: { id: true },
    take: GROUP_BATCH,
  })
  return rows.map((row) => row.id)
}

/**
 * «دوره تکمیل شده» — a completed course whose last session is at least ۳۰ days
 * behind, on `cycle_tenant_completed_idx`.
 *
 * The ۳۰-day gap is what separates this group from «وفادارها»: a customer who just
 * finished a course is a customer whose next course is the desk's to suggest in
 * person, and a customer ۳۰ days past it is one the clinic has no reason to see again
 * unless it asks.
 */
async function completedCourse({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const cycles = await tx.treatmentCycle.findMany({
    where: {
      tenantId,
      status: CycleStatus.Completed,
      lastSessionAt: { lte: new Date(now.getTime() - 30 * DAY_MS) },
    },
    select: { customerId: true },
    take: GROUP_BATCH,
  })
  return unique(cycles.map((cycle) => cycle.customerId))
}

/**
 * «یک‌باری‌ها» — one session, and not seen for ۶۰ days, on
 * `customer_tenant_sessions_idx`.
 *
 * The specification's own note: this is the group clinics never see and usually their
 * largest — people who came once, were satisfied, and were never reminded. Two
 * conditions, because either alone is a different group: a one-session customer seen
 * yesterday is a customer mid-course, and a ۶۰-day absence with five sessions is
 * «خوابیده‌ها».
 */
async function oneTimers({ tx, tenantId, now }: EvaluatorArgs): Promise<readonly string[]> {
  const rows = await tx.customer.findMany({
    where: {
      ...baseWhere(tenantId),
      completedSessions: 1,
      lastVisitAt: { lt: new Date(now.getTime() - 60 * DAY_MS) },
    },
    select: { id: true },
    take: GROUP_BATCH,
  })
  return rows.map((row) => row.id)
}

/**
 * The eight, keyed as `AudienceGroupKey` is. A group's evaluator is looked up by its
 * key, which is what makes a built-in's stored predicate a name rather than a
 * serialized query plan.
 */
export const BUILT_IN_EVALUATORS: Readonly<Record<AudienceGroupKey, AudienceEvaluator>> = {
  BIRTHDAY: birthday,
  DORMANT: dormant,
  CYCLE_DUE: cycleDue,
  LOYAL: loyal,
  DEBTORS: debtors,
  NEW: newCustomers,
  COMPLETED_COURSE: completedCourse,
  ONE_TIMERS: oneTimers,
}

/**
 * Evaluates one of the eight by its key.
 *
 * @returns the customer ids, deduplicated. A customer may hold two completed courses
 *   or two open balances; they are one person, and a campaign addresses a person.
 */
export async function evaluateBuiltIn(
  key: AudienceGroupKey,
  args: EvaluatorArgs,
): Promise<readonly string[]> {
  return BUILT_IN_EVALUATORS[key](args)
}

/** Keeps one entry per customer, preserving the order the evaluator produced. */
function unique(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
