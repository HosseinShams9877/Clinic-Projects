/**
 * «انجام شد» — completing a visit, and the money the desk collected for it.
 *
 * Area 2's question is what a completion *carries*: the appointment's own facts
 * (status, `resultRecordedAt`, trimmed note), the receipt written by the same
 * action, and the guards that keep a result from being entered for a visit the
 * desk never saw. The four shapes the lifecycle's own table permits on the way
 * to `COMPLETED` are the four this suite separates:
 *
 * - `ARRIVED → COMPLETED` — the normal desk close, with the payment attached;
 * - `BOOKED → COMPLETED` for a **slot block only** — a closed hour, which has no
 *   customer and therefore no receipt to write;
 * - `BOOKED → COMPLETED` for a *booking* — refused, both at the module
 *   (`lib/transition.ts`'s row guard) and at the action, so no payment is written
 *   for a visit whose arrival was never recorded;
 * - `RESULT_NOT_RECORDED → COMPLETED` — the alarm's own close: the arrival was
 *   recorded, the result was not, and completing it must also remove the row
 *   from the «نتیجه ثبت نشده» cartable that flagged it.
 *
 * The suite drives the Server Action (`recordResultAction`) for the first three
 * and the module for the last two, because the permission and tenant questions
 * are the module's own and the action adds nothing to them. The action half
 * reuses the repo's standard action harness (`vi.hoisted` client, frozen manager
 * session, silenced `revalidatePath`, pinned `realClock`); the module half passes
 * the same client as `tx`, so both halves see one database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppointmentStatus, CustomerLifecycle, PaymentKind, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@prisma/client'

import { recordResult } from '@/modules/appointments/lib/transition'
import { unrecordedCartable } from '@/modules/appointments/lib/queries'

import { recordResultAction } from './actions'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-completion')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-completion-other')
const CLINIC_ID = asClinicId('clinic-completion')
const DOCTOR_ID: UserId = asUserId('doctor-completion')
const CUSTOMER_ID = 'customer-completion'
const APPOINTMENT_ID = 'appointment-completion'

/** The price the visit was booked at — ۱٬۲۰۰٬۰۰۰ تومان in rial. */
const PRICE = 12_000_000n
/** What the desk collected at completion: ۱٬۰۰۰٬۰۰۰ تومان → ۱۰٬۰۰۰٬۰۰۰ rial. */
const PAID_AT_COMPLETION = 10_000_000n

/** The fixed clock — the instant `resultRecordedAt` and `paidAt` are stamped with. */
const NOW = new Date('2026-10-06T10:00:00.000Z')

/** The per-file database, handed to the mocked `prisma()` through the hoisted ref. */
const clientRef = vi.hoisted(() => ({ current: null as PrismaClient | null }))

vi.mock('@/core/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/db')>()
  return { ...actual, prisma: () => clientRef.current }
})

vi.mock('@/app/_shell/session', () => ({
  resolveStaffPanel: async () => ({
    permissions: Object.freeze({
      userId: DOCTOR_ID,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      role: Role.Manager,
      overrides: Object.freeze({ granted: [], revoked: [] }),
    }),
    tenantId: TENANT_ID,
    role: Role.Manager,
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

vi.mock('@/core/lib/clock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/lib/clock')>()
  return { ...actual, realClock: () => NOW }
})

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
  clientRef.current = unscoped
})

afterAll(async () => {
  clientRef.current = null
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.payment.deleteMany(),
    unscoped.installment.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_ID, slug: 'completion', name: 'الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'completion-other', name: 'ب', isActive: true },
    ],
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
        mobile: '09120000090',
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
        mobile: '09130000090',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
})

/** One visit row in the seeded tenant, with the status and the block flag a case varies. */
async function appointment(patch: {
  readonly status: AppointmentStatus
  readonly isSlotBlock?: boolean
  readonly hasCustomer?: boolean
}): Promise<string> {
  const isSlotBlock = patch.isSlotBlock ?? false
  await unscoped.appointment.create({
    data: {
      id: APPOINTMENT_ID,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: patch.hasCustomer === false ? null : CUSTOMER_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-10-06T06:30:00.000Z'),
      localDate: '1405-07-14',
      localTime: '10:00',
      durationMinutes: 30,
      status: patch.status,
      isSlotBlock,
      source: 'RECEPTION',
      priceAtBooking: PRICE,
    },
  })
  return APPOINTMENT_ID
}

async function completeWith(payment?: {
  readonly paidAmount?: string
  readonly note?: string
}) {
  return recordResultAction('admin', {
    appointmentId: APPOINTMENT_ID,
    note: payment?.note,
    paidAmount: payment?.paidAmount,
    method: 'CASH',
  })
}

