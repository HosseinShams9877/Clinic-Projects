/**
 * The four headline retention reports — return rate, average sessions, cycle
 * completion and no-show rate.
 *
 * Each is one count over one cohort, computed from the rows the tenant owns. No
 * report here joins `Payment`: `reports` is the module the specification keeps
 * financial figures out of, and retention is a property of attendance rather than
 * of money.
 */

import { AppointmentStatus, CycleStatus } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type {
  AverageSessionsReport,
  CycleCompletionReport,
  NoShowReport,
  ReportRange,
  ReturnRateReport,
} from '../types'
import { localDateWhere, readReportOffset, toInstantRange } from './range'

/** The columns a cohort read needs from a customer, and nothing else. */
const COHORT_SELECT = {
  id: true,
  completedSessions: true,
} as const

const CYCLE_SELECT = {
  id: true,
  status: true,
} as const

const APPOINTMENT_SELECT = {
  id: true,
  status: true,
} as const

/**
 * نرخ بازگشت — of the customers whose first visit falls in the range, the share
 * that came back for a second session.
 *
 * The cohort is `firstVisitAt`, not `createdAt`: a customer who was created as a
 * lead and never came in is not a retention failure, and counting them would
 * lower the rate by a person the clinic never treated.
 */
export async function returnRateReport(
  tx: TransactionClient,
  tenantId: string,
  range: ReportRange,
): Promise<ReturnRateReport> {
  const offset = await readReportOffset(tx, tenantId)
  const instants = toInstantRange(range, offset)

  const cohort = await tx.customer.findMany({
    where: {
      tenantId,
      firstVisitAt: { gte: instants.start, lt: instants.endExclusive },
    },
    select: COHORT_SELECT,
  })

  const total = cohort.length
  const returning = cohort.filter((row) => row.completedSessions >= 2).length

  return Object.freeze({
    totalCustomers: total,
    returningCustomers: returning,
    rate: total === 0 ? 0 : returning / total,
  })
}

/**
 * میانگین جلسات به ازای هر مشتری — the cohort's mean completed sessions.
 *
 * Over the customers who came in at least once, so the figure is the length of a
 * course of care rather than an average dragged down by a lead who never arrived.
 */
export async function averageSessionsReport(
  tx: TransactionClient,
  tenantId: string,
  range: ReportRange,
): Promise<AverageSessionsReport> {
  const offset = await readReportOffset(tx, tenantId)
  const instants = toInstantRange(range, offset)

  const cohort = await tx.customer.findMany({
    where: {
      tenantId,
      firstVisitAt: { gte: instants.start, lt: instants.endExclusive },
      completedSessions: { gt: 0 },
    },
    select: COHORT_SELECT,
  })

  return Object.freeze({
    customers: cohort.length,
    averageSessions:
      cohort.length === 0
        ? 0
        : cohort.reduce((sum, row) => sum + row.completedSessions, 0) / cohort.length,
  })
}

/**
 * نرخ تکمیل دوره — completed cycles over the cycles that reached an end.
 *
 * The denominator is the terminal pair rather than all cycles because an ACTIVE
 * cycle's outcome is not yet known; counting it would report a clinic's ongoing
 * care as abandonment.
 */
export async function cycleCompletionReport(
  tx: TransactionClient,
  tenantId: string,
  range: ReportRange,
): Promise<CycleCompletionReport> {
  const offset = await readReportOffset(tx, tenantId)
  const instants = toInstantRange(range, offset)

  const cycles = await tx.treatmentCycle.findMany({
    where: {
      tenantId,
      startedAt: { gte: instants.start, lt: instants.endExclusive },
      status: { in: [CycleStatus.Completed, CycleStatus.Abandoned] },
    },
    select: CYCLE_SELECT,
  })

  const completed = cycles.filter((row) => row.status === CycleStatus.Completed).length
  const abandoned = cycles.length - completed

  return Object.freeze({
    completed,
    abandoned,
    terminal: cycles.length,
    rate: cycles.length === 0 ? 0 : completed / cycles.length,
  })
}

/**
 * نرخ عدم حضور — no-shows over the sessions that had an outcome.
 *
 * A cancellation is neither: it is a session the clinic knew would not happen, and
 * counting it in the denominator would lower the rate for a clinic whose patients
 * cancel politely. The two statuses that remain are the two the desk's own outcome
 * recording writes.
 */
export async function noShowReport(
  tx: TransactionClient,
  tenantId: string,
  range: ReportRange,
): Promise<NoShowReport> {
  const appointments = await tx.appointment.findMany({
    where: {
      tenantId,
      localDate: localDateWhere(range),
      status: { in: [AppointmentStatus.Completed, AppointmentStatus.NoShow] },
    },
    select: APPOINTMENT_SELECT,
  })

  const noShows = appointments.filter((row) => row.status === AppointmentStatus.NoShow).length
  const completed = appointments.length - noShows

  return Object.freeze({
    completed,
    noShows,
    rate: appointments.length === 0 ? 0 : noShows / appointments.length,
  })
}
