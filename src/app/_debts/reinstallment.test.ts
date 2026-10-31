/**
 * «بازتعریف کل بدهی» — re-installing a debt — as the audit's CRITICAL area asks for it.
 *
 * The debts page's "re-install the whole debt" path is `recordPaymentWithInstallmentsAction`
 * with method `INSTALLMENT`, and the audit names the two facts that path must hold:
 * the old installment **closes** (`totalPlanAmount = paidAmount`, so nothing more is
 * owed on it and the read path stops offering it), and the new plan carries the
 * **remaining balance** as its `totalPlanAmount` — not the original price, and not
 * the amount already paid.
 *
 * This is the one suite in the repo that drives a Server Action, which is why it
 * builds the three things an action takes for granted and nothing else:
 *
 * - `prisma()` is pointed at the file-local test database (`vi.hoisted` holds the
 *   client the per-file harness built, because a mock factory cannot close over a
 *   `beforeAll` variable);
 * - `resolveStaffPanel` is replaced with a frozen manager session, so the action's
 *   permission door opens for a context the test chose and for no other;
 * - `revalidatePath` is silenced, because the suite has no router to invalidate.
 *
 * The clock is left real where its value is only a timestamp (`paidAt`,
 * `resultRecordedAt`) and bypassed where it is a decision: the re-installment's
 * base date is either the Jalali date the form sent or the previous plan's due date
 * plus the interval, and both are pinned by the test's own inputs so no wall-clock
 * read can move the answer. `realClock` itself is mocked to the seeded day
 * (۲۰۲۶-۱۰-۰۶T۱۰:۰۰Z = ۱۴۰۵/۰۷/۱۴ local at UTC+۳:۳۰), which is what keeps "a
 * firstDueDate equal to today" a case this suite can name at all.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppointmentStatus, CustomerLifecycle, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@prisma/client'

import { recordPaymentWithInstallmentsAction } from './actions'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-reinstall')
const CLINIC_ID = asClinicId('clinic-reinstall')
const DOCTOR_ID: UserId = asUserId('doctor-reinstall')
const CUSTOMER_ID = 'customer-reinstall'
const APPOINTMENT_ID = 'appointment-reinstall'

/** The price the visit was booked at — the debt the whole flow redistributes. */
const PRICE = 12_000_000n
/** What the customer paid before asking to re-install the rest: ۲٬۰۰۰٬۰۰۰. */
const PAID_UP_FRONT = 2_000_000n

/**
 * The fixed clock — ۱۵ مهر ۱۴۰۵, the seeded day. Any read of "today" the action
 * makes lands here, so a `firstDueDate` of ۱۴۰۵/۰۸/۱۵ is *today* and anything
 * else is a date the form chose.
 */
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
    data: [{ id: TENANT_ID, slug: 'reinstall', name: 'الف', isActive: true }],
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
        mobile: '09120000080',
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
        mobile: '09130000080',
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
        priceAtBooking: PRICE,
      },
    ],
  })
})

/** One open installment plan on the appointment, `paid` of it already collected. */
async function seedOpenPlan(paid: bigint): Promise<string> {
  const plan = await unscoped.installment.create({
    data: {
      tenantId: TENANT_ID,
      appointmentId: APPOINTMENT_ID,
      sequence: 1,
      amount: 2_000_000n,
      paidAmount: paid,
      type: 'INSTALLMENT',
      dueAt: new Date('2026-11-20T20:30:00.000Z'),
      totalPlanAmount: PRICE,
      totalPlanCount: 6,
      intervalMonths: 1,
    },
  })

  if (paid > 0n) {
    await unscoped.payment.create({
      data: {
        tenantId: TENANT_ID,
        appointmentId: APPOINTMENT_ID,
        customerId: CUSTOMER_ID,
        recordedByUserId: DOCTOR_ID,
        amount: paid,
        method: 'CASH',
        kind: 'PARTIAL',
        paidAt: NOW,
        installmentId: plan.id,
      },
    })
  }

  return plan.id
}

