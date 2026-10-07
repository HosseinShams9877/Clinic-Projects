/**
 * مقایسه پزشکان — one row per doctor, on attendance and cycle outcomes.
 *
 * The comparison deliberately carries no money. A per-doctor revenue figure is the
 * one report this module exists not to have: it invites a clinic to pay a doctor by
 * it, which is a financial decision the product does not feed. What is here is
 * attendance and care — how many sessions a doctor completed, how often their
 * patients did not come, and how often their courses finished.
 */

import { AppointmentStatus, CycleStatus, Role } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type {
  DoctorComparisonReport,
  DoctorComparisonRow,
  ReportRange,
} from '../types'
import { localDateWhere, readReportOffset, toInstantRange } from './range'

/** The columns a doctor's name comes from. */
const DOCTOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} as const

const APPOINTMENT_SELECT = {
  doctorId: true,
  status: true,
} as const

const CYCLE_SELECT = {
  doctorId: true,
  status: true,
} as const

/** The statuses that keep a cycle's outcome open. */
const ACTIVE_CYCLE_STATUSES = [CycleStatus.Active, CycleStatus.Due, CycleStatus.AtRisk] as const

/**
 * The doctors of the tenant, in the order the membership list holds them.
 *
 * Doctors only, because the report is about care delivered: a secretary's name here
 * would be a row of zeros, and a manager's would be a row about nobody's patients.
 */
export async function doctorComparisonReport(
  tx: TransactionClient,
  tenantId: string,
  range: ReportRange,
): Promise<DoctorComparisonReport> {
  const offset = await readReportOffset(tx, tenantId)
  const instants = toInstantRange(range, offset)

  const [doctors, appointments, cycles] = await Promise.all([
    tx.user.findMany({
      where: {
        tenantId,
        memberships: { some: { role: Role.Doctor, isActive: true } },
        isActive: true,
      },
      select: DOCTOR_SELECT,
      orderBy: { firstName: 'asc' },
    }),
    tx.appointment.findMany({
      where: {
        tenantId,
        localDate: localDateWhere(range),
        status: { in: [AppointmentStatus.Completed, AppointmentStatus.NoShow] },
      },
      select: APPOINTMENT_SELECT,
    }),
    tx.treatmentCycle.findMany({
      where: { tenantId, startedAt: { gte: instants.start, lt: instants.endExclusive } },
      select: CYCLE_SELECT,
    }),
  ])

  const rows = doctors.map((doctor) => {
    const mine = appointments.filter((row) => row.doctorId === doctor.id)
    const completed = mine.filter((row) => row.status === AppointmentStatus.Completed).length
    const noShows = mine.length - completed

    const myCycles = cycles.filter((row) => row.doctorId === doctor.id)
    const completedCycles = myCycles.filter((row) => row.status === CycleStatus.Completed).length
    const abandonedCycles = myCycles.filter((row) => row.status === CycleStatus.Abandoned).length
    const terminal = completedCycles + abandonedCycles

    return {
      doctorId: doctor.id,
      doctorName: [doctor.firstName, doctor.lastName].filter((part) => part !== null).join(' '),
      completedSessions: completed,
      noShows,
      noShowRate: mine.length === 0 ? 0 : noShows / mine.length,
      activeCycles: myCycles.filter((row) =>
        (ACTIVE_CYCLE_STATUSES as readonly string[]).includes(row.status),
      ).length,
      completedCycles,
      abandonedCycles,
      cycleCompletionRate: terminal === 0 ? 0 : completedCycles / terminal,
    } satisfies DoctorComparisonRow
  })

  return Object.freeze({ doctors: rows })
}
