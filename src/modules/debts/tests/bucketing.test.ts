/**
 * The debt list's four buckets, read through `queries.ts` against a pinned clock.
 *
 * `buckets.test.ts` covers `bucketOf` as a pure function; the audit's remaining
 * question is the read path itself — whether a row the seeds placed at a known
 * distance from `now` lands in the bucket the desk is named for, and whether the
 * due date that distance is measured from is the one the *module* computes rather
 * than the one the row happens to carry:
 *
 * - the four buckets and the two exact boundaries between them (a debt ۷ days
 *   late is still «گذشته از سررسید», one ۳۰ days late is still «بیش از ۷ روز» —
 *   the thresholds are `>`, so the named days themselves belong to the milder
 *   bucket);
 * - an installment plan's displayed due advances by the installments paid
 *   (`paidInstallments × intervalMonths`), which is the read-side half of the
 *   rule `installments.test.ts` tests on the write side;
 * - the effective due date: the desk's override wins over arithmetic, and the
 *   grace period pushes the session's own day forward;
 * - the rows the list must not offer at all — a settled one, a cancelled one, an
 *   hour the clinic blocked with no customer — and the permission that opens the
 *   read in the first place.
 *
 * The due instants are built arithmetically off a hardcoded local midnight
 * (۱۴۰۵/۰۷/۱۴ at UTC+۳:۳۰ = ۲۰۲۶-۱۰-۰۵T۲۰:۳۰Z), so the day-count arithmetic the
 * assertions depend on is independent of `toUtcInstant`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentStatus, CustomerLifecycle, DebtBucket, Permission, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@prisma/client'

import { clinicDebts, contactList, doctorDebts } from '../lib/queries'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-bucketing')
const CLINIC_ID = asClinicId('clinic-bucketing')
const DOCTOR_ID: UserId = asUserId('doctor-bucketing')
const OTHER_DOCTOR_ID: UserId = asUserId('doctor-bucketing-other')
const CUSTOMER_ID = 'customer-bucketing'

/** The tenant's offset — UTC+۳:۳۰, so local midnight is ۲۰:۳۰Z the Gregorian day before. */
const OFFSET = 210

/** The fixed clock the audit asks for — ۱۰:۰۰Z on ۱۴۰۵/۰۷/۱۴. */
const NOW = new Date('2026-10-06T10:00:00.000Z')
/** Midnight local on the seeded "today" — ۱۴۰۵/۰۷/۱۴, hardcoded and not converted. */
const TODAY_MIDNIGHT = new Date('2026-10-05T20:30:00.000Z')

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
    data: [{ id: TENANT_ID, slug: 'bucketing', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  // `debtGraceDays` is NULL on purpose: the plain rows' due date is the session's
  // own day, which is the arithmetic the first two tests name.
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: OFFSET }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000061',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: OTHER_DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000062',
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
        mobile: '09130000061',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
})

/** A manager who may see the debts — the least the read asks for. */
function context(): TenantContext {
  return Object.freeze({
    userId: DOCTOR_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [Permission.ViewDebts], revoked: [] }),
  })
}

/**
 * One completed, unpaid visit whose session day — and therefore its due date — is
 * `deltaDays` from today. A negative delta is a due date still to come.
 */
async function owe(deltaDays: number, id: string): Promise<string> {
  await unscoped.appointment.create({
    data: {
      id,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: CUSTOMER_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date(TODAY_MIDNIGHT.getTime() + deltaDays * DAY_MS),
      localDate: '1405-07-14',
      localTime: '10:00',
      durationMinutes: 30,
      status: AppointmentStatus.Completed,
      source: 'RECEPTION',
      priceAtBooking: 1_000_000n,
    },
  })
  return id
}

/** All rows the read returned, flattened over the four buckets. */
function allRows(buckets: Awaited<ReturnType<typeof clinicDebts>>) {
  return [
    ...buckets.overdue30,
    ...buckets.overdue7,
    ...buckets.overdue,
    ...buckets.dueSoon,
  ]
}

