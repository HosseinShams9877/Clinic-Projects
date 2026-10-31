/**
 * The financial reports — area 6: the monthly collections the manager's panel
 * renders, and the two windows the module reads them through.
 *
 * `financialSummary` is the range report: `paidAt` over a half-open `[from, to)`,
 * with refunds split out of the gross and counted on their own, discounts summed
 * beside them, and a per-method breakdown. `paymentsThisMonth` is the KPI tile:
 * the current Jalali month's payments, read on `createdAt` and bounded by the
 * local day the offset names.
 *
 * The audit's question for this area is whether the two windows agree — one reads
 * `paidAt` and the other `createdAt`, and a payment recorded today for a day last
 * month is in one month's report and out of the other's. That is the case the
 * last test names directly: both functions are exercised on the same seeded row,
 * and the two answers are compared with each other and not with a hope.
 *
 * Rows are seeded straight to the table because the case's facts are the two
 * timestamps and a back-dated `paidAt` is not a thing the writer offers; the
 * read is the module's own, so what is asserted is what the page renders.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AppointmentStatus,
  CustomerLifecycle,
  PaymentKind,
  PaymentMethod,
  Permission,
  Role,
} from '@/core/constants'
import {
  asClinicId,
  asTenantId,
  asUserId,
  PermissionError,
  type TenantId,
  type UserId,
} from '@/core/types'
import { EMPTY_PERMISSION_OVERRIDES, type TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@prisma/client'

import { appointmentPaymentLines, financialSummary, paymentsThisMonth } from '@/modules/payments'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-reports')
const CLINIC_ID = asClinicId('clinic-reports')
const STAFF_ID: UserId = asUserId('staff-reports')
const DOCTOR2_ID: UserId = asUserId('doctor2-reports')
const CUSTOMER_ID = 'customer-reports'
const APPOINTMENT_ID = 'appointment-reports'
const APPOINTMENT2_ID = 'appointment2-reports'

/** مهر ۱۴۰۵, ۱۳:۳۰ local — the seeded clock every range is read against. */
const NOW = new Date('2026-10-06T10:00:00.000Z')

/** UTC+۳:۳۰, the offset every local boundary below is shifted by. */
const OFFSET = 210

/**
 * ۱۴۰۵/۰۷/۰۱ at ۰۰:۰۰ local — مهر's first instant. مهر has ۳۰ days, so the month
 * that ends at `MEHR_END` is the one `paymentsThisMonth` names at `NOW`.
 */
const MEHR_START = new Date('2026-09-22T20:30:00.000Z')

