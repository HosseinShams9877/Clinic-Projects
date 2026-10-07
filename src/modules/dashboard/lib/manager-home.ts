/**
 * The manager's home — `02-architecture.md` §7's «داشبورد من」, the surface
 * `admin/dashboard.html` renders.
 *
 * The counts are the day's own and the month's own, and none of them is money: the
 * manager's home is where the day is sized, and a financial figure here would be the
 * one screen in the product that shows revenue to a role that has the whole matrix.
 * The debt count is a count of customers, not a sum.
 */

import type { LocalDate } from '@/core/localization'
import { addLocalDays } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'

import { localDateWhere, monthStartOf, readReportOffset, toInstantRange } from '@/modules/reports'
import { AppointmentStatus, CycleStatus } from '@/core/constants'

/** The columns the day's appointment counts read. */
const APPOINTMENT_SELECT = {
  id: true,
  status: true,
} as const

/**
 * The manager's home: the day ahead, the month's retention, and the queues that need
 * a person.
 */
export interface ManagerHome {
  readonly today: {
    readonly total: number
    readonly completed: number
    readonly noShows: number
    readonly awaitingArrival: number
  }
  readonly month: {
    readonly newCustomers: number
    readonly cyclesCompleted: number
    readonly cyclesAbandoned: number
  }
  /** The cycles whose next session is overdue, which is the queue the sweep raises. */
  readonly overdueCycles: number
  /** The customers the win-back campaign is aimed at. */
  readonly dormantCustomers: number
}

/**
 * «داشبورد من」 — the manager's own view of the clinic.
 *
 * Takes the day the caller resolved rather than reading the clock, so the home is
 * about the day the request is in and a test can be about any day.
 */
export async function readManagerHome(
  tx: TransactionClient,
  tenantId: string,
  today: LocalDate,
): Promise<ManagerHome> {
  const offset = await readReportOffset(tx, tenantId)
  const month = toInstantRange({ from: monthStartOf(today), to: today }, offset)

  const [appointments, newCustomers, cycles, overdueCycles, dormantCustomers] =
    await Promise.all([
      tx.appointment.findMany({
        where: { tenantId, localDate: localDateWhere({ from: today, to: today }) },
        select: APPOINTMENT_SELECT,
      }),
      tx.customer.count({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { firstVisitAt: { gte: month.start, lt: month.endExclusive } },
            { createdAt: { gte: month.start, lt: month.endExclusive } },
          ],
        },
      }),
      tx.treatmentCycle.findMany({
        where: {
          tenantId,
          startedAt: { gte: month.start, lt: month.endExclusive },
          status: { in: [CycleStatus.Completed, CycleStatus.Abandoned] },
        },
        select: { status: true },
      }),
      tx.treatmentCycle.count({
        where: {
          tenantId,
          status: { in: [CycleStatus.Active, CycleStatus.Due, CycleStatus.AtRisk] },
          nextDueDate: { lt: toInstantRange({ from: today, to: today }, offset).endExclusive },
        },
      }),
      tx.customer.count({
        where: {
          tenantId,
          isActive: true,
          completedSessions: { gt: 0 },
          lastVisitAt: { lt: dormantBefore(today, offset) },
        },
      }),
    ])

  const completed = appointments.filter((row) => row.status === AppointmentStatus.Completed).length
  const noShows = appointments.filter((row) => row.status === AppointmentStatus.NoShow).length
  const awaitingArrival = appointments.filter(
    (row) => row.status === AppointmentStatus.AwaitingArrival || row.status === AppointmentStatus.Arrived,
  ).length

  return Object.freeze({
    today: { total: appointments.length, completed, noShows, awaitingArrival },
    month: {
      newCustomers,
      cyclesCompleted: cycles.filter((row) => row.status === CycleStatus.Completed).length,
      cyclesAbandoned: cycles.filter((row) => row.status === CycleStatus.Abandoned).length,
    },
    overdueCycles,
    dormantCustomers,
  })
}

/** The instant before which a customer is «خوابیده」 — ۹۰ days back, per the group. */
function dormantBefore(today: LocalDate, offset: number): Date {
  const ninetyBack = addLocalDays(today, -90)
  return toInstantRange({ from: ninetyBack, to: ninetyBack }, offset).start
}
