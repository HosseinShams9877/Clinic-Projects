/**
 * DoD 1 — the eight built-in groups evaluate to the correct sets on a seeded dataset.
 *
 * Each group gets the one customer its definition selects and no other, and the dataset
 * holds a customer beside each one that differs from the member by the one condition the
 * group is about: a customer born in another month, a customer who is inactive, a lead,
 * and a customer inside every group's own boundary. A group that returned its neighbour
 * is a group the campaign sends the wrong people, and a group that returned nothing is a
 * group the campaign cannot send at all — the dataset is built so both failures are
 * named by the assertion that catches them.
 *
 * The eight are read through `evaluateGroup`, which is the one place a predicate becomes
 * a set, so the sets here are the sets a campaign's dispatch and a builder's preview both
 * read (`03-data-model.md` Decision 3).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AppointmentStatus,
  AudienceGroupKey,
  CycleStatus,
  CustomerLifecycle,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  ensureBuiltInGroups,
  evaluateGroup,
  listAudienceGroups,
} from '@/modules/audience-groups'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-audience')
const CLINIC_ID = asClinicId('clinic-audience')
const STAFF_ID: UserId = asUserId('staff-audience')
const SERVICE_ID = 'service-audience'
const DOCTOR_ID = asUserId('doctor-audience')

/**
 * ۱۴۰۵-۰۷-۱۴ — the seeded day, in مهر, so the birthday group is the current month's
 * and the relative windows land on whole days.
 */
const NOW = new Date('2026-10-06T10:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

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
    unscoped.treatmentCycle.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.payment.deleteMany(),
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.audienceGroup.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'audience', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000040',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: STAFF_ID,
        tenantId: TENANT_ID,
        mobile: '09120000041',
        firstName: 'پذیرش',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.service.createMany({
    data: [
      {
        id: SERVICE_ID,
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        name: 'خدمت الف',
        searchName: 'خدمت الف',
        category: 'عمومی',
        price: 500_000n,
        depositAmount: 0n,
        durationMinutes: 30,
      },
    ],
  })

  await unscoped.customer.createMany({
    data: [
      // «متولدین این ماه» — born in مهر.
      customer('birthday', { birthMonth: 7 }),
      // Born in فروردین, which the group must not reach.
      customer('birthday-other-month', { birthMonth: 1 }),
      // «خوابیده‌ها» — three sessions, last visit ۱۲۰ days ago.
      customer('dormant', { completedSessions: 3, lastVisitAt: daysAgo(120) }),
      // «وفادارها» — eight sessions, and the newest customer the group ignores.
      customer('loyal', { completedSessions: 8, lastVisitAt: daysAgo(10), firstVisitAt: daysAgo(400) }),
      // «تازه‌واردها» — first visit ten days ago.
      customer('new', { firstVisitAt: daysAgo(10) }),
      // «یک‌باری‌ها» — one session, sixty-one days ago.
      customer('one-timer', { completedSessions: 1, lastVisitAt: daysAgo(61) }),
      // Three sessions but seen yesterday — neither one-timer nor dormant.
      customer('mid-course', { completedSessions: 3, lastVisitAt: daysAgo(1) }),
      // An inactive customer and a lead, which no group may select.
      customer('inactive', { isActive: false, completedSessions: 8 }),
      customer('lead', { lifecycle: CustomerLifecycle.Lead }),
      // The three customers whose cycles a cross-table group selects on, created here
      // so the cycles below have a row to point at.
      customer('cycle-due', { completedSessions: 3, lastVisitAt: daysAgo(33) }),
      customer('cycle-booked', { completedSessions: 3, lastVisitAt: daysAgo(33) }),
      // Zero sessions: the group reads the cycle, and a customer with six would also be
      // «وفادارها», which is the overlap the seeded dataset exists to keep apart.
      customer('completed-course', { completedSessions: 0, lastVisitAt: daysAgo(40) }),
    ],
  })

  // «موعد رسیده» — an open cycle past its due date with no future appointment.
  await unscoped.treatmentCycle.create({
    data: {
      id: 'cycle-due',
      tenantId: TENANT_ID,
      customerId: customerId('cycle-due'),
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      status: CycleStatus.Active,
      startedAt: daysAgo(200),
      intervalDays: 28,
      totalSessions: 6,
      nextDueDate: daysAgo(5),
      lastSessionAt: daysAgo(33),
    },
  })

  // A cycle already booked — the group's second condition, and the reason it exists.
  await unscoped.treatmentCycle.create({
    data: {
      id: 'cycle-booked',
      tenantId: TENANT_ID,
      customerId: customerId('cycle-booked'),
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      status: CycleStatus.Active,
      startedAt: daysAgo(200),
      intervalDays: 28,
      totalSessions: 6,
      nextDueDate: daysAgo(5),
      lastSessionAt: daysAgo(33),
    },
  })
  await unscoped.appointment.create({
    data: {
      id: 'appointment-booked',
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: customerId('cycle-booked'),
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      cycleId: 'cycle-booked',
      scheduledAt: daysAhead(3),
      localDate: '1405-07-17',
      localTime: '10:00',
      durationMinutes: 30,
      status: AppointmentStatus.Booked,
      source: 'RECEPTION',
      priceAtBooking: 500_000n,
      depositAmount: 0n,
      createdAt: daysAgo(1),
    },
  })

  // «دوره تکمیل شده» — a completed course whose last session is forty days behind.
  await unscoped.treatmentCycle.create({
    data: {
      id: 'cycle-completed',
      tenantId: TENANT_ID,
      customerId: customerId('completed-course'),
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      status: CycleStatus.Completed,
      startedAt: daysAgo(300),
      intervalDays: 28,
      totalSessions: 6,
      nextDueDate: null,
      lastSessionAt: daysAgo(40),
    },
  })

  // «بدهکاران» — a completed appointment with an open balance past its due date.
  await unscoped.customer.createMany({
    data: [customer('debtor', { completedSessions: 1, lastVisitAt: daysAgo(60) })],
  })
  await unscoped.appointment.create({
    data: {
      id: 'appointment-debtor',
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: customerId('debtor'),
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      scheduledAt: daysAgo(60),
      localDate: '1405-05-15',
      localTime: '10:00',
      durationMinutes: 30,
      status: AppointmentStatus.Completed,
      source: 'RECEPTION',
      priceAtBooking: 500_000n,
      depositAmount: 0n,
      createdAt: daysAgo(61),
    },
  })
})