describe('the four buckets, read against a pinned clock', () => {
  it('places each row in the bucket its distance from today names, boundaries included', async () => {
    await owe(-31, 'appt-31')
    await owe(-30, 'appt-30')
    await owe(-8, 'appt-8')
    await owe(-7, 'appt-7')
    await owe(-3, 'appt-3')
    await owe(0, 'appt-today')
    await owe(5, 'appt-future')

    const buckets = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })

    // ۳۱ days late is «بیش از ۳۰ روز»; ۳۰ and ۸ days late are «بیش از ۷ روز»; ۷ and
    // ۳ days late and *today* are «گذشته از سررسید» — the thresholds are strict `>`,
    // so the named day itself stays in the milder bucket. ۵ days ahead is «نزدیک
    // سررسید», with a negative day count the table renders as «—».
    // Within a bucket the rows keep the read's order — the newest session first
    // (`scheduledAt` desc) — so «بیش از ۷ روز» opens with the eight-day debt.
    expect(buckets.overdue30.map((row) => row.appointmentId)).toEqual(['appt-31'])
    expect(buckets.overdue7.map((row) => row.appointmentId)).toEqual(['appt-8', 'appt-30'])
    expect(buckets.overdue.map((row) => row.appointmentId)).toEqual(['appt-today', 'appt-3', 'appt-7'])
    expect(buckets.dueSoon.map((row) => row.appointmentId)).toEqual(['appt-future'])

    const byId = new Map(allRows(buckets).map((row) => [row.appointmentId, row]))
    expect(byId.get('appt-31')!.daysOverdue).toBe(31)
    expect(byId.get('appt-7')!.daysOverdue).toBe(7)
    // "Due today" is a fact the desk acts on: the count is ۰ and not «—».
    expect(byId.get('appt-today')!.daysOverdue).toBe(0)
    expect(byId.get('appt-today')!.bucket).toBe(DebtBucket.PastDue)
    expect(byId.get('appt-today')!.dueLocalDate).toBe('1405-07-14')
    expect(byId.get('appt-future')!.daysOverdue).toBe(-5)
  })

  it("advances an installment's due date by the installments paid, so the stage the row is at is the one read", async () => {
    // A monthly plan for ۱٬۰۰۰٬۰۰۰ in two rows of ۵۰۰٬۰۰۰, written as due ۱۶ شهریور
    // — ۲۹ days before the seeded today, which by itself is «بیش از ۷ روز». Half of
    // it is paid, so the read advances the displayed due date by one interval
    // month — the Jalali string add keeps the day, ۱۶ شهریور → ۱۶ مهر — and the
    // row lands two days ahead in «نزدیک سررسید» instead.
    await unscoped.appointment.create({
      data: {
        id: 'appt-plan',
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        customerId: CUSTOMER_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(TODAY_MIDNIGHT.getTime() - 29 * DAY_MS),
        localDate: '1405-07-14',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        source: 'RECEPTION',
        priceAtBooking: 1_000_000n,
      },
    })
    await unscoped.installment.create({
      data: {
        tenantId: TENANT_ID,
        appointmentId: 'appt-plan',
        sequence: 1,
        amount: 500_000n,
        paidAmount: 500_000n,
        type: 'INSTALLMENT',
        dueAt: new Date(TODAY_MIDNIGHT.getTime() - 29 * DAY_MS),
        totalPlanAmount: 1_000_000n,
        totalPlanCount: 2,
        intervalMonths: 1,
      },
    })

    const buckets = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })

    expect(buckets.overdue30).toHaveLength(0)
    expect(buckets.overdue7).toHaveLength(0)
    expect(buckets.overdue).toHaveLength(0)
    const [row] = buckets.dueSoon
    expect(row).toBeDefined()
    // The advance keeps the day of the month: ۱۶ شهریور + ۱ month = ۱۶ مهر, and
    // ۱۶ مهر is two days ahead at the pinned clock.
    expect(row!.dueLocalDate).toBe('1405-07-16')
    expect(row!.balance).toBe(500_000n)
    expect(row!.paidInstallments).toBe(1)
    expect(row!.totalInstallments).toBe(2)
    expect(row!.daysOverdue).toBe(-2)
  })

  it("lets the desk's promise win over the arithmetic, and the grace period push the session's day forward", async () => {
    // Forty days late on the session's own day, but the customer promised two days
    // from now and the desk recorded it — the override wins, and the row is offered
    // as a promise kept rather than a debt forty days old.
    await owe(-40, 'appt-promised')
    await unscoped.appointment.update({
      where: { id: 'appt-promised' },
      data: { debtDueDateOverride: new Date(TODAY_MIDNIGHT.getTime() + 2 * DAY_MS) },
    })

    const withGrace = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })
    const promised = allRows(withGrace).find((row) => row.appointmentId === 'appt-promised')
    expect(promised!.bucket).toBe(DebtBucket.DueSoon)
    expect(promised!.daysOverdue).toBe(-2)
    expect(promised!.dueDateOverride).not.toBeNull()

    // Two sessions three and forty days past, read first with no grace: the near
    // one is «گذشته از سررسید» and the far one «بیش از ۳۰ روز», which is what
    // their own session days say.
    await owe(-3, 'appt-grace')
    await owe(-40, 'appt-far')
    const before = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })
    expect(allRows(before).find((row) => row.appointmentId === 'appt-grace')!.bucket).toBe(
      DebtBucket.PastDue,
    )
    expect(allRows(before).find((row) => row.appointmentId === 'appt-far')!.bucket).toBe(
      DebtBucket.Over30Days,
    )

    // Five days of grace then move the near one: the effective due date is the
    // session's day + ۵, so ۳ days past becomes ۲ days ahead — while the
    // forty-day debt keeps its bucket, because grace softens the near edge and
    // not the far one.
    await unscoped.tenantSettings.update({
      where: { tenantId: TENANT_ID },
      data: { debtGraceDays: 5 },
    })
    const graced = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })
    expect(allRows(graced).find((row) => row.appointmentId === 'appt-grace')!.bucket).toBe(
      DebtBucket.DueSoon,
    )
    expect(allRows(graced).find((row) => row.appointmentId === 'appt-grace')!.daysOverdue).toBe(-2)
    expect(allRows(graced).find((row) => row.appointmentId === 'appt-far')!.bucket).toBe(
      DebtBucket.Over30Days,
    )
  })

  it('offers no row the desk cannot collect on, and no bucket holds one', async () => {
    // Settled: the whole price paid, so the balance is zero and the row disappears
    // even though its due date is forty days past.
    await owe(-40, 'appt-paid')
    await unscoped.payment.create({
      data: {
        tenantId: TENANT_ID,
        appointmentId: 'appt-paid',
        customerId: CUSTOMER_ID,
        recordedByUserId: DOCTOR_ID,
        amount: 1_000_000n,
        method: 'CASH',
        kind: 'FULL',
        paidAt: NOW,
      },
    })
    // Cancelled: not in the live statuses the read scans.
    await owe(-40, 'appt-cancelled')
    await unscoped.appointment.update({
      where: { id: 'appt-cancelled' },
      data: { status: AppointmentStatus.Cancelled },
    })
    // A blocked hour: no customer, so there is nobody to collect from.
    await unscoped.appointment.create({
      data: {
        id: 'appt-block',
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        customerId: null,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(TODAY_MIDNIGHT.getTime() - 40 * DAY_MS),
        localDate: '1405-07-14',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        isSlotBlock: true,
        source: 'RECEPTION',
        priceAtBooking: 0n,
      },
    })

    const buckets = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })
    for (const rows of [buckets.overdue30, buckets.overdue7, buckets.overdue, buckets.dueSoon]) {
      expect(rows).toHaveLength(0)
    }
  })
})