async function reInstall(args: {
  readonly amount: string
  readonly installmentCount: number
  readonly firstDueDate: string
  readonly installmentInterval?: string
  readonly discountAmount?: string
  readonly installmentId?: string
}) {
  return recordPaymentWithInstallmentsAction('admin', APPOINTMENT_ID, CUSTOMER_ID, {
    method: 'INSTALLMENT',
    amount: args.amount,
    installmentCount: args.installmentCount,
    firstDueDate: args.firstDueDate,
    installmentInterval: args.installmentInterval ?? '1_MONTH',
    discountAmount: args.discountAmount ?? '0',
    discountReason: null,
    forceInstallment: true,
    note: null,
    installmentId: args.installmentId ?? null,
  })
}

describe('«بازتعریف کل بدهی» — closing the old plan and opening the new one', () => {
  it('closes the old installment at exactly what was paid, and nothing more is owed on it', async () => {
    const oldId = await seedOpenPlan(PAID_UP_FRONT)

    const result = await reInstall({
      amount: '0',
      installmentCount: 4,
      firstDueDate: '1405-08-16',
    })
    expect(result).toEqual({ ok: true })

    const old = await unscoped.installment.findUniqueOrThrow({ where: { id: oldId } })
    // The old plan closes at its paid amount: `totalPlanAmount = paidAmount`, so the
    // owed remainder on it is zero and no read path can offer it as open debt.
    expect(old.totalPlanAmount).toBe(old.paidAmount)
    expect(old.paidAmount).toBe(PAID_UP_FRONT)
    expect(old.totalPlanCount).toBe(6)
  })

  it("creates the new plan on the remaining balance, sequenced after the old one", async () => {
    await seedOpenPlan(PAID_UP_FRONT)

    const result = await reInstall({
      amount: '0',
      installmentCount: 4,
      firstDueDate: '1405-08-16',
    })
    expect(result).toEqual({ ok: true })

    // The amount passed is zero, so `payableAmount` is the whole remaining balance:
    // ۱۲٬۰۰۰٬۰۰۰ − ۲٬۰۰۰٬۰۰۰ paid = ۱۰٬۰۰۰٬۰۰۰ redistributed over ۴ installments.
    const plans = await unscoped.installment.findMany({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID },
      orderBy: { sequence: 'asc' },
    })
    expect(plans).toHaveLength(2)

    const next = plans[1]!
    expect(next.sequence).toBe(2)
    expect(next.totalPlanAmount).toBe(PRICE - PAID_UP_FRONT)
    expect(next.totalPlanCount).toBe(4)
    expect(next.intervalMonths).toBe(1)
    expect(next.paidAmount).toBe(0n)
    expect(next.type).toBe('INSTALLMENT')
    // ۱۰٬۰۰۰٬۰۰۰ / ۴ = ۲٬۵۰۰٬۰۰۰ even, so the remainder distribution is trivial here
    // and the amount is the plan's own share.
    expect(next.amount).toBe(2_500_000n)
  })

  it("refuses when nothing remains to re-install", async () => {
    await seedOpenPlan(PRICE)

    const result = await reInstall({
      amount: '0',
      installmentCount: 3,
      firstDueDate: '1405-08-16',
    })
    expect(result).toEqual({ ok: false, message: 'بدهی به طور کامل پرداخت شده است.' })

    expect(await unscoped.installment.count()).toBe(1)
  })

  it("subtracts a discount taken at re-installment from the new plan's total", async () => {
    await seedOpenPlan(PAID_UP_FRONT)

    const result = await reInstall({
      amount: '0',
      installmentCount: 2,
      firstDueDate: '1405-08-16',
      discountAmount: '1,000,000',
    })
    expect(result).toEqual({ ok: true })

    // ۱۰٬۰۰۰٬۰۰۰ remaining less the ۱٬۰۰۰٬۰۰۰ discount = ۹٬۰۰۰٬۰۰۰ over two rows,
    // with the odd rial — there is none here, but the split must still be exact.
    const next = await unscoped.installment.findFirst({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, sequence: 2 },
    })
    expect(next).not.toBeNull()
    expect(next!.totalPlanAmount).toBe(PRICE - PAID_UP_FRONT - 1_000_000n)
    expect(next!.amount).toBe(4_500_000n)

    // The discount is recorded as the zero-amount payment row the ledger expects,
    // attached to the new plan so the two move together.
    const discountRow = await unscoped.payment.findFirst({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, installmentId: next!.id },
    })
    expect(discountRow).not.toBeNull()
    expect(discountRow!.amount).toBe(0n)
    expect(discountRow!.discountAmount).toBe(1_000_000n)
  })

  it("uses the previous plan's due date plus the interval when no new date is chosen", async () => {
    await seedOpenPlan(PAID_UP_FRONT)

    // The form's date is *today* (۱۴۰۵/۰۷/۱۴ at the mocked clock — ۲۰۲۶-۱۰-۰۶
    // local), which is the "no new date" case: the base is the old plan's due
    // date — ۳۰ آبان ۱۴۰۵ — plus one interval month, i.e. ۳۰ آذر ۱۴۰۵.
    const result = await reInstall({
      amount: '0',
      installmentCount: 3,
      firstDueDate: '1405-07-14',
    })
    expect(result).toEqual({ ok: true })

    const next = await unscoped.installment.findFirst({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, sequence: 2 },
    })
    expect(next).not.toBeNull()
    // The old plan's due instant is ۲۰۲۶-۱۱-۲۰T۲۰:۳۰Z = ۳۰ آبان ۱۴۰۵; one Jalali
    // month later is ۳۰ آذر — a 30-day month clamping to another 30-day month.
    expect(next!.dueAt.toISOString()).toBe('2026-12-20T20:30:00.000Z')
  })

  it("marks the appointment completed when the debt is re-installed", async () => {
    await seedOpenPlan(PAID_UP_FRONT)

    await reInstall({ amount: '0', installmentCount: 3, firstDueDate: '1405-08-16' })

    const appointment = await unscoped.appointment.findUniqueOrThrow({ where: { id: APPOINTMENT_ID } })
    expect(appointment.status).toBe(AppointmentStatus.Completed)
    expect(appointment.resultRecordedAt).toEqual(NOW)
  })

  it("refuses a typed amount larger than the outstanding balance instead of re-billing it", async () => {
    await seedOpenPlan(PAID_UP_FRONT)

    // The dialog's amount field is pre-filled with the remainder but editable; a
    // desk that types the *price* (۱۲٬۰۰۰٬۰۰۰) over a ۱۰٬۰۰۰٬۰۰۰ remainder must be
    // refused rather than silently creating a plan larger than the debt.
    const result = await reInstall({
      amount: '12,000,000',
      installmentCount: 3,
      firstDueDate: '1405-08-16',
    })
    expect(result).toEqual({
      ok: false,
      message: 'مبلغ پرداختی نمی‌تواند بیشتر از باقی‌مانده این قسط باشد.',
    })

    const old = await unscoped.installment.findMany({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID },
    })
    expect(old).toHaveLength(1)
    expect(old[0]!.totalPlanAmount).toBe(PRICE)
  })

  it("does not touch another appointment's installments", async () => {
    const oldId = await seedOpenPlan(PAID_UP_FRONT)
    // A second appointment in the same tenant with its own open plan; the action
    // is scoped to its own appointment's rows.
    const otherAppointmentId = 'appointment-reinstall-other'
    await unscoped.appointment.create({
      data: {
        id: otherAppointmentId,
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        customerId: CUSTOMER_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date('2026-10-06T00:00:00.000Z'),
        localDate: '1405-07-14',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        source: 'RECEPTION',
        priceAtBooking: 8_000_000n,
      },
    })
    const otherId = (
      await unscoped.installment.create({
        data: {
          tenantId: TENANT_ID,
          appointmentId: otherAppointmentId,
          sequence: 1,
          amount: 2_000_000n,
          paidAmount: 1_000_000n,
          type: 'INSTALLMENT',
          dueAt: new Date('2026-11-20T20:30:00.000Z'),
          totalPlanAmount: 8_000_000n,
          totalPlanCount: 4,
          intervalMonths: 1,
        },
      })
    ).id

    const result = await reInstall({ amount: '0', installmentCount: 3, firstDueDate: '1405-08-16' })
    expect(result).toEqual({ ok: true })

    const other = await unscoped.installment.findUniqueOrThrow({ where: { id: otherId } })
    expect(other.totalPlanAmount).toBe(8_000_000n)
    expect(other.paidAmount).toBe(1_000_000n)

    const own = await unscoped.installment.findUniqueOrThrow({ where: { id: oldId } })
    expect(own.totalPlanAmount).toBe(own.paidAmount)
  })
})
