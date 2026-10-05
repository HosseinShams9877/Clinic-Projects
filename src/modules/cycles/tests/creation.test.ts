/**
 * Cycle creation and the due date — DoDs 1, 2 and 3.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The three assertions that make a mock worthless are the ones this suite
 * exists for:
 *
 * - **DoD 1** — a cycle is created exactly once, on the transition to `COMPLETED`, and
 *   never on booking or arrival, including a completion recorded twice. The counts are
 *   derived from the rows, so a retry counts the same rows and nothing moves.
 * - **DoD 2** — `nextDueDate` is `lastSessionAt + intervalDays` across a month
 *   boundary. The due date is stored as an instant at the day's own start in the
 *   clinic's clock, so the assertion reads it back through the library's own
 *   conversion and not through arithmetic on the instant.
 * - **DoD 3** — changing a service's default interval does not move an existing cycle.
 *   The interval is snapshotted onto the row at creation, and the course keeps its own
 *   spacing for the rest of its sessions.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentStatus, CycleStatus, Permission, Role } from '@/core/constants'
import { CustomerLifecycle } from '@/core/constants'
import {
  addLocalDays,
  asLocalDate,
  asLocalTime,
  fromUtcInstant,
  jalaliParts,
  toUtcInstant,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { recordCompletedSession } from '../lib/creation'
import { bookAppointment } from '@/modules/appointments/lib/book'
import { recordArrival } from '@/modules/appointments/lib/transition'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

/** The clinic's offset — Iran Standard Time, UTC+3:30 (`07-localization.md`). */
const UTC_OFFSET = 210

/** A Wednesday in ۱۴۰۵, as the day every slot below is on. */
const DAY = asLocalDate('1405-07-04')

/** The weekday of that day — شنبه, the day the week starts on — which the shift and hours are seeded for. */
const DAY_WEEKDAY = 0

/** The slot a session is booked into, inside the seeded ۰۹ تا ۱۴ range. */
const SLOT = asLocalTime('10:00')

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
        weekday: DAY_WEEKDAY,
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
        weekday: DAY_WEEKDAY,
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
        defaultIntervalDays: 14,
        defaultSessions: 6,
        isActive: true,
      },
    ],
  })
})

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

/** The arguments every booking below shares, with the slot a case varies. */
function bookArgs(patch: { readonly localDate?: LocalDate; readonly localTime?: LocalTime } = {}) {
  return {
    tx: unscoped as never,
    ctx: context(),
    clinicId: CLINIC_ID,
    doctorId: DOCTOR_ID,
    customerId: CUSTOMER_ID,
    serviceId: SERVICE_ID,
    localDate: patch.localDate ?? DAY,
    localTime: patch.localTime ?? SLOT,
    durationMinutes: 30,
    priceAtBooking: 1000000n,
    depositAmount: 200000n,
    source: 'RECEPTION',
  }
}

/** The facts a completed session carries, as the appointments module hands them over. */
function factsFor(appointmentId: string, scheduledAt: Date) {
  return {
    tx: unscoped as never,
    ctx: context(),
    facts: {
      appointmentId,
      customerId: CUSTOMER_ID,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      scheduledAt,
    },
    now: scheduledAt,
  }
}

/**
 * A booking the desk recorded a result for, as the appointments module hands it over.
 *
 * `recordCompletedSession` is the *consequence* of the transition the caller already
 * gated and performed, so the helper writes the `COMPLETED` row the module counts and
 * hands the facts across — the same handoff `recordResultAction` makes, and the reason
 * the cycle's counts are derived from rows rather than incremented here.
 */
async function completeSlot(patch: { readonly localDate?: LocalDate; readonly localTime?: LocalTime } = {}) {
  const booked = await bookAppointment(bookArgs(patch))
  const scheduledAt = toUtcInstant(patch.localDate ?? DAY, patch.localTime ?? SLOT, UTC_OFFSET)
  await unscoped.appointment.update({
    where: { id: booked.id },
    data: { status: AppointmentStatus.Completed, resultRecordedAt: scheduledAt },
  })
  return { booked, scheduledAt }
}