/** ۱۴۰۵/۰۸/۰۱ at ۰۰:۰۰ local — the instant مهر ends and آبان begins. */
const MEHR_END = new Date('2026-10-22T20:30:00.000Z')

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
    data: [{ id: TENANT_ID, slug: 'reports', name: 'الف', isActive: true }],
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
        id: STAFF_ID,
        tenantId: TENANT_ID,
        mobile: '09120000050',
        firstName: 'پذیرش',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: DOCTOR2_ID,
        tenantId: TENANT_ID,
        mobile: '09120000051',
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
        mobile: '09130000050',
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
        doctorId: STAFF_ID,
        scheduledAt: new Date('2026-10-05T00:00:00Z'),
        localDate: '1405-07-13',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Completed,
        source: 'RECEPTION',
        priceAtBooking: 1_000_000n,
      },
      {
        id: APPOINTMENT2_ID,
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        customerId: CUSTOMER_ID,
        doctorId: DOCTOR2_ID,
        scheduledAt: new Date('2026-10-05T00:00:00Z'),
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

/** One payment row, with the two timestamps the two windows read. */
async function payment(args: {
  readonly id: string
  readonly amount: bigint
  readonly kind?: string
  readonly method?: string
  readonly discountAmount?: bigint
  readonly paidAt: Date
  readonly createdAt: Date
  readonly appointmentId?: string
  readonly installmentId?: string
}): Promise<void> {
  await unscoped.payment.create({
    data: {
      id: args.id,
      tenantId: TENANT_ID,
      appointmentId: args.appointmentId ?? APPOINTMENT_ID,
      customerId: CUSTOMER_ID,
      recordedByUserId: STAFF_ID,
      amount: args.amount,
      discountAmount: args.discountAmount ?? 0n,
      method: args.method ?? PaymentMethod.Cash,
      kind: args.kind ?? PaymentKind.Final,
      paidAt: args.paidAt,
      createdAt: args.createdAt,
      ...(args.installmentId !== undefined ? { installmentId: args.installmentId } : {}),
    },
  })
}

/**
 * One installment plan — the `Payment` row carries no stage number, so the read
 * rebuilds it from the plan's `amount` (the per-stage sum) and `totalPlanCount`.
 */
async function installment(args: {
  readonly id: string
  readonly sequence: number
  readonly amount: bigint
  readonly totalPlanCount?: number
  readonly type?: string
  readonly appointmentId?: string
}): Promise<void> {
  await unscoped.installment.create({
    data: {
      id: args.id,
      tenantId: TENANT_ID,
      appointmentId: args.appointmentId ?? APPOINTMENT_ID,
      sequence: args.sequence,
      amount: args.amount,
      paidAmount: 0n,
      type: args.type ?? 'INSTALLMENT',
      dueAt: NOW,
      ...(args.totalPlanCount !== undefined ? { totalPlanCount: args.totalPlanCount } : {}),
    },
  })
}

/** The caller the read is served to — a manager by default, `ViewDebts` in hand. */
function context(args: { readonly role?: Role; readonly viewDebts?: boolean } = {}): TenantContext {
  const granted = args.viewDebts === false ? [] : [Permission.ViewDebts]
  return Object.freeze({
    userId: STAFF_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: args.role ?? Role.Manager,
    overrides:
      granted.length === 0
        ? EMPTY_PERMISSION_OVERRIDES
        : Object.freeze({ granted, revoked: [] }),
  })
}

describe('financialSummary — the range report', () => {
  it('reads paidAt over a half-open [from, to): the from edge in, the to edge out', async () => {
    await payment({
      id: 'p-at-from',
      amount: 100_000n,
      paidAt: MEHR_START,
      createdAt: MEHR_START,
    })
    await payment({
      id: 'p-inside',
      amount: 200_000n,
      paidAt: new Date('2026-10-05T00:00:00Z'),
      createdAt: new Date('2026-10-05T00:00:00Z'),
    })
    await payment({
      id: 'p-at-to',
      amount: 400_000n,
      paidAt: MEHR_END,
      createdAt: MEHR_END,
    })
    await payment({
      id: 'p-before',
      amount: 800_000n,
      paidAt: new Date('2026-09-01T00:00:00Z'),
      createdAt: new Date('2026-09-01T00:00:00Z'),
    })

    const read = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })

    // The two rows the half-open interval holds — `from` inclusive, `to`
    // exclusive — and the two outside it counted by nothing.
    expect(read.gross).toBe(300_000n)
    expect(read.paymentCount).toBe(2)
    // The report reads the payment's own day (`paidAt`) and not the day the row
    // was written, so a payment recorded inside the month but paid before it is
    // the previous month's money.
    expect(read.discounts).toBe(0n)
    expect(read.refunds).toBe(0n)
    expect(read.refundCount).toBe(0)
  })

  it('separates the refunds from the gross, and the discounts from both', async () => {
    await payment({
      id: 'p-paid',
      amount: 500_000n,
      method: PaymentMethod.Card,
      paidAt: new Date('2026-10-05T00:00:00Z'),
      createdAt: new Date('2026-10-05T00:00:00Z'),
    })
    // A discount granted beside the payment — the discount's own row is the
    // `discountAmount` on the paying row, never a payment of its own.
    await payment({
      id: 'p-discounted',
      amount: 250_000n,
      discountAmount: 50_000n,
      method: PaymentMethod.Cash,
      paidAt: new Date('2026-10-06T00:00:00Z'),
      createdAt: new Date('2026-10-06T00:00:00Z'),
    })
    // A refund stores a negative amount (`balance.ts`'s one subtraction serves
    // both directions), so the gross that excluded it and the refunds field
    // that holds it are the two sides of the same ledger.
    await payment({
      id: 'p-refund',
      amount: -75_000n,
      kind: PaymentKind.Refund,
      method: PaymentMethod.Card,
      paidAt: new Date('2026-10-07T00:00:00Z'),
      createdAt: new Date('2026-10-07T00:00:00Z'),
    })

    const read = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })

    // Gross is the two payments only; the refund is neither added to it nor
    // silently netted out of it — it is reported on its own line, so the panel
    // can show the clinic what it handed back.
    expect(read.gross).toBe(750_000n)
    expect(read.paymentCount).toBe(2)
    expect(read.discounts).toBe(50_000n)
    expect(read.refunds).toBe(-75_000n)
    expect(read.refundCount).toBe(1)
  })

  it('answers zero for an empty range rather than null — the aggregate’s null sums', async () => {
    const read = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })

    // A Prisma aggregate over no rows answers `null` for every sum, and the
    // report's `?? 0n` fallbacks are what keep an empty month a number the page
    // can render instead of a null it would have to explain.
    expect(read).toEqual({
      gross: 0n,
      discounts: 0n,
      refunds: 0n,
      paymentCount: 0,
      refundCount: 0,
      byMethod: [],
    })
  })

  it("breaks the month down by method, with each method's own count", async () => {
    await payment({
      id: 'p-cash-1',
      amount: 100_000n,
      method: PaymentMethod.Cash,
      paidAt: new Date('2026-10-05T00:00:00Z'),
      createdAt: new Date('2026-10-05T00:00:00Z'),
    })
    await payment({
      id: 'p-cash-2',
      amount: 50_000n,
      method: PaymentMethod.Cash,
      paidAt: new Date('2026-10-05T12:00:00Z'),
      createdAt: new Date('2026-10-05T12:00:00Z'),
    })
    await payment({
      id: 'p-online',
      amount: 300_000n,
      method: PaymentMethod.Online,
      paidAt: new Date('2026-10-06T00:00:00Z'),
      createdAt: new Date('2026-10-06T00:00:00Z'),
    })

    const read = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })

    const byMethod = new Map(read.byMethod.map((row) => [row.method, row]))
    expect(byMethod.get(PaymentMethod.Cash)).toEqual({ method: 'CASH', amount: 150_000n, count: 2 })
    expect(byMethod.get(PaymentMethod.Online)).toEqual({
      method: 'ONLINE',
      amount: 300_000n,
      count: 1,
    })
    // No card payments this month — a method with no rows holds no entry at all,
    // so the panel renders the methods the clinic used and not every method it has.
    expect(byMethod.has(PaymentMethod.Card)).toBe(false)
  })

  it("narrows to one doctor's appointments when a doctorId is named", async () => {
    // The same month, two appointments, two doctors — the clinic-wide read holds
    // both, and the doctor-scoped read holds only the doctor's own sessions.
    await payment({
      id: 'p-receptions-visit',
      amount: 200_000n,
      method: PaymentMethod.Cash,
      paidAt: new Date('2026-10-05T00:00:00Z'),
      createdAt: new Date('2026-10-05T00:00:00Z'),
    })
    await payment({
      id: 'p-doctor2s-visit',
      amount: 150_000n,
      method: PaymentMethod.Online,
      appointmentId: APPOINTMENT2_ID,
      paidAt: new Date('2026-10-06T00:00:00Z'),
      createdAt: new Date('2026-10-06T00:00:00Z'),
    })

    const clinicWide = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })
    expect(clinicWide.gross).toBe(350_000n)
    expect(clinicWide.paymentCount).toBe(2)

    const doctorScoped = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
      doctorId: DOCTOR2_ID,
    })

    // The doctor's panel is their own book — the clinic's other ۲۰۰,۰۰۰ is
    // someone else's income, and the breakdown the doctor sees names only the
    // method their own patients paid with.
    expect(doctorScoped.gross).toBe(150_000n)
    expect(doctorScoped.paymentCount).toBe(1)
    expect(doctorScoped.byMethod).toEqual([{ method: 'ONLINE', amount: 150_000n, count: 1 }])
  })
})

