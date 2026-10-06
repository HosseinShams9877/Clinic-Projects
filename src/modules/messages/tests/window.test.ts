/**
 * The 90-day window and the priority order — DoD 3.
 *
 * `06-constants.md` §4.10's send rules, together: no repeat message to a person within
 * the window across every automatic kind, and when more than one is due the order
 * next-session appointment → financial → survey decides which one is sent. The two
 * are one test because they are one mechanism — the dispatcher applies the priority
 * *inside* a customer's group, and the window is what the group's other members
 * collide against.
 *
 * The fixture is one customer with a due cycle and a past-due balance on the same
 * tick, which is the case the priority list exists to decide: two messages, one
 * person, one day.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AppointmentStatus,
  Channel,
  CustomerLifecycle,
  CycleStatus,
  Permission,
  Role,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { recordConsent } from '@/modules/customers'
import { runAutomaticDispatch } from '@/modules/messages'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-window')
const CLINIC_ID = asClinicId('clinic-window')
const STAFF_ID: UserId = asUserId('staff-window')
const DOCTOR_ID: UserId = asUserId('doctor-window')
const SERVICE_ID = 'service-window'
const CUSTOMER_ID = 'customer-window'
const CYCLE_ID = 'cycle-window'
const APPOINTMENT_ID = 'appointment-window'

/** Inside the send window, so the window is not the reason a message is held. */
const NOW = new Date('2026-10-05T10:00:00Z')

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
    data: [{ id: TENANT_ID, slug: 'window', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        utcOffsetMinutes: 210,
        sendWindowStart: '00:00',
        sendWindowEnd: '23:59',
      },
    ],
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
      {
        id: CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000040',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })

  await grantConsent()
})

/** Consent is a precondition of both halves of the test, so it is seeded in the fixture. */
async function grantConsent(): Promise<void> {
  const ctx: TenantContext = Object.freeze({
    userId: STAFF_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Secretary,
    overrides: Object.freeze({ granted: [Permission.ViewAllCustomers], revoked: [] }),
  })
  await recordConsent({
    tx: unscoped as never,
    ctx,
    customerId: CUSTOMER_ID,
    flags: { sms: true, whatsApp: false, phone: false, beforeAfter: false },
    source: 'PROFILE',
    now: NOW,
  })
}

/**
 * The fixture's two due messages: a cycle whose next session is due, and a completed
 * appointment whose balance is unpaid past its due date. Both are due on the same
 * tick, which is the case the priority list exists to decide.
 */
async function seedTwoDueMessages(): Promise<void> {
  await unscoped.appointment.create({
    data: {
      id: APPOINTMENT_ID,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: CUSTOMER_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      scheduledAt: new Date('2026-08-05T05:30:00Z'),
      localDate: '1405-05-14',
      localTime: '09:00',
      durationMinutes: 30,
      status: AppointmentStatus.Completed,
      source: 'RECEPTION',
      priceAtBooking: 500_000n,
      depositAmount: 0n,
    },
  })
  await unscoped.treatmentCycle.create({
    data: {
      id: CYCLE_ID,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      intervalDays: 14,
      totalSessions: 6,
      completedSessions: 1,
      currentSessionNumber: 2,
      startedAt: new Date('2026-08-05T05:30:00Z'),
      lastSessionAt: new Date('2026-08-05T05:30:00Z'),
      nextDueDate: new Date('2026-10-05T00:00:00Z'),
      status: CycleStatus.Due,
    },
  })
}

describe('DoD 3 — the 90-day window and the priority order', () => {
  it('sends the higher-priority message when two are due to one customer', async () => {
    await seedTwoDueMessages()

    const outcomes = await runAutomaticDispatch(unscoped as never, TENANT_ID, NOW)
    const sent = outcomes.filter((outcome) => outcome.result === 'SENT')

    // `NEXT_SESSION_REMINDER` is the priority list's first entry, and
    // `BALANCE_REMINDER` is its sixth; the daily cap is one, so the order between
    // them is the order the customer is served in.
    expect(sent).toHaveLength(1)

    const rows = await unscoped.messageSend.findMany({
      where: { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
      orderBy: { createdAt: 'asc' },
    })
    expect(rows.map((row) => row.automaticKind)).toContain('NEXT_SESSION_REMINDER')

    // The message the priority list ranked lower is recorded as suppressed by the
    // daily cap — a decision the ledger names, and not a message that vanished.
    const heldBack = rows.find((row) => row.automaticKind === 'BALANCE_REMINDER')
    expect(heldBack?.status).toBe('SUPPRESSED')
    expect(heldBack?.suppressedReason).toBe('DAILY_CAP')
  })

  it('suppresses a second message within the 90-day window, across every kind', async () => {
    await seedTwoDueMessages()

    // A message delivered ۳۰ days ago closes the window: the promise is to the person
    // and not to the message type, so the row is any automatic kind on any channel.
    await unscoped.messageSend.create({
      data: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        channel: Channel.Sms,
        automaticKind: 'SURVEY',
        renderedText: 'پیام پیشین',
        status: 'SENT',
        sentAt: new Date('2026-09-05T10:00:00Z'),
      },
    })

    const outcomes = await runAutomaticDispatch(unscoped as never, TENANT_ID, NOW)
    expect(outcomes.filter((outcome) => outcome.result === 'SENT')).toHaveLength(0)

    // Both due messages are suppressed by the window, and each carries the reason the
    // clinic can repeat to the customer.
    const rows = await unscoped.messageSend.findMany({
      where: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        status: 'SUPPRESSED',
      },
    })
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.every((row) => row.suppressedReason === 'DUPLICATE_WINDOW')).toBe(true)
  })
})
