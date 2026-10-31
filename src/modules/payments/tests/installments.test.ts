/**
 * The installment plan's due dates — the CRITICAL half of the payments audit.
 *
 * `03-data-model.md` §4.2 and `installments.ts`'s own comment are the rule this suite
 * is written against: «استفاده از addLocalMonths برای جلوگیری از تغییر روز» — the day
 * of the month a plan starts on is the day every installment falls on, and the
 * function the module uses is the one that keeps it. The three things that can go
 * wrong are the three the suite separates:
 *
 * - the day **anchors** — a plan starting on the 5th collects on the 5th, every month,
 *   and not a day earlier as a fixed-30-day loop would drift it;
 * - a 31-day month **clamps** to the last day of a shorter one (۳۱ شهریور → ۳۰
 *   مهر، ۳۰ آبان، ۳۰ آذر) rather than rolling into the next month, which is the
 *   difference between "the last day of the month" and "the first of the next";
 * - the **remainder** of an uneven split lands on the first rows, and the row amounts
 *   sum to the total exactly rather than approximately.
 *
 * The input instants are hardcoded Gregorian (`۲۰۲۶-۰۶-۲۵T۲۰:۳۰:۰۰Z` is ۵ تیر
 * ۱۴۰۵ at UTC+۳:۳۰) and not built with `toUtcInstant`, so a conversion broken both
 * ways would still fail here. The expectations the clamping test asserts are the
 * month lengths the calendar holds — months ۱–۶ are ۳۱ days, ۷–۱۱ are ۳۰ — and not
 * a re-derivation of `addLocalMonths`.
 *
 * The fourth block is the read side: `installments.ts`'s own `listInstallments`
 * advances a row's displayed due date by the installments already paid (`paidCount ×
 * intervalMonths`), which is the "due-date edit that advances the stage" the audit
 * asks for, and a row that has paid nothing does not advance. (The barrel exports a
 * *different* `listInstallments` — `lib/queries.ts`'s, which filters closed rows but
 * does not advance; the installments table advances its own rows client-side. This
 * suite tests the module's read, and the duplication is noted in the report.) Validation and tenant isolation close the suite,
 * because a plan a second tenant could write into this tenant's appointment, or a
 * count of ۳۷, is a due-date bug no amount of calendar care fixes.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentStatus, CustomerLifecycle, Permission, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import { fromUtcInstant } from '@/core/localization'
import type { PrismaClient } from '@prisma/client'

import { createInstallmentPlan, listInstallments } from '../lib/installments'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-installments')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-installments-other')
const CLINIC_ID = asClinicId('clinic-installments')
const DOCTOR_ID: UserId = asUserId('doctor-installments')
const OTHER_DOCTOR_ID: UserId = asUserId('doctor-installments-other')
const CUSTOMER_ID = 'customer-installments'
const APPOINTMENT_ID = 'appointment-installments'
const OTHER_APPOINTMENT_ID = 'appointment-installments-other'

/** The tenant's offset — UTC+۳:۳۰, so local midnight is ۲۰:۳۰Z the Gregorian day before. */
const OFFSET = 210

/**
 * ۵ تیر ۱۴۰۵, as the UTC instant the timezone turns into that local date —
 * hardcoded rather than converted, so the input is independent of the code under test.
 */
const FIRST_DUE_1405_04_05 = new Date('2026-06-25T20:30:00.000Z')
/** ۳۱ شهریور ۱۴۰۵ — a 31-day month, so the following months must clamp to 30. */
const FIRST_DUE_1405_06_31 = new Date('2026-09-21T20:30:00.000Z')
/** ۲۹ اسفند ۱۴۰۵ — the last day of a 29-day final month, across the year boundary. */
const FIRST_DUE_1405_12_29 = new Date('2027-03-19T20:30:00.000Z')

/** A fixed clock — the audit's "no real `new Date()`", and the plan's own `now`. */
const NOW = new Date('2026-10-06T10:00:00.000Z')

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
      { id: TENANT_ID, slug: 'installments', name: 'الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'installments-other', name: 'ب', isActive: true },
    ],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: OFFSET }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000070',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: OTHER_DOCTOR_ID,
        tenantId: OTHER_TENANT_ID,
        mobile: '09120000071',
        firstName: 'پزشک',
        lastName: 'ب',
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
        mobile: '09130000070',
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
        scheduledAt: new Date('2026-10-05T00:00:00.000Z'),
        localDate: '1405-07-13',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        source: 'RECEPTION',
        priceAtBooking: 1_000_000n,
      },
      {
        id: OTHER_APPOINTMENT_ID,
        tenantId: OTHER_TENANT_ID,
        clinicId: CLINIC_ID,
        doctorId: OTHER_DOCTOR_ID,
        scheduledAt: new Date('2026-10-05T00:00:00.000Z'),
        localDate: '1405-07-13',
        localTime: '11:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        source: 'RECEPTION',
        priceAtBooking: 1_000_000n,
      },
    ],
  })
})

/** A manager with the payment permission, which is the least the writer accepts. */
function context(): TenantContext {
  return Object.freeze({
    userId: DOCTOR_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [Permission.RecordPayment], revoked: [] }),
  })
}

