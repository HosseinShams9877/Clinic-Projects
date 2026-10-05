/**
 * The balance — DoD 1.
 *
 * `03-data-model.md` §4.1: `balance = Σ priceAtBooking − Σ discountAmount − Σ amount`,
 * computed at read time from the full unit table. This is the one test that exercises
 * the formula end to end, through the module's own writers and its own read, across
 * the four kinds of row the ledger holds — a deposit, a partial payment, a discount,
 * and a refund — because each of the four is a way the arithmetic could go wrong that
 * a two-row fixture would not reach.
 *
 * The numbers are chosen so the refund and the discount both move the balance and
 * neither cancels the other: charged ۱٬۰۰۰٬۰۰۰, discount ۱۰۰٬۰۰۰, paid ۳۰۰٬۰۰۰ after a
 * deposit of ۲۰۰٬۰۰۰ is refunded in full, leaving ۶۰۰٬۰۰۰ owed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AppointmentStatus,
  CustomerLifecycle,
  DepositRefundPolicy,
  PaymentKind,
  PaymentMethod,
  Permission,
  Role,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { customerBalance, recordPayment, recordRefund } from '@/modules/payments'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-balance')
const CLINIC_ID = asClinicId('clinic-balance')
const DOCTOR_ID: UserId = asUserId('doctor-balance')
const CUSTOMER_ID = 'customer-balance'
const APPOINTMENT_ID = 'appointment-balance'

/** The price the appointment was booked at — the charged side of the formula. */
const PRICE = 1_000_000n

/** The deposit the desk took at booking, which the refund hands back. */
const DEPOSIT = 200_000n

/** The partial payment, and the discount granted beside it. */
const PARTIAL = 300_000n
const DISCOUNT = 100_000n

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
    unscoped.payment.deleteMany(),
    unscoped.auditLog.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'balance', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        utcOffsetMinutes: 210,
        depositRefundPolicy: DepositRefundPolicy.Full,
        secretaryDiscountCap: 500_000n,
      },
    ],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000010',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.customer.createMany({
    data: [
      {
        id: CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000010',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
  await unscoped.appointment.createMany({
    data: [
      {
        id: APPOINTMENT_ID,
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        customerId: CUSTOMER_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date('2026-10-05T00:00:00Z'),
        localDate: '1405-07-13',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        source: 'RECEPTION',
        priceAtBooking: PRICE,
        depositAmount: DEPOSIT,
      },
    ],
  })
})

/** A context the payment writer accepts: the manager's role, plus the permission. */
function context(): TenantContext {
  return Object.freeze({
    userId: DOCTOR_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [Permission.RecordPayment], revoked: [] }),
  })
}

describe('DoD 1 — the balance is charges minus payments minus discounts', () => {
  it('computes the balance across a deposit, a partial payment, a discount and a refund', async () => {
    await recordPayment({
      tx: unscoped as never,
      ctx: context(),
      input: {
        appointmentId: APPOINTMENT_ID,
        amount: DEPOSIT,
        method: PaymentMethod.Cash,
        kind: PaymentKind.Deposit,
        discountAmount: 0n,
        discountReason: null,
        note: null,
      },
      now: new Date('2026-10-01T00:00:00Z'),
    })

    await recordPayment({
      tx: unscoped as never,
      ctx: context(),
      input: {
        appointmentId: APPOINTMENT_ID,
        amount: PARTIAL,
        method: PaymentMethod.Card,
        kind: PaymentKind.Partial,
        discountAmount: DISCOUNT,
        discountReason: 'بیماری',
        note: null,
      },
      now: new Date('2026-10-02T00:00:00Z'),
    })

    // The refund reverses the deposit: a `REFUND` row carries a negative amount, so the
    // one subtraction serves both directions and the paid side falls back to the
    // partial payment alone.
    await recordRefund({
      tx: unscoped as never,
      ctx: context(),
      appointmentId: APPOINTMENT_ID,
      method: PaymentMethod.Cash,
      note: 'لغو نوبت',
      now: new Date('2026-10-03T00:00:00Z'),
    })

    const balance = await customerBalance(unscoped as never, TENANT_ID, CUSTOMER_ID)

    expect(balance.charged).toBe(PRICE)
    expect(balance.discount).toBe(DISCOUNT)
    expect(balance.paid).toBe(PARTIAL)
    expect(balance.balance).toBe(PRICE - DISCOUNT - PARTIAL)
  })
})
