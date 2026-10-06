/**
 * The seven automatic messages — DoD 1.
 *
 * `06-constants.md` §4.10's set and `02-architecture.md` §6's moments. Each trigger
 * is a read of domain state against the injected clock, so one clock and one seeded
 * fact per kind is the whole fixture: the seven are evaluated independently, and the
 * assertion is that the kind the clock made due is the kind the evaluator found.
 *
 * The seven `now` values are the seven moments themselves — on booking, the day
 * before, after the result, when the cycle is due, past the due date, the day after
 * a no-show, and a week after completion — because a trigger's timing is the thing
 * this phase delivers and the thing a clock at the wrong instant would not show.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AppointmentStatus,
  Channel,
  CustomerLifecycle,
  CycleStatus,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import { collectAutomaticCandidates } from '@/modules/notifications'
import { ensureDefaultTemplates } from '@/modules/messages'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-triggers')
const CLINIC_ID = asClinicId('clinic-triggers')
const DOCTOR_ID: UserId = asUserId('doctor-triggers')
const SERVICE_ID = 'service-triggers'
const CUSTOMER_ID = 'customer-triggers'

/** Every fact the seven triggers read, keyed by the kind they make due. */
const NOW = new Date('2026-10-05T08:00:00Z')

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
  appointmentCount = 0
  await unscoped.$transaction([
    unscoped.messageSend.deleteMany(),
    unscoped.messageTemplate.deleteMany(),
    unscoped.consentRecord.deleteMany(),
    unscoped.payment.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.treatmentCycle.deleteMany(),
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'triggers', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: 210 }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000020',
        firstName: 'پزشک',
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
      {
        id: CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000020',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })

  // The templates are seeded so a dispatch over these candidates renders; the trigger
  // test itself reads candidates, but a tenant without rows is a tenant the catalog
  // answers for, and the two are seeded together to keep the fixture one whole day.
  await ensureDefaultTemplates({
    tx: unscoped as never,
    tenantId: TENANT_ID,
    channel: Channel.Sms,
  })
})

/**
 * The one appointment a trigger reads, at the status and moment given.
 *
 * Ids are derived from a counter and not the status, because two of the seven facts
 * are bookings at different days — the confirmation and the reminder — and a status
 * key would collide on the second.
 */
let appointmentCount = 0
async function appointment(status: string, extra: Record<string, unknown> = {}): Promise<string> {
  appointmentCount += 1
  const id = `appointment-${appointmentCount}`
  await unscoped.appointment.create({
    data: {
      id,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: CUSTOMER_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      scheduledAt: new Date('2026-10-05T05:30:00Z'),
      localDate: '1405-07-13',
      localTime: '09:00',
      durationMinutes: 30,
      status,
      source: 'RECEPTION',
      priceAtBooking: 500_000n,
      depositAmount: 0n,
      ...extra,
    },
  })
  return id
}

describe('DoD 1 — all seven automatic messages fire on their trigger', () => {
  it('finds the seven kinds due at the seven moments the clock puts them at', async () => {
    await appointment(AppointmentStatus.Booked, {
      createdAt: new Date('2026-10-05T07:00:00Z'),
    })
    await appointment(AppointmentStatus.Booked, {
      localDate: '1405-07-14',
      localTime: '10:00',
    })
    await appointment(AppointmentStatus.Completed, {
      resultRecordedAt: new Date('2026-10-05T06:00:00Z'),
    })
    await unscoped.treatmentCycle.create({
      data: {
        id: 'cycle-triggers',
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        serviceId: SERVICE_ID,
        doctorId: DOCTOR_ID,
        intervalDays: 14,
        totalSessions: 6,
        completedSessions: 1,
        currentSessionNumber: 2,
        startedAt: new Date('2026-09-21T05:30:00Z'),
        lastSessionAt: new Date('2026-10-05T05:30:00Z'),
        nextDueDate: new Date('2026-10-05T00:00:00Z'),
        status: CycleStatus.Due,
      },
    })
    await appointment(AppointmentStatus.NoShow, {
      scheduledAt: new Date('2026-10-04T05:30:00Z'),
    })
    await appointment(AppointmentStatus.Completed, {
      scheduledAt: new Date('2026-09-28T05:30:00Z'),
    })

    const candidates = await collectAutomaticCandidates(unscoped as never, TENANT_ID, NOW)
    const kinds = new Set(candidates.map((candidate) => candidate.kind))

    expect(kinds).toContain('BOOKING_CONFIRMATION')
    expect(kinds).toContain('APPOINTMENT_REMINDER')
    expect(kinds).toContain('AFTERCARE')
    expect(kinds).toContain('NEXT_SESSION_REMINDER')
    expect(kinds).toContain('NO_SHOW_FOLLOW_UP')
    expect(kinds).toContain('SURVEY')

    // `BALANCE_REMINDER` is the seventh, due when a charged amount is unpaid past its
    // due date. The fixture holds one completed appointment with no payment row, so
    // the balance is the full price and the due date has passed.
    expect(kinds).toContain('BALANCE_REMINDER')

    // Each candidate carries the person and the values its template renders — a
    // candidate without them is a kind the dispatcher cannot send.
    const confirmation = candidates.find(
      (candidate) => candidate.kind === 'BOOKING_CONFIRMATION',
    )
    expect(confirmation?.customerId).toBe(CUSTOMER_ID)
    expect(confirmation?.values.name).toBe('مشتری')

    // One row per kind per customer: the fixture's seven facts are one customer's, and
    // a trigger that returned two of a kind would be a trigger the dispatcher's dedupe
    // had to correct.
    const counted = new Map<string, number>()
    for (const candidate of candidates) {
      counted.set(candidate.kind, (counted.get(candidate.kind) ?? 0) + 1)
    }
    for (const [kind, count] of counted) {
      expect(count, `${kind} appeared ${count} times`).toBe(1)
    }

    // A clock six weeks on clears the five event-bounded kinds: their lookback is the
    // trigger's own statement of how late a message still makes sense. The two
    // state-bounded kinds are still due, because a course without a booking and an
    // unpaid balance are facts that do not age — the lookback is not a statute of
    // limitations on what the clinic owes a customer.
    const later = await collectAutomaticCandidates(
      unscoped as never,
      TENANT_ID,
      new Date('2026-11-20T08:00:00Z'),
    )
    const laterKinds = new Set(
      later.filter((candidate) => candidate.customerId === CUSTOMER_ID).map((c) => c.kind),
    )
    expect(laterKinds).not.toContain('BOOKING_CONFIRMATION')
    expect(laterKinds).not.toContain('APPOINTMENT_REMINDER')
    expect(laterKinds).not.toContain('AFTERCARE')
    expect(laterKinds).not.toContain('NO_SHOW_FOLLOW_UP')
    expect(laterKinds).not.toContain('SURVEY')
    expect(laterKinds).toContain('NEXT_SESSION_REMINDER')
    expect(laterKinds).toContain('BALANCE_REMINDER')
  })
})
