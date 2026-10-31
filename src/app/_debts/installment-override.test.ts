/**
 * ویرایش موقتِ یک مرحله از قسط — سمتِ Server Action.
 *
 * «قسط‌ها» سررسید و مبلغ هر مرحله را از «اولین سررسید + بازه‌ی ماهانه» می‌سازند.
 * ویرایشِ مرحله‌ای (دکمه‌ی ✏️) فقط **همین یک مرحله** را تغییر می‌دهد و قرار است پس از پرداخت
 * و رفتن به مرحله‌ی بعد، سررسید به همان تاریخ anchored برگردد. به همین دلیل:
 *
 * - `updateInstallmentAction` نباید ستون‌های `dueAt` و `amount` را بنویسد؛ تغییر در
 *   `note` با دو توکن `OVERRIDE:YYYY-MM-DD` (تقویم جلالی) و `OVERRIDE_AMOUNT:<ریال>`
 *   ذخیره می‌شود.
 * - «بازتعریف کل بدهی» (`recordPaymentWithInstallmentsAction`) طرح جدید را باز می‌کند
 *   و noteی آن باید عاری از توکن‌های ویرایش موقت باشد.
 *
 * این مجموعه همان سه چیزِ `reinstallment.test.ts` را می‌سازد: «پرایسمای» روی دیتابیس
 * آزمایشیِ این فایل، `resolveStaffPanel` با جلسه‌ی مدیر، و `revalidatePath` خاموش.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppointmentStatus, CustomerLifecycle, Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { PrismaClient } from '@prisma/client'

import {
  recordPaymentWithInstallmentsAction,
  updateInstallmentAction,
} from './actions'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-override')
const CLINIC_ID = asClinicId('clinic-override')
const DOCTOR_ID: UserId = asUserId('doctor-override')
const CUSTOMER_ID = 'customer-override'
const APPOINTMENT_ID = 'appointment-override'

/** مبلغِ هر مرحله از طرح — ۲٬۰۰۰٬۰۰۰ ریال. */
const PER_STAGE = 2_000_000n
/** کل طرحِ قسطی — ۱۰٬۰۰۰٬۰۰۰ ریال در ۵ مرحله. */
const PLAN_TOTAL = 10_000_000n

/** The fixed clock — ۱۵ مهر ۱۴۰۵, the seeded day. */
const NOW = new Date('2026-10-06T10:00:00.000Z')

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
    data: [{ id: TENANT_ID, slug: 'override', name: 'الف', isActive: true }],
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
        mobile: '09130000090',
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
        priceAtBooking: PLAN_TOTAL,
      },
    ],
  })
})

/** طرحِ قسطیِ باز با یک noteی معمولی — بدون توکنِ ویرایش موقت. */
async function seedPlan(): Promise<string> {
  const plan = await unscoped.installment.create({
    data: {
      tenantId: TENANT_ID,
      appointmentId: APPOINTMENT_ID,
      sequence: 1,
      amount: PER_STAGE,
      paidAmount: 0n,
      type: 'INSTALLMENT',
      dueAt: new Date('2026-11-20T20:30:00.000Z'),
      totalPlanAmount: PLAN_TOTAL,
      totalPlanCount: 5,
      intervalMonths: 1,
      note: 'یادداشت ریسپشن',
    },
  })
  return plan.id
}

describe('updateInstallmentAction — ویرایش موقت در note نوشته می‌شود', () => {
  it('writes both override tokens and leaves the anchored columns untouched', async () => {
    const planId = await seedPlan()
    const before = await unscoped.installment.findUniqueOrThrow({ where: { id: planId } })

    const result = await updateInstallmentAction('admin', planId, {
      newDueDate: '1405-08-18',
      newAmount: '2,500,000',
    })
    expect(result).toEqual({ ok: true })

    const after = await unscoped.installment.findUniqueOrThrow({ where: { id: planId } })
    // سررسید و مبلغِ anchored دست‌نخورده می‌مانند؛ فقط note عوض می‌شود.
    expect(after.dueAt).toEqual(before.dueAt)
    expect(after.amount).toBe(PER_STAGE)
    expect(after.note).toBe(
      'OVERRIDE:1405-08-18 OVERRIDE_AMOUNT:2500000 یادداشت ریسپشن',
    )
  })

  it('replaces the previous override instead of stacking a second one', async () => {
    const planId = await seedPlan()

    await updateInstallmentAction('admin', planId, {
      newDueDate: '1405-08-18',
      newAmount: '2,500,000',
    })
    await updateInstallmentAction('admin', planId, {
      newDueDate: '1405-09-02',
      newAmount: '1,800,000',
    })

    const after = await unscoped.installment.findUniqueOrThrow({ where: { id: planId } })
    expect(after.note).toBe('OVERRIDE:1405-09-02 OVERRIDE_AMOUNT:1800000 یادداشت ریسپشن')
    expect(after.note!.match(/OVERRIDE:/g)).toHaveLength(1)
    expect(after.note!.match(/OVERRIDE_AMOUNT:/g)).toHaveLength(1)
  })

  it('keeps the note readable for the display paths', async () => {
    const planId = await seedPlan()

    await updateInstallmentAction('admin', planId, {
      newDueDate: '1405-08-18',
      newAmount: '2,500,000',
    })

    const after = await unscoped.installment.findUniqueOrThrow({ where: { id: planId } })
    // خوانندگانِ جدول‌ها: توکنِ تاریخِ جلالی و توکنِ مبلغ.
    expect(after.note!.match(/OVERRIDE:(\d{4}-\d{2}-\d{2})/)?.[1]).toBe('1405-08-18')
    expect(after.note!.match(/OVERRIDE_AMOUNT:(\d+)/)?.[1]).toBe('2500000')
    // بقیه‌ی note سر جایش است.
    expect(after.note).toContain('یادداشت ریسپشن')
  })
})

describe('«بازتعریف کل بدهی» — ویرایش موقت به طرح جدید نشت نمی‌کند', () => {
  it('builds the new plan note without the override tokens', async () => {
    const planId = await seedPlan()
    await updateInstallmentAction('admin', planId, {
      newDueDate: '1405-08-18',
      newAmount: '2,500,000',
    })

    const result = await recordPaymentWithInstallmentsAction('admin', APPOINTMENT_ID, CUSTOMER_ID, {
      method: 'INSTALLMENT',
      amount: '0',
      installmentCount: 4,
      firstDueDate: '1405-08-16',
      installmentInterval: '1_MONTH',
      discountAmount: '0',
      discountReason: null,
      forceInstallment: true,
      // مبلغ‌ها در دیالوگ قابل تایپ است؛ حتی اگر کاربر توکنی در note نوشته بود،
      // طرح جدید نباید آن را به ارث ببرد.
      note: 'OVERRIDE:1405-09-01 OVERRIDE_AMOUNT:9000000 یادداشتِ بازتعریف',
      installmentId: planId,
    })
    expect(result).toEqual({ ok: true })

    const next = await unscoped.installment.findFirst({
      where: { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, sequence: 2 },
    })
    expect(next).not.toBeNull()
    expect(next!.note).toBe('یادداشتِ بازتعریف')
    expect(next!.note).not.toContain('OVERRIDE')
    // طرح جدید از مبلغِ استانداردِ هر مرحله استفاده می‌کند، نه از مبلغ موقت.
    expect(next!.amount).toBe(PLAN_TOTAL / 4n)
  })
})
