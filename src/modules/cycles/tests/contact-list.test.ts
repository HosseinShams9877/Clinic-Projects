/**
 * The contact list and its exits — DoDs 4 and 6.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The two assertions that make a mock worthless are the ones this suite
 * exists for:
 *
 * - **DoD 4** — a customer appears on the list only after the due date passes with no
 *   future appointment, and booking removes them immediately. The second condition is
 *   the whole point: without it, anyone who already booked gets called anyway, which
 *   the specification calls "the fastest way to make the list worthless".
 * - **DoD 6** — an abandonment requires a reason from the closed list. The parameter's
 *   type is the union, so the check is unreachable from a caller that names a member —
 *   and reachable from the one that forwards a form's string, which is the caller the
 *   closed list exists for.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AbandonmentReason, CycleStatus, Permission, Role } from '@/core/constants'
import { CustomerLifecycle } from '@/core/constants'
import {
  addLocalDays,
  asLocalDate,
  asLocalTime,
  fromClockParts,
  toUtcInstant,
  type LocalDate,
} from '@/core/localization'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { abandonCycle } from '../lib/closure'
import { noteCycleBooking, refreshContactListForCycle } from '../lib/contact-list'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

/** The clinic's offset — Iran Standard Time, UTC+3:30 (`07-localization.md`). */
const UTC_OFFSET = 210

/** The day the first session is on, in the clinic's own clock. */
const SESSION_DAY = asLocalDate('1405-07-04')

/** The instant that session starts at, as the booking path stores it. */
const SESSION_AT = toUtcInstant(SESSION_DAY, asLocalTime('10:00'), UTC_OFFSET)

/** شنبه, the day the week starts on, so the seeded shift and hours cover it. */
const SESSION_WEEKDAY = 0

/** The interval the seeded service snapshots onto the cycle. */
const INTERVAL_DAYS = 14

const TENANT_ID: TenantId = asTenantId('tenant-a')
const CLINIC_ID = asClinicId('clinic-a')
const DOCTOR_ID: UserId = asUserId('doctor-a')
const CUSTOMER_ID = 'customer-a'
const SERVICE_ID = 'service-a'

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
    unscoped.doctorWorkingHours.deleteMany(),
    unscoped.clinicShift.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({ data: [{ id: TENANT_ID, slug: 'a', name: 'الف', isActive: true }] })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: UTC_OFFSET }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.clinicShift.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        weekday: SESSION_WEEKDAY,
        startTime: '09:00',
        endTime: '14:00',
      },
    ],
  })
  await unscoped.doctorWorkingHours.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        doctorId: DOCTOR_ID,
        weekday: SESSION_WEEKDAY,
        startTime: '09:00',
        endTime: '14:00',
      },
    ],
  })
  await unscoped.customer.createMany({
    data: [
      {
        id: CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000001',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
  await unscoped.service.createMany({
    data: [
      {
        id: SERVICE_ID,
        tenantId: TENANT_ID,
        name: 'خدمت الف',
        searchName: 'خدمت الف',
        category: 'عمومی',
        price: 1000000n,
        depositAmount: 200000n,
        durationMinutes: 30,
        defaultIntervalDays: INTERVAL_DAYS,
        defaultSessions: 6,
        isActive: true,
      },
    ],
  })

  // The cycle the two cases act on: one completed session, its due date ۱۴ days ahead,
  // and the customer not yet on the desk's list.
  await unscoped.treatmentCycle.create({
    data: {
      id: CYCLE_ID,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      intervalDays: INTERVAL_DAYS,
      totalSessions: 6,
      completedSessions: 1,
      currentSessionNumber: 2,
      startedAt: SESSION_AT,
      lastSessionAt: SESSION_AT,
      nextDueDate: toUtcInstant(addLocalDays(SESSION_DAY, INTERVAL_DAYS), MIDNIGHT, UTC_OFFSET),
      status: CycleStatus.Active,
      abandonmentReason: null,
      inContactList: false,
    },
  })
})

/** The cycle the suite's two cases read and write. */
const CYCLE_ID = 'cycle-a'

/** The day's own start, which is the time the due date's instant carries. */
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

/** A context the permission check accepts, for the role and permission a case names. */
function context(permissions: readonly Permission[] = []): TenantContext {
  return Object.freeze({
    userId: DOCTOR_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [...permissions], revoked: [] }),
  })
}