describe('paymentsThisMonth — the KPI tile', () => {
  it('sums the rows the current Jalali month holds, over the month’s own local bounds', async () => {
    // Inside مهر: the month's first instant and a day in the middle.
    await payment({
      id: 'p-month-start',
      amount: 100_000n,
      paidAt: MEHR_START,
      createdAt: MEHR_START,
    })
    await payment({
      id: 'p-mid',
      amount: 250_000n,
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })
    // Outside: شهریور, the month before — `createdAt` before the month began.
    await payment({
      id: 'p-last-month',
      amount: 999_999n,
      paidAt: new Date('2026-09-01T00:00:00Z'),
      createdAt: new Date('2026-09-01T00:00:00Z'),
    })

    const sum = await paymentsThisMonth(unscoped as never, TENANT_ID, NOW, OFFSET)
    expect(sum).toBe(350_000n)
  })

  it('reads createdAt where the range report reads paidAt — a back-dated row is one month’s collection and the other’s gap', async () => {
    // A payment the desk recorded today — the row's own `createdAt` — for a day
    // that is still inside مهر, so both windows hold it and the two agree.
    await payment({
      id: 'p-both',
      amount: 120_000n,
      paidAt: new Date('2026-10-05T00:00:00Z'),
      createdAt: NOW,
    })

    const rangeMonth = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })
    const tile = await paymentsThisMonth(unscoped as never, TENANT_ID, NOW, OFFSET)
    expect(rangeMonth.gross).toBe(120_000n)
    expect(tile).toBe(120_000n)

    // The same desk action, recorded today, but for a session paid in شهریور:
    // `paidAt` is last month and `createdAt` is this month, so the tile counts
    // the money the range report does not. The two windows are the report's own
    // choice of timestamp and not the same one twice — an honest divergence the
    // audit names, and one the panel's two numbers do not reconcile over.
    await payment({
      id: 'p-back-dated',
      amount: 400_000n,
      paidAt: new Date('2026-09-15T00:00:00Z'),
      createdAt: NOW,
    })

    const rangeAfter = await financialSummary({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      from: MEHR_START,
      to: MEHR_END,
    })
    const tileAfter = await paymentsThisMonth(unscoped as never, TENANT_ID, NOW, OFFSET)
    expect(rangeAfter.gross).toBe(120_000n) // شهریور's money is not مهر's.
    expect(tileAfter).toBe(520_000n) // ...but the row was written in مهر.
  })
})