describe('the permission and the scope the read opens with', () => {
  it('refuses a doctor, who holds none of the debt permissions', async () => {
    await owe(-3, 'appt-doctor')

    const doctor: TenantContext = Object.freeze({
      ...context(),
      role: Role.Doctor,
      overrides: Object.freeze({ granted: [], revoked: [] }),
    })
    await expect(
      clinicDebts({ tx: unscoped as never, ctx: doctor, now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })

    // A secretary's defaults include «مشاهده بدهی‌ها», so the same read answers.
    const secretary: TenantContext = Object.freeze({
      ...doctor,
      role: Role.Secretary,
      overrides: Object.freeze({ granted: [Permission.ViewDebts], revoked: [] }),
    })
    const buckets = await clinicDebts({ tx: unscoped as never, ctx: secretary, now: NOW })
    expect(buckets.overdue).toHaveLength(1)

    // Both surfaces answer on the same permission: `contactList` is the other read.
    await expect(
      contactList({ tx: unscoped as never, ctx: doctor, now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })
  })

  it("limits a doctor's read to the doctor's own rows", async () => {
    await owe(-3, 'appt-own')
    await owe(-3, 'appt-other')
    await unscoped.appointment.update({
      where: { id: 'appt-other' },
      data: { doctorId: OTHER_DOCTOR_ID },
    })

    const asOwn: TenantContext = Object.freeze({
      ...context(),
      userId: OTHER_DOCTOR_ID,
      role: Role.Doctor,
      overrides: Object.freeze({ granted: [Permission.ViewDebts], revoked: [] }),
    })
    const buckets = await doctorDebts({ tx: unscoped as never, ctx: asOwn, now: NOW })
    expect(buckets.overdue).toHaveLength(1)
    expect(buckets.overdue[0]!.appointmentId).toBe('appt-other')

    // The clinic-wide read sees both, so the scope — and not the permission — is
    // what narrowed the doctor's list.
    const clinic = await clinicDebts({ tx: unscoped as never, ctx: context(), now: NOW })
    expect(clinic.overdue).toHaveLength(2)
  })
})