/** The eight groups, evaluated against the seeded dataset. */
describe('DoD 1 — all 8 audience groups evaluate to the correct sets', () => {
  it('selects exactly one customer per group and nobody else', async () => {
    const groups = await ensureBuiltInGroups({
      tx: unscoped as never,
      tenantId: TENANT_ID,
    })
    expect(groups).toHaveLength(8)

    const byKey = new Map(
      groups.map((group) => [group.key, group.id] as const),
    )

    const expected: ReadonlyArray<readonly [AudienceGroupKey, string]> = [
      [AudienceGroupKey.Birthday, customerId('birthday')],
      [AudienceGroupKey.Dormant, customerId('dormant')],
      [AudienceGroupKey.CycleDue, customerId('cycle-due')],
      [AudienceGroupKey.Loyal, customerId('loyal')],
      [AudienceGroupKey.Debtors, customerId('debtor')],
      [AudienceGroupKey.New, customerId('new')],
      [AudienceGroupKey.CompletedCourse, customerId('completed-course')],
      [AudienceGroupKey.OneTimers, customerId('one-timer')],
    ]

    for (const [key, expectedId] of expected) {
      const groupId = byKey.get(key)
      expect(groupId, `group ${key} should have been seeded`).toBeDefined()

      const evaluated = await evaluateGroup({
        tx: unscoped as never,
        tenantId: TENANT_ID,
        predicate: { kind: 'BUILT_IN', key },
        now: NOW,
      })

      // The group's own member and nobody else's — a neighbour in the set is the
      // failure the seeded dataset exists to name.
      expect(evaluated, `${key} should select ${expectedId}`).toContain(expectedId)
      expect(evaluated, `${key} should select nobody else`).toHaveLength(1)
    }
  })

  it('excludes the inactive customer and the lead from every group', async () => {
    const groups = await listAudienceGroups(unscoped as never, TENANT_ID)
    for (const group of groups) {
      const evaluated = await evaluateGroup({
        tx: unscoped as never,
        tenantId: TENANT_ID,
        predicate: group.predicate,
        now: NOW,
      })
      expect(evaluated).not.toContain(customerId('inactive'))
      expect(evaluated).not.toContain(customerId('lead'))
    }
  })

  it('excludes a cycle whose customer already booked', async () => {
    const evaluated = await evaluateGroup({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      predicate: { kind: 'BUILT_IN', key: AudienceGroupKey.CycleDue },
      now: NOW,
    })
    expect(evaluated).not.toContain(customerId('cycle-booked'))
  })
})

/* ── the dataset's own helpers ─────────────────────────────────────────────── */

/** One customer's id, derived from the slug the dataset names them by. */
function customerId(slug: string): string {
  return `customer-${slug}`
}

/** `n` days before the seeded day, as the instant a column holds. */
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS)
}

/** `n` days after the seeded day. */
function daysAhead(n: number): Date {
  return new Date(NOW.getTime() + n * DAY_MS)
}

/**
 * One customer, on the columns the groups read, with the base every group shares.
 *
 * The mobile is a per-call sequence rather than a hash of the slug, because the schema
 * holds a uniqueness on `(tenantId, mobile)` and slugs of the same length collide.
 */
let mobileSequence = 0
function customer(
  slug: string,
  facts: {
    readonly birthMonth?: number
    readonly completedSessions?: number
    readonly lastVisitAt?: Date
    readonly firstVisitAt?: Date
    readonly isActive?: boolean
    readonly lifecycle?: CustomerLifecycle
  },
) {
  return {
    id: customerId(slug),
    tenantId: TENANT_ID,
    mobile: `0913${(mobileSequence += 1).toString().padStart(3, '0')}0000`,
    firstName: `مشتری ${slug}`,
    searchName: `مشتری ${slug}`,
    lifecycle: facts.lifecycle ?? CustomerLifecycle.Customer,
    isActive: facts.isActive ?? true,
    birthMonth: facts.birthMonth ?? null,
    completedSessions: facts.completedSessions ?? 0,
    lastVisitAt: facts.lastVisitAt ?? null,
    firstVisitAt: facts.firstVisitAt ?? null,
  }
}