describe('recordCompletedSession', () => {
  it('creates the cycle once on the completion, and not on booking or arrival', async () => {
    // DoD 1. The two transitions the desk records first are the two the specification
    // names as the wrong moment, and a cycle on either is a list full of people whose
    // session never happened.
    const booked = await bookAppointment(bookArgs())
    await recordArrival({
      tx: unscoped as never,
      ctx: context(),
      appointmentId: booked.id,
      now: new Date('2026-09-30T10:00:00Z'),
    })
    expect(await unscoped.treatmentCycle.count()).toBe(0)

    const scheduledAt = toUtcInstant(DAY, SLOT, UTC_OFFSET)
    await recordCompletedSession(factsFor(booked.id, scheduledAt))
    expect(await unscoped.treatmentCycle.count()).toBe(1)

    const cycle = await unscoped.treatmentCycle.findFirstOrThrow()
    expect(cycle).toMatchObject({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      intervalDays: 14,
      totalSessions: 6,
      completedSessions: 1,
      currentSessionNumber: 2,
      status: CycleStatus.Active,
    })
    expect(cycle.startedAt.toISOString()).toBe(scheduledAt.toISOString())

    // A completion recorded twice is one session, because the counts are derived from
    // the cycle's own rows and the retry counts the same rows.
    await recordCompletedSession(factsFor(booked.id, scheduledAt))
    expect(await unscoped.treatmentCycle.count()).toBe(1)
    const retried = await unscoped.treatmentCycle.findFirstOrThrow()
    expect(retried.completedSessions).toBe(1)
    expect(retried.currentSessionNumber).toBe(2)
    expect(retried.startedAt.toISOString()).toBe(scheduledAt.toISOString())
  })

  it('computes the due date as the last session plus the interval, across a month boundary', async () => {
    // DoD 2. The course's sessions are on ۱۴۰۵/۰۷/۰۴, ۱۴۰۵/۰۷/۱۸ and ۱۴۰۵/۰۸/۰۲ —
    // Mehr has 30 days, so the third crosses into Aban, and the due date the row stores
    // is the local day the desk reads rather than an instant plus a fixed number of
    // milliseconds.
    const first = await completeSlot({ localDate: asLocalDate('1405-07-04') })
    await recordCompletedSession(factsFor(first.booked.id, first.scheduledAt))

    const second = await completeSlot({ localDate: asLocalDate('1405-07-18') })
    await recordCompletedSession(factsFor(second.booked.id, second.scheduledAt))

    const cycle = await unscoped.treatmentCycle.findFirstOrThrow()
    const lastLocal = fromUtcInstant(second.scheduledAt, UTC_OFFSET).localDate
    const expected = addLocalDays(lastLocal, 14)

    // The last session was in Mehr and the due date is in Aban; the boundary is
    // asserted rather than incidental, because a due date that walked back a month is
    // the failure the library's day arithmetic exists to prevent.
    expect(jalaliParts(expected).month).toBe(8)
    expect(jalaliParts(lastLocal).month).toBe(7)
    expect(fromUtcInstant(cycle.nextDueDate ?? new Date(NaN), UTC_OFFSET).localDate).toBe(expected)
    expect(cycle.completedSessions).toBe(2)
  })

  it('keeps an existing cycle on its own interval when the service default changes', async () => {
    // DoD 3. A course whose spacing the clinic shortens must keep its spacing, or the
    // treatment the customer is mid-way through collapses. The interval is snapshotted
    // at creation, so a catalogue change moves the courses that start after it and none
    // of the ones already running.
    const first = await completeSlot({ localDate: asLocalDate('1405-07-04') })
    await recordCompletedSession(factsFor(first.booked.id, first.scheduledAt))

    await unscoped.service.update({
      where: { id: SERVICE_ID },
      data: { defaultIntervalDays: 7 },
    })

    const second = await completeSlot({ localDate: asLocalDate('1405-07-18') })
    await recordCompletedSession(factsFor(second.booked.id, second.scheduledAt))

    const cycle = await unscoped.treatmentCycle.findFirstOrThrow()
    expect(cycle.intervalDays).toBe(14)
    const lastLocal = fromUtcInstant(second.scheduledAt, UTC_OFFSET).localDate
    expect(fromUtcInstant(cycle.nextDueDate ?? new Date(NaN), UTC_OFFSET).localDate).toBe(
      addLocalDays(lastLocal, 14),
    )

    // The course that starts after the change is the one that reads the new default.
    const newCourse = await completeSlot({
      localDate: asLocalDate('1405-08-02'),
      localTime: asLocalTime('11:00'),
    })
    await recordCompletedSession(factsFor(newCourse.booked.id, newCourse.scheduledAt))
    expect(await unscoped.treatmentCycle.count()).toBe(2)
    const started = await unscoped.treatmentCycle.findFirstOrThrow({
      where: { startedAt: newCourse.scheduledAt },
    })
    expect(started.intervalDays).toBe(7)
  })
})
