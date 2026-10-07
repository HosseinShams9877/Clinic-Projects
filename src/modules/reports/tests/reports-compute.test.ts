/**
 * The seven reports compute from real rows — Phase 10's first test.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." Each report is seeded a dataset whose counts are readable by hand and
 * asserted as the numbers they are, so a report that drifted from the rows — a cohort
 * filter changed, a denominator widened, a range end made exclusive when it was
 * inclusive — is a number here that no longer matches the one the rows force.
 *
 * The dataset is one Jalali month, and the month is the range: `1405-07-01` to
 * `1405-07-30`, both ends inclusive, which is the convention `localDateWhere` keeps.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentStatus, CustomerLifecycle, CycleStatus, Role } from '@/core/constants'
import {
  asLocalDate,
  asLocalTime,
  diffLocalDays,
  toUtcInstant,
  type LocalDate,
} from '@/core/localization'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  averageSessionsReport,
  cycleCompletionReport,
  doctorComparisonReport,
  dropOffCurveReport,
  lastVisitDistributionReport,
  noShowReport,
  returnRateReport,
} from '../index'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

/** The clinic's offset — Iran Standard Time, UTC+3:30 (`07-localization.md`). */
const UTC_OFFSET = 210

/** The month every report covers, as the page's default range would name it. */
const FROM = asLocalDate('1405-07-01')
const TO = asLocalDate('1405-07-30')

/** The clinic-local day the last-visit distribution is relative to. */
const AS_OF = asLocalDate('1405-07-20')

/** The instant `AS_OF` noon, as the report's `now` parameter takes it. */
const AS_OF_AT = toUtcInstant(AS_OF, asLocalTime('12:00'), UTC_OFFSET)

const TENANT_ID: TenantId = asTenantId('tenant-reports')
const CLINIC_ID = asClinicId('clinic-reports')
const DOCTOR_ID: UserId = asUserId('doctor-reports')

/** The instant a clinic-local day starts at, as the seeded instants need it. */
function instantOf(day: string, time = '10:00'): Date {
  return toUtcInstant(asLocalDate(day), asLocalTime(time), UTC_OFFSET)
}

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.appointment.deleteMany(),
    unscoped.treatmentCycle.deleteMany(),
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'reports', name: 'کلینیک گزارش', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک گزارش', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: UTC_OFFSET }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000007',
        firstName: 'پزشک',
        lastName: 'گزارش',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.membership.createMany({
    data: [{ userId: DOCTOR_ID, tenantId: TENANT_ID, role: Role.Doctor, isActive: true }],
  })

  // The service the four cycles are courses of. Its own values are not read by any of
  // the seven — a cycle is counted by its status and its sessions — but the cycles
  // reference it, and the report's rows are the report's own.
  await unscoped.service.createMany({
    data: [
      {
        id: 'svc',
        tenantId: TENANT_ID,
        name: 'خدمت گزارش',
        searchName: 'خدمت گزارش',
        category: 'عمومی',
        price: 1000000n,
        depositAmount: 0n,
        durationMinutes: 30,
        defaultIntervalDays: 14,
        defaultSessions: 6,
        isActive: true,
      },
    ],
  })

  // Four customers: three whose first visit is in the month, one who predates it.
  // `c1` is the one who came back; `c3` arrived but completed nothing; `c4` is
  // outside the cohort the retention reports count.
  await unscoped.customer.createMany({
    data: [
      {
        id: 'c1',
        tenantId: TENANT_ID,
        mobile: '09130000001',
        firstName: 'بازگشته',
        searchName: 'بازگشته',
        lifecycle: CustomerLifecycle.Customer,
        firstVisitAt: instantOf('1405-07-02'),
        lastVisitAt: instantOf('1405-07-18'),
        completedSessions: 3,
        isActive: true,
      },
      {
        id: 'c2',
        tenantId: TENANT_ID,
        mobile: '09130000002',
        firstName: 'یک‌بار',
        searchName: 'یک‌بار',
        lifecycle: CustomerLifecycle.Customer,
        firstVisitAt: instantOf('1405-07-05'),
        lastVisitAt: instantOf('1405-06-10'),
        completedSessions: 1,
        isActive: true,
      },
      {
        id: 'c3',
        tenantId: TENANT_ID,
        mobile: '09130000003',
        firstName: 'تازه',
        searchName: 'تازه',
        lifecycle: CustomerLifecycle.Customer,
        firstVisitAt: instantOf('1405-07-09'),
        lastVisitAt: instantOf('1405-04-20'),
        completedSessions: 0,
        isActive: true,
      },
      {
        id: 'c4',
        tenantId: TENANT_ID,
        mobile: '09130000004',
        firstName: 'قدیمی',
        searchName: 'قدیمی',
        lifecycle: CustomerLifecycle.Customer,
        firstVisitAt: instantOf('1405-03-01'),
        lastVisitAt: instantOf('1404-12-01'),
        completedSessions: 5,
        isActive: true,
      },
    ],
  })

  // Four cycles: two finished, one abandoned, one still active. The active one is in
  // the curve and the doctor's `activeCycles`, and deliberately not in the
  // completion report, because its outcome is not known.
  await unscoped.treatmentCycle.createMany({
    data: [
      {
        id: 'cy1',
        tenantId: TENANT_ID,
        customerId: 'c1',
        serviceId: 'svc',
        doctorId: DOCTOR_ID,
        intervalDays: 14,
        totalSessions: 6,
        completedSessions: 4,
        startedAt: instantOf('1405-07-02'),
        status: CycleStatus.Completed,
      },
      {
        id: 'cy2',
        tenantId: TENANT_ID,
        customerId: 'c2',
        serviceId: 'svc',
        doctorId: DOCTOR_ID,
        intervalDays: 14,
        totalSessions: 6,
        completedSessions: 2,
        startedAt: instantOf('1405-07-05'),
        status: CycleStatus.Completed,
      },
      {
        id: 'cy3',
        tenantId: TENANT_ID,
        customerId: 'c3',
        serviceId: 'svc',
        doctorId: DOCTOR_ID,
        intervalDays: 14,
        totalSessions: 6,
        completedSessions: 1,
        startedAt: instantOf('1405-07-09'),
        status: CycleStatus.Abandoned,
      },
      {
        id: 'cy4',
        tenantId: TENANT_ID,
        customerId: 'c4',
        serviceId: 'svc',
        doctorId: DOCTOR_ID,
        intervalDays: 14,
        totalSessions: 6,
        completedSessions: 6,
        startedAt: instantOf('1405-07-12'),
        status: CycleStatus.Active,
      },
    ],
  })

  // Four appointments with an outcome, one cancellation the no-show report does not
  // count, and one from another tenant that none of the seven count.
  await unscoped.appointment.createMany({
    data: [
      appointment('a1', '1405-07-02', AppointmentStatus.Completed),
      appointment('a2', '1405-07-05', AppointmentStatus.Completed),
      appointment('a3', '1405-07-09', AppointmentStatus.NoShow),
      appointment('a4', '1405-07-12', AppointmentStatus.Cancelled),
    ],
  })
})