describe('appointmentPaymentLines — the drill-down table', () => {
  it("rebuilds each payment's stage from the plan — the same accumulation the debt row counts", async () => {
    // A ۴-stage plan at ۱۲۰,۰۰۰ a stage. The second and third payments are a
    // partial payment and the one that completes the same stage, so the running
    // total names stage ۲ twice — the exact case a per-payment counter would
    // get wrong, and the reason the read walks `paidAt` in order.
    await installment({ id: 'plan-4', sequence: 1, amount: 120_000n, totalPlanCount: 4 })
    await payment({
      id: 'p-s1',
      amount: 120_000n,
      installmentId: 'plan-4',
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })
    await payment({
      id: 'p-s2a',
      amount: 60_000n,
      installmentId: 'plan-4',
      paidAt: new Date('2026-10-02T00:00:00Z'),
      createdAt: new Date('2026-10-02T00:00:00Z'),
    })
    await payment({
      id: 'p-s2b',
      amount: 60_000n,
      installmentId: 'plan-4',
      paidAt: new Date('2026-10-03T00:00:00Z'),
      createdAt: new Date('2026-10-03T00:00:00Z'),
    })
    await payment({
      id: 'p-s3',
      amount: 120_000n,
      installmentId: 'plan-4',
      paidAt: new Date('2026-10-04T00:00:00Z'),
      createdAt: new Date('2026-10-04T00:00:00Z'),
    })

    const lines = await appointmentPaymentLines({
      tx: unscoped as never,
      ctx: context(),
      appointmentIds: [APPOINTMENT_ID],
    })

    expect(lines.map((line) => [line.id, line.stage])).toEqual([
      ['p-s1', { kind: 'INSTALLMENT', sequence: 1, total: 4 }],
      ['p-s2a', { kind: 'INSTALLMENT', sequence: 2, total: 4 }],
      ['p-s2b', { kind: 'INSTALLMENT', sequence: 2, total: 4 }],
      ['p-s3', { kind: 'INSTALLMENT', sequence: 3, total: 4 }],
    ])

    // The row's own facts — what the dialog renders beside the «قسط ۲ از ۴» label.
    expect(lines[1]).toMatchObject({
      appointmentId: APPOINTMENT_ID,
      installmentId: 'plan-4',
      customerName: 'مشتری',
      amount: 60_000n,
      method: PaymentMethod.Cash,
    })
  })

  it("labels a cheque plan's payments as cheques, whatever the running total", async () => {
    // A CHEQUE plan is not an installment ladder — every payment on it is a
    // cheque, and no accumulation is allowed to renumber it into a stage.
    await installment({
      id: 'plan-cheque',
      sequence: 1,
      amount: 500_000n,
      totalPlanCount: 2,
      type: 'CHEQUE',
    })
    await payment({
      id: 'p-chq-1',
      amount: 500_000n,
      installmentId: 'plan-cheque',
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })
    await payment({
      id: 'p-chq-2',
      amount: 500_000n,
      installmentId: 'plan-cheque',
      paidAt: new Date('2026-10-02T00:00:00Z'),
      createdAt: new Date('2026-10-02T00:00:00Z'),
    })

    const lines = await appointmentPaymentLines({
      tx: unscoped as never,
      ctx: context(),
      appointmentIds: [APPOINTMENT_ID],
    })

    expect(lines.map((line) => line.stage)).toEqual([{ kind: 'CHEQUE' }, { kind: 'CHEQUE' }])
  })

  it('falls back to the payment’s own kind where no installment is named', async () => {
    // A cash deposit on a visit with no plan — the dialog cannot call it a
    // stage, so it carries the payment's own kind as its label.
    await payment({
      id: 'p-deposit',
      amount: 100_000n,
      kind: PaymentKind.Deposit,
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })

    const lines = await appointmentPaymentLines({
      tx: unscoped as never,
      ctx: context(),
      appointmentIds: [APPOINTMENT_ID],
    })

    expect(lines).toEqual([
      expect.objectContaining({
        id: 'p-deposit',
        installmentId: null,
        stage: { kind: 'PAYMENT', label: 'بیعانه' },
      }),
    ])
  })

  it('reads only the appointments named — a visit not asked for is not listed', async () => {
    await payment({
      id: 'p-here',
      amount: 100_000n,
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })
    await payment({
      id: 'p-there',
      amount: 200_000n,
      appointmentId: APPOINTMENT2_ID,
      paidAt: new Date('2026-10-02T00:00:00Z'),
      createdAt: new Date('2026-10-02T00:00:00Z'),
    })

    const lines = await appointmentPaymentLines({
      tx: unscoped as never,
      ctx: context(),
      appointmentIds: [APPOINTMENT2_ID],
    })

    expect(lines.map((line) => line.id)).toEqual(['p-there'])
  })

  it('answers an empty list without asking the table', async () => {
    await payment({
      id: 'p-ignored',
      amount: 100_000n,
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })

    const lines = await appointmentPaymentLines({
      tx: unscoped as never,
      ctx: context(),
      appointmentIds: [],
    })

    expect(lines).toEqual([])
  })

  it('refuses a caller without ViewDebts, and serves one the override grants', async () => {
    await payment({
      id: 'p-gated',
      amount: 100_000n,
      paidAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })

    // A doctor's role default holds no `ViewDebts` — the doctor's panel reaches
    // this read through an override grant, which is the path the page takes.
    await expect(
      appointmentPaymentLines({
        tx: unscoped as never,
        ctx: context({ role: Role.Doctor, viewDebts: false }),
        appointmentIds: [APPOINTMENT_ID],
      }),
    ).rejects.toBeInstanceOf(PermissionError)

    const lines = await appointmentPaymentLines({
      tx: unscoped as never,
      ctx: context({ role: Role.Doctor }),
      appointmentIds: [APPOINTMENT_ID],
    })

    expect(lines.map((line) => line.id)).toEqual(['p-gated'])
  })
})