/** The Jalali local date the row's `dueAt` is, read back at the tenant's offset. */
function localDateOf(dueAt: Date): string {
  return fromUtcInstant(dueAt, OFFSET).localDate
}

async function createPlan(firstDueAt: Date, totalAmount: bigint, count: number) {
  return createInstallmentPlan({
    tx: unscoped as never,
    ctx: context(),
    now: NOW,
    input: { appointmentId: APPOINTMENT_ID, totalAmount, count, firstDueAt, note: null },
  })
}

describe('createInstallmentPlan — day-of-month anchoring', () => {
  it('keeps every installment on the 5th when the plan starts on the 5th', async () => {
    const rows = await createPlan(FIRST_DUE_1405_04_05, 1_000_000n, 4)

    expect(rows).toHaveLength(4)
    // ۵ تیر، ۵ مرداد، ۵ شهریور، ۵ مهر — a fixed-30-day loop would have drifted
    // the third row to the 4th and the fourth to the 3rd within a single year.
    expect(rows.map((row) => localDateOf(row.dueAt))).toEqual([
      '1405-04-05',
      '1405-05-05',
      '1405-06-05',
      '1405-07-05',
    ])
  })

  it('numbers the sequence 1..n and timestamps every row at local midnight', async () => {
    const rows = await createPlan(FIRST_DUE_1405_04_05, 1_000_000n, 3)

    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3])
    for (const row of rows) {
      // Midnight at UTC+۳:۳۰ is ۲۰:۳۰Z; a due date that carries a time of day would
      // be a due *hour*, and the bucket math downstream assumes the day boundary.
      expect(row.dueAt.getUTCHours()).toBe(20)
      expect(row.dueAt.getUTCMinutes()).toBe(30)
      expect(row.dueAt.getUTCSeconds()).toBe(0)
    }
  })
})

describe('createInstallmentPlan — 31-day-month clamping', () => {
  it('clamps 31 شهریور to the 30th of the following 30-day months', async () => {
    const rows = await createPlan(FIRST_DUE_1405_06_31, 4_000_000n, 4)

    // ۳۱ شهریور is real (months ۱–۶ are ۳۱ days); مهر، آبان and آذر are ۳۰. The day
    // must clamp to the last day of the shorter month, not roll to the 1st of the
    // next one — «آخرین روز ماه» is not «اول ماه بعد».
    expect(rows.map((row) => localDateOf(row.dueAt))).toEqual([
      '1405-06-31',
      '1405-07-30',
      '1405-08-30',
      '1405-09-30',
    ])
  })

  it('keeps the day across the year boundary when the target month is long enough', async () => {
    const rows = await createPlan(FIRST_DUE_1405_12_29, 2_000_000n, 2)

    // ۲۹ اسفند ۱۴۰۵ → ۲۹ فروردین ۱۴۰۶: the clamp is per-target-month, and a 29-day
    // day-of-month fits in a 31-day فروردین without narrowing.
    expect(rows.map((row) => localDateOf(row.dueAt))).toEqual(['1405-12-29', '1406-01-29'])
  })
})

describe('createInstallmentPlan — amount split', () => {
  it('distributes the remainder onto the first rows and sums to the total exactly', async () => {
    const rows = await createPlan(FIRST_DUE_1405_04_05, 1_000_000n, 3)

    // ۱٬۰۰۰٬۰۰۰ / ۳ = ۳۳۳٬۳۳۳ remainder ۱, so the first row carries the odd rial and
    // no rounding is lost to Number anywhere in the plan.
    expect(rows.map((row) => row.amount)).toEqual([333_334n, 333_333n, 333_333n])
    expect(rows.reduce((sum, row) => sum + row.amount, 0n)).toBe(1_000_000n)
  })

  it('splits evenly when the total divides by the count', async () => {
    const rows = await createPlan(FIRST_DUE_1405_04_05, 1_000_000n, 4)

    expect(rows.map((row) => row.amount)).toEqual([250_000n, 250_000n, 250_000n, 250_000n])
  })
})