/** One appointment on a day of the month, for the doctor the comparison reports. */
function appointment(id: string, day: string, status: string) {
  return {
    id,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    doctorId: DOCTOR_ID,
    scheduledAt: instantOf(day as LocalDate),
    localDate: day,
    localTime: '10:00',
    durationMinutes: 30,
    status,
  }
}

describe('the seven reports over one seeded month', () => {
  it('count the cohort that first visited in the range', async () => {
    const report = await returnRateReport(unscoped, TENANT_ID, { from: FROM, to: TO })

    expect(report).toStrictEqual({
      totalCustomers: 3,
      returningCustomers: 1,
      rate: 1 / 3,
    })
  })

  it('average the sessions of the cohort that came in at least once', async () => {
    const report = await averageSessionsReport(unscoped, TENANT_ID, { from: FROM, to: TO })

    expect(report).toStrictEqual({ averageSessions: 2, customers: 2 })
  })

  it('complete cycles over the ones that reached an end', async () => {
    const report = await cycleCompletionReport(unscoped, TENANT_ID, { from: FROM, to: TO })

    expect(report).toStrictEqual({
      completed: 2,
      abandoned: 1,
      terminal: 3,
      rate: 2 / 3,
    })
  })

  it('count no-shows over the sessions that had an outcome', async () => {
    const report = await noShowReport(unscoped, TENANT_ID, { from: FROM, to: TO })

    expect(report).toStrictEqual({ completed: 2, noShows: 1, rate: 1 / 3 })
  })

  it('build the drop-off curve from every cycle the month started', async () => {
    const report = await dropOffCurveReport(unscoped, TENANT_ID, { from: FROM, to: TO })

    expect(report.cycles).toBe(4)
    expect(report.points.map((point) => [point.sessionNumber, point.count, point.rate])).toStrictEqual(
      [
        [1, 4, 1],
        [2, 3, 3 / 4],
        [3, 2, 1 / 2],
        [4, 2, 1 / 2],
        [5, 1, 1 / 4],
        [6, 1, 1 / 4],
      ],
    )
  })

  it('bucket the customers by the days since their last visit', async () => {
    const report = await lastVisitDistributionReport(unscoped, TENANT_ID, AS_OF_AT)

    expect(report.asOf).toBe(AS_OF)

    // The four customers' gaps, hand-checked against the Jalali calendar — its first
    // six months are ۳۱ days, so the gaps are ۲, ۴۱ and ۹۳ days, and the fourth is a
    // date in the previous year.
    expect(diffLocalDays(AS_OF, asLocalDate('1405-07-18'))).toBe(2)
    expect(diffLocalDays(AS_OF, asLocalDate('1405-06-10'))).toBe(41)
    expect(diffLocalDays(AS_OF, asLocalDate('1405-04-20'))).toBe(93)

    expect(report.buckets.map((row) => [row.bucket, row.count])).toStrictEqual([
      ['WITHIN_30', 1],
      ['DAYS_31_TO_60', 1],
      ['DAYS_61_TO_90', 0],
      ['DAYS_91_TO_180', 1],
      ['BEYOND_180', 1],
    ])
  })

  it('compare the doctor the month saw', async () => {
    const report = await doctorComparisonReport(unscoped, TENANT_ID, { from: FROM, to: TO })

    expect(report.doctors).toStrictEqual([
      {
        doctorId: DOCTOR_ID,
        doctorName: 'پزشک گزارش',
        completedSessions: 2,
        noShows: 1,
        noShowRate: 1 / 3,
        activeCycles: 1,
        completedCycles: 2,
        abandonedCycles: 1,
        cycleCompletionRate: 2 / 3,
      },
    ])
  })
})
