/**
 * Consent as a hard filter — DoD 2.
 *
 * `03-data-model.md` §7.6: `MessageSend` requires a consent record for the channel,
 * or `status = SUPPRESSED` with a reason. The test seeds a customer with a due
 * message, runs the dispatch with no consent row, and asserts the ledger holds the
 * refusal rather than a gap — then grants consent and asserts the same dispatch
 * sends, which is what makes the filter a filter and not an off switch.
 *
 * The gateway is the shipped console adapter, so `SENT` is the log line and the row
 * is real either way; a fake provider would be a second thing to keep in step with
 * the one adapter the product ships.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AppointmentStatus,
  CustomerLifecycle,
  Permission,
  Role,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { recordConsent } from '@/modules/customers'
import { runAutomaticDispatch } from '@/modules/messages'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-consent')
const CLINIC_ID = asClinicId('clinic-consent')
const STAFF_ID: UserId = asUserId('staff-consent')
const DOCTOR_ID: UserId = asUserId('doctor-consent')
const SERVICE_ID = 'service-consent'
const CUSTOMER_ID = 'customer-consent'
const APPOINTMENT_ID = 'appointment-consent'

/** Inside the clinic's send window, so a closed window is not the reason a send is held. */
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
    unscoped.appointment.deleteMany(),
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'consent', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  // The window is the whole day, so the only thing that can hold the message is the
  // consent the test is about.
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
        mobile: '09120000030',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: STAFF_ID,
        tenantId: TENANT_ID,
        mobile: '09120000031',
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
        mobile: '09130000030',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
  await unscoped.appointment.create({
    data: {
      id: APPOINTMENT_ID,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: CUSTOMER_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      scheduledAt: new Date('2026-10-05T05:30:00Z'),
      localDate: '1405-07-13',
      localTime: '09:00',
      durationMinutes: 30,
      status: AppointmentStatus.Booked,
      source: 'RECEPTION',
      priceAtBooking: 500_000n,
      depositAmount: 0n,
      createdAt: new Date('2026-10-05T09:00:00Z'),
    },
  })
})

/** A context the consent writer accepts: a staff member who may read the customer. */
function context(): TenantContext {
  return Object.freeze({
    userId: STAFF_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Secretary,
    overrides: Object.freeze({ granted: [Permission.ViewAllCustomers], revoked: [] }),
  })
}

describe('DoD 2 — a customer without consent receives nothing, and the attempt is recorded', () => {
  it('suppresses the message with a reason and writes no provider row', async () => {
    const outcomes = await runAutomaticDispatch(unscoped as never, TENANT_ID, NOW)
    const suppressed = outcomes.filter((outcome) => outcome.result === 'SUPPRESSED')

    expect(suppressed).toHaveLength(1)
    expect(suppressed[0]?.reason).toBe('NO_CONSENT')

    // The ledger row is the evidence the audit and the customer both read, and it
    // names the reason the clinic can act on.
    const row = await unscoped.messageSend.findFirst({
      where: { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
    })
    expect(row?.status).toBe('SUPPRESSED')
    expect(row?.suppressedReason).toBe('NO_CONSENT')
    expect(row?.sentAt).toBeNull()
    expect(row?.providerMessageId).toBeNull()

    // The customer was never reached, which is the point of the filter: nothing left
    // the clinic on a channel the person did not agree to.
    const sent = outcomes.filter((outcome) => outcome.result === 'SENT')
    expect(sent).toHaveLength(0)
  })

  it('sends the same message once consent is granted', async () => {
    await recordConsent({
      tx: unscoped as never,
      ctx: context(),
      customerId: CUSTOMER_ID,
      flags: { sms: true, whatsApp: false, phone: false, beforeAfter: false },
      source: 'PROFILE',
      now: NOW,
    })

    const outcomes = await runAutomaticDispatch(unscoped as never, TENANT_ID, NOW)
    const sent = outcomes.filter((outcome) => outcome.result === 'SENT')

    expect(sent).toHaveLength(1)

    const row = await unscoped.messageSend.findFirst({
      where: { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
    })
    expect(row?.status).toBe('SENT')
    expect(row?.sentAt).toBeInstanceOf(Date)
  })
})