describe('createInstallmentPlan — validation and isolation', () => {
  it('refuses a non-positive amount with payment.amountNotPositive', async () => {
    await expect(createPlan(FIRST_DUE_1405_04_05, 0n, 3)).rejects.toMatchObject({
      messageKey: 'payment.amountNotPositive',
    })
    await expect(createPlan(FIRST_DUE_1405_04_05, -100n, 3)).rejects.toMatchObject({
      messageKey: 'payment.amountNotPositive',
    })
    expect(await unscoped.installment.count()).toBe(0)
  })

  it('refuses a count that is not an integer in 1..36', async () => {
    for (const count of [0, 37, 1.5]) {
      await expect(createPlan(FIRST_DUE_1405_04_05, 1_000_000n, count)).rejects.toMatchObject({
        messageKey: 'payment.installmentCountInvalid',
      })
    }
    expect(await unscoped.installment.count()).toBe(0)
  })

  it("refuses another tenant's appointment rather than writing into it", async () => {
    await expect(
      createInstallmentPlan({
        tx: unscoped as never,
        ctx: context(),
        now: NOW,
        input: {
          appointmentId: OTHER_APPOINTMENT_ID,
          totalAmount: 1_000_000n,
          count: 3,
          firstDueAt: FIRST_DUE_1405_04_05,
          note: null,
        },
      }),
    ).rejects.toMatchObject({ messageKey: 'payment.installmentNotFound' })
    expect(await unscoped.installment.count()).toBe(0)
  })

  it('refuses a secretary whose RecordPayment has been revoked', async () => {
    // The secretary's column is not locked, so a revoked permission is honoured —
    // the manager's is (`lib/manager-lock.ts`), which is why this test is not "a
    // revoked manager": that refusal would be the lock working, not the permission.
    const secretary: TenantContext = Object.freeze({
      ...context(),
      role: Role.Secretary,
      overrides: Object.freeze({ granted: [], revoked: [Permission.RecordPayment] }),
    })

    await expect(
      createInstallmentPlan({
        tx: unscoped as never,
        ctx: secretary,
        now: NOW,
        input: {
          appointmentId: APPOINTMENT_ID,
          totalAmount: 1_000_000n,
          count: 3,
          firstDueAt: FIRST_DUE_1405_04_05,
          note: null,
        },
      }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })
    expect(await unscoped.installment.count()).toBe(0)
  })
})

describe('listInstallments — the stage advances with what is paid', () => {
  it("advances a row by the installments it has paid, and leaves an unpaid row where the plan put it", async () => {
    // A ۴-installment monthly plan whose first due date is ۵ تیر, ۱۰۰٬۰۰۰ a row.
    // The first row has two installments' worth recorded against it, so the read's
    // own arithmetic (`paidCount × intervalMonths`) must show its due date as
    // ۵ تیر + ۲ = ۵ شهریور — the stage that row is actually at — while the
    // unpaid rows keep the date the plan wrote.
    await createInstallmentPlan({
      tx: unscoped as never,
      ctx: context(),
      now: NOW,
      input: {
        appointmentId: APPOINTMENT_ID,
        totalAmount: 400_000n,
        count: 4,
        firstDueAt: FIRST_DUE_1405_04_05,
        note: null,
      },
    })
    const created = await unscoped.installment.findMany({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID },
      orderBy: { sequence: 'asc' },
    })

    await unscoped.installment.update({
      where: { id: created[0]!.id },
      data: {
        paidAmount: 200_000n,
        totalPlanAmount: 400_000n,
        totalPlanCount: 4,
        intervalMonths: 1,
      },
    })
    await unscoped.installment.update({
      where: { id: created[1]!.id },
      data: { totalPlanAmount: 400_000n, totalPlanCount: 4, intervalMonths: 1 },
    })

    const bySequence = new Map(
      (await listInstallments(unscoped as never, TENANT_ID)).map((row) => [row.sequence, row]),
    )

    // The paid row advances two months; the unpaid rows stay at the plan's dates.
    expect(localDateOf(bySequence.get(1)!.dueAt)).toBe('1405-06-05')
    expect(localDateOf(bySequence.get(2)!.dueAt)).toBe('1405-05-05')
    expect(localDateOf(bySequence.get(3)!.dueAt)).toBe('1405-06-05')
    expect(localDateOf(bySequence.get(4)!.dueAt)).toBe('1405-07-05')

    // And when the paid amount goes back to nothing, the same read leaves the row's
    // date where the plan put it — the advance tracks the money, not the calendar.
    await unscoped.installment.update({
      where: { id: created[0]!.id },
      data: { paidAmount: 0n },
    })
    const unpaid = await listInstallments(unscoped as never, TENANT_ID)
    const stillBySequence = new Map(unpaid.map((row) => [row.sequence, row]))
    expect(localDateOf(stillBySequence.get(1)!.dueAt)).toBe('1405-04-05')
  })

  it("caps the advance at the plan's own length, so an overpaid row cannot run past the end", async () => {
    await createInstallmentPlan({
      tx: unscoped as never,
      ctx: context(),
      now: NOW,
      input: {
        appointmentId: APPOINTMENT_ID,
        totalAmount: 200_000n,
        count: 2,
        firstDueAt: FIRST_DUE_1405_04_05,
        note: null,
      },
    })
    const [row] = await unscoped.installment.findMany({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID },
      orderBy: { sequence: 'asc' },
    })

    // Paid five installments' worth on a two-row plan: `paidCount` is clamped by
    // `totalPlanCount`, and the displayed date is the plan's last due date —
    // ۵ تیر + ۲ — not three months past the end of the plan.
    await unscoped.installment.update({
      where: { id: row!.id },
      data: {
        paidAmount: 500_000n,
        totalPlanAmount: 200_000n,
        totalPlanCount: 2,
        intervalMonths: 1,
      },
    })

    const rows = await listInstallments(unscoped as never, TENANT_ID)
    expect(rows).toHaveLength(2)
    expect(localDateOf(rows[0]!.dueAt)).toBe('1405-06-05')
  })
})