describe('recordResultAction — the completion and its receipt', () => {
  it('completes an arrived visit and writes the desk payment against it', async () => {
    await appointment({ status: AppointmentStatus.Arrived })

    const result = await completeWith({ paidAmount: '1,000,000', note: ' جلسه خوب پیش رفت ' })
    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID })

    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })
    expect(row.status).toBe(AppointmentStatus.Completed)
    expect(row.resultRecordedAt).toEqual(NOW)
    // The note is trimmed on the write, so the profile reads the sentence and not
    // the whitespace a form leaves around it.
    expect(row.resultNote).toBe('جلسه خوب پیش رفت')

    const receipts = await unscoped.payment.findMany({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID },
    })
    expect(receipts).toHaveLength(1)
    expect(receipts[0]!.amount).toBe(PAID_AT_COMPLETION)
    expect(receipts[0]!.method).toBe('CASH')
    expect(receipts[0]!.kind).toBe(PaymentKind.Partial)
    expect(receipts[0]!.paidAt).toEqual(NOW)
    expect(receipts[0]!.recordedByUserId).toBe(DOCTOR_ID)
    expect(receipts[0]!.discountAmount).toBe(0n)
  })

  it('completes with no payment when the desk collected nothing, and writes no receipt', async () => {
    await appointment({ status: AppointmentStatus.Arrived })

    const result = await completeWith({ note: 'پرداخت در محل' })
    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID })

    expect((await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })).status).toBe(
      AppointmentStatus.Completed,
    )
    expect(await unscoped.payment.count()).toBe(0)
  })

  it('refuses a payment whose text is not money, and leaves the visit where it was', async () => {
    await appointment({ status: AppointmentStatus.Arrived })

    // The parse runs before the scope opens, so a bad figure cannot half-apply:
    // the appointment stays ARRIVED and no receipt exists for it.
    const refused = await completeWith({ paidAmount: 'صفر' })
    expect(refused).toEqual({ ok: false, message: 'مبلغ وارد شده معتبر نیست.' })
    const zero = await completeWith({ paidAmount: '0' })
    expect(zero.ok).toBe(false)

    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })
    expect(row.status).toBe(AppointmentStatus.Arrived)
    expect(row.resultRecordedAt).toBeNull()
    expect(await unscoped.payment.count()).toBe(0)
  })
})

describe('recordResultAction — the row guard on BOOKED', () => {
  it('refuses to complete a booking whose arrival was never recorded, and writes no receipt', async () => {
    await appointment({ status: AppointmentStatus.Booked })

    const result = await completeWith({ paidAmount: '1,000,000' })
    expect(result.ok).toBe(false)

    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })
    expect(row.status).toBe(AppointmentStatus.Booked)
    expect(row.resultRecordedAt).toBeNull()
    expect(await unscoped.payment.count()).toBe(0)
  })

  it('closes a slot block as a completed hour, which holds no customer and no receipt', async () => {
    await appointment({ status: AppointmentStatus.Booked, isSlotBlock: true, hasCustomer: false })

    const result = await completeWith()
    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID })

    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })
    expect(row.status).toBe(AppointmentStatus.Completed)
    // A block is a closed hour, not a visit: `writeReceipt` finds nothing to attach
    // to and completes anyway.
    expect(await unscoped.payment.count()).toBe(0)
  })
})

describe('recordResult — the alarm row and the guards the module owns', () => {
  it('clears a RESULT_NOT_RECORDED row from the cartable by completing it', async () => {
    await appointment({ status: AppointmentStatus.ResultNotRecorded })

    const result = await completeWith({ paidAmount: '1,000,000' })
    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID })

    // The row arrived, the result had not, and the alarm flagged it; completing it
    // records the result, so the cartable that rose on the missing result must
    // no longer offer it.
    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })
    expect(row.status).toBe(AppointmentStatus.Completed)
    expect(row.resultRecordedAt).toEqual(NOW)

    const cartable = await unrecordedCartable({ tx: unscoped as never, tenantId: TENANT_ID })
    expect(cartable).toHaveLength(0)
  })

  it('refuses a doctor, who holds none of the desk permissions', async () => {
    await appointment({ status: AppointmentStatus.Arrived })

    const doctor: TenantContext = Object.freeze({
      userId: DOCTOR_ID,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      role: Role.Doctor,
      overrides: Object.freeze({ granted: [], revoked: [] }),
    })

    await expect(
      recordResult({ tx: unscoped as never, ctx: doctor, appointmentId: APPOINTMENT_ID, now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })

    // A secretary's defaults include «ثبت نتیجه», so the same call succeeds.
    const secretary: TenantContext = Object.freeze({ ...doctor, role: Role.Secretary })
    await recordResult({
      tx: unscoped as never,
      ctx: secretary,
      appointmentId: APPOINTMENT_ID,
      now: NOW,
    })
    expect((await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })).status).toBe(
      AppointmentStatus.Completed,
    )
  })

  it("answers a 404 for another tenant's appointment rather than writing into it", async () => {
    await unscoped.appointment.create({
      data: {
        id: APPOINTMENT_ID,
        tenantId: OTHER_TENANT_ID,
        clinicId: CLINIC_ID,
        customerId: CUSTOMER_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date('2026-10-06T06:30:00.000Z'),
        localDate: '1405-07-14',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Arrived,
        isSlotBlock: false,
        source: 'RECEPTION',
        priceAtBooking: PRICE,
      },
    })
    const manager: TenantContext = Object.freeze({
      userId: DOCTOR_ID,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      role: Role.Manager,
      overrides: Object.freeze({ granted: [], revoked: [] }),
    })

    await expect(
      recordResult({ tx: unscoped as never, ctx: manager, appointmentId: APPOINTMENT_ID, now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'appointment.notFound' })
  })
})