/** The recompute's arguments, as the three callers pass them. */
function refresh(now: Date) {
  return {
    tx: unscoped as never,
    tenantId: TENANT_ID,
    cycleId: CYCLE_ID,
    now,
  }
}

/** One future appointment for the cycle, as the booking path writes it. */
async function bookFuture(localDate: LocalDate) {
  await unscoped.appointment.create({
    data: {
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: CUSTOMER_ID,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      cycleId: CYCLE_ID,
      scheduledAt: toUtcInstant(localDate, asLocalTime('10:00'), UTC_OFFSET),
      localDate,
      localTime: asLocalTime('10:00'),
      durationMinutes: 30,
      status: 'BOOKED',
      source: 'RECEPTION',
      isSlotBlock: false,
      slotKey: toUtcInstant(localDate, asLocalTime('10:00'), UTC_OFFSET).toISOString(),
      priceAtBooking: 1000000n,
      depositAmount: 200000n,
      depositStatus: 'PENDING',
    },
  })
}

describe('the contact list', () => {
  it('enters the list only after the due date passes with no future appointment, and booking exits it', async () => {
    // DoD 4. The day before the due date the customer is not on the list, and the day
    // after they are — the clock moved and nobody opened a page.
    const dueDay = addLocalDays(SESSION_DAY, INTERVAL_DAYS)

    const before = await refreshContactListForCycle(refresh(atStartOf(addLocalDays(dueDay, -1))))
    expect(before).toBe(false)
    expect(await unscoped.treatmentCycle.findFirstOrThrow()).toMatchObject({
      inContactList: false,
      status: CycleStatus.Active,
    })

    const entered = await refreshContactListForCycle(refresh(atStartOf(dueDay)))
    expect(entered).toBe(true)
    const onList = await unscoped.treatmentCycle.findFirstOrThrow()
    expect(onList.inContactList).toBe(true)
    expect(onList.status).toBe(CycleStatus.Due)

    // A customer who already booked is the customer the list exists to *not* call: the
    // future appointment is rule 4's second condition, and it keeps them off the list
    // even on the day the clock reached.
    await bookFuture(addLocalDays(dueDay, 2))
    const stillDue = await refreshContactListForCycle(refresh(atStartOf(dueDay)))
    expect(stillDue).toBe(false)
    expect((await unscoped.treatmentCycle.findFirstOrThrow()).inContactList).toBe(false)

    // Rule 5's first exit, in the request that booked them. The new appointment *is*
    // the future appointment the rule looks for, so the flag is the one fact that
    // changed and the recompute is not needed here.
    await noteCycleBooking({ tx: unscoped as never, tenantId: TENANT_ID, cycleId: CYCLE_ID })
    expect((await unscoped.treatmentCycle.findFirstOrThrow()).inContactList).toBe(false)
  })

  it('refuses an abandonment reason the closed list does not hold', async () => {
    // DoD 6. The parameter is the union, so the call below is the one a form's string
    // makes — the reason the closed list exists, and the sentence names the list rather
    // than the invalidity. No free text reaches the column, and the cycle stays open
    // because the write did not happen.
    await expect(
      abandonCycle({
        tx: unscoped as never,
        ctx: context(),
        cycleId: CYCLE_ID,
        reason: 'ارزش زیادی داشت' as AbandonmentReason,
        now: atStartOf(SESSION_DAY),
      }),
    ).rejects.toMatchObject({ messageKey: 'cycle.reasonNotFromList' })

    const row = await unscoped.treatmentCycle.findFirstOrThrow()
    expect(row.status).toBe(CycleStatus.Active)
    expect(row.abandonmentReason).toBeNull()
    expect(row.inContactList).toBe(false)

    // A reason from the list closes the course and keeps the row, because the drop-off
    // report counts it.
    await abandonCycle({
      tx: unscoped as never,
      ctx: context(),
      cycleId: CYCLE_ID,
      reason: AbandonmentReason.Price,
      now: atStartOf(SESSION_DAY),
    })
    const closed = await unscoped.treatmentCycle.findFirstOrThrow()
    expect(closed.status).toBe(CycleStatus.Abandoned)
    expect(closed.abandonmentReason).toBe(AbandonmentReason.Price)
    expect(closed.inContactList).toBe(false)
  })
})

/** The instant one of the suite's days starts at, in the clinic's own clock. */
function atStartOf(localDate: LocalDate): Date {
  return toUtcInstant(localDate, MIDNIGHT, UTC_OFFSET)
}
