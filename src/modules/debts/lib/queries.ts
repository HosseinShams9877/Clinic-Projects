/**
 * The module's reads — the four buckets, over the appointments that carry a balance.
 */

import { AppointmentStatus, DebtBucket, Permission } from '@/core/constants'
import { fromUtcInstant, toUtcInstant, asLocalDate, fromClockParts, type LocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'

import type { DebtBuckets, DebtRow, LastFollowUp } from '../types'
import { bucketOf, daysOverdueOf, effectiveDueInstant } from './buckets'
import { readDebtSettings } from './settings'

const LIST_LIMIT = 10000
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

const LIVE_STATUSES: string[] = [
  AppointmentStatus.Booked,
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.Arrived,
  AppointmentStatus.Completed,
  AppointmentStatus.ResultNotRecorded,
]

const APPOINTMENT_SELECT = {
  id: true,
  customerId: true,
  doctorId: true,
  serviceId: true,
  scheduledAt: true,
  priceAtBooking: true,
  depositAmount: true,
  status: true,
  debtFollowUpAt: true,
  debtFollowUpNote: true,
  debtNextContactAt: true,
  debtDueDateOverride: true,
  customer: { select: { firstName: true, lastName: true, mobile: true } },
  doctor: { select: { firstName: true, lastName: true } },
  service: { select: { name: true } },
  installments: {
    orderBy: { sequence: 'desc' },
    select: {
      id: true,
      sequence: true,
      amount: true,
      paidAmount: true,
      totalPlanAmount: true,
      totalPlanCount: true,
      intervalMonths: true, // 👈 اضافه شد
      type: true,
      note: true,
      dueAt: true,
    }
  },
} as const

type AppointmentRow = {
  readonly id: string
  readonly customerId: string | null
  readonly doctorId: string
  readonly serviceId: string | null
  readonly scheduledAt: Date
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly status: string
  readonly debtFollowUpAt: Date | null
  readonly debtFollowUpNote: string | null
  readonly debtNextContactAt: Date | null
  readonly debtDueDateOverride: Date | null
  readonly customer: {
    readonly firstName: string
    readonly lastName: string | null
    readonly mobile: string
  }
  readonly doctor: {
    readonly firstName: string
    readonly lastName: string
  }
  readonly service: { readonly name: string } | null
  readonly installments: readonly {
    readonly id: string
    readonly sequence: number
    readonly amount: bigint
    readonly paidAmount: bigint
    readonly totalPlanAmount: bigint | null
    readonly totalPlanCount: number | null
    readonly intervalMonths: number | null
    readonly type: string
    readonly note: string | null
    readonly dueAt: Date
  }[]
}

type PaymentSums = {
  readonly appointmentId: string
  readonly _sum: { readonly amount: bigint | null; readonly discountAmount: bigint | null }
}

// 👈 تابع محاسبه دقیق ماه شمسی (دقیقاً مثل فرانت‌اند)
function addMonthsJalali(dateString: string, monthsToAdd: number): string {
  const parts = dateString.split('-')
  let y = Number(parts[0])
  let m = Number(parts[1])
  const d = parts[2] // روز کاملاً ثابت می‌مونه

  m += monthsToAdd
  while (m > 12) {
    m -= 12
    y += 1
  }

  return `${y}-${String(m).padStart(2, '0')}-${d}`
}

async function tenantDebts(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
  scope: Partial<{ readonly doctorId: string }> = {},
): Promise<DebtBuckets> {
  const settings = await readDebtSettings(tx, tenantId)

  const appointments = (await tx.appointment.findMany({
    where: { tenantId, status: { in: LIVE_STATUSES }, ...scope },
    select: APPOINTMENT_SELECT,
    orderBy: { scheduledAt: 'desc' },
    take: LIST_LIMIT,
  })) as readonly AppointmentRow[]

  const ids = appointments.map((row) => row.id)
  const sums: readonly PaymentSums[] = ids.length
    ? groupBySums(
        await tx.payment.groupBy({
          by: ['appointmentId'],
          where: { tenantId, appointmentId: { in: ids } },
          _sum: { amount: true, discountAmount: true },
        }),
      )
    : []

  const byAppointment = new Map(sums.map((sum) => [sum.appointmentId, sum]))
  const buckets: MutableBuckets = { overdue30: [], overdue7: [], overdue: [], dueSoon: [] }

  for (const row of appointments) {
    if (row.customerId === null) continue

    const sumsForRow = byAppointment.get(row.id)
    
    const charged = row.priceAtBooking
    const paid = sumsForRow?._sum.amount ?? 0n
    const discount = sumsForRow?._sum.discountAmount ?? 0n
    
    const latestInstallment = row.installments[0]

    let balance = 0n
    let totalInstallments = 0
    let paidInstallments = 0
    let installmentSequence = 0
    let installmentAmount = 0n
    let installmentId: string | null = null

    if (latestInstallment) {
      const totalPlan = latestInstallment.totalPlanAmount ?? latestInstallment.amount
      balance = totalPlan - latestInstallment.paidAmount
      
      totalInstallments = latestInstallment.totalPlanCount ?? 1
      paidInstallments = Math.min(
        totalInstallments,
        Number(latestInstallment.paidAmount / (latestInstallment.amount > 0n ? latestInstallment.amount : 1n))
      )
      installmentSequence = latestInstallment.sequence
      installmentAmount = latestInstallment.amount
      installmentId = latestInstallment.id
    } else {
      balance = charged - discount - paid
    }

    if (balance <= 0n) continue

    // 👈 ۴. محاسبه داینامیک تاریخ سررسید (روش رشته‌ای دقیق)
    let dueAt = row.scheduledAt
    if (latestInstallment) {
      const baseDate = new Date(latestInstallment.dueAt)
      const baseDateString = fromUtcInstant(baseDate, settings.utcOffsetMinutes).localDate
      
      if (paidInstallments > 0 && latestInstallment.intervalMonths) {
        const nextLocalDate = addMonthsJalali(baseDateString, paidInstallments * latestInstallment.intervalMonths)
        dueAt = toUtcInstant(asLocalDate(nextLocalDate), MIDNIGHT, settings.utcOffsetMinutes)
      } else {
        dueAt = baseDate
      }
    }

    const effectiveDue = effectiveDueInstant({
      scheduledAt: dueAt,
      override: row.debtDueDateOverride,
      graceDays: settings.debtGraceDays,
    })

    buckets[bucketKey(bucketOf(now, effectiveDue))].push({
      appointmentId: row.id,
      customerId: row.customerId,
      customerFirstName: row.customer.firstName,
      customerLastName: row.customer.lastName,
      customerMobile: row.customer.mobile,
      doctorId: row.doctorId,
      doctorName: doctorName(row.doctor.firstName, row.doctor.lastName),
      serviceId: row.serviceId,
      serviceName: row.service?.name ?? null,
      charged,
      discount,
      paid,
      balance,
      dueLocalDate: dueLocalDate(effectiveDue, settings.utcOffsetMinutes),
      lastFollowUp: row.debtFollowUpAt === null ? null : { at: row.debtFollowUpAt, note: row.debtFollowUpNote },
      nextContactAt: row.debtNextContactAt,
      dueDateOverride: row.debtDueDateOverride,
      bucket: bucketOf(now, effectiveDue),
      daysOverdue: daysOverdueOf(now, effectiveDue),
      totalInstallments,
      paidInstallments,
      installmentSequence,
      installmentAmount,
      installmentId,
    })
  }

  return Object.freeze(buckets)
}

function groupBySums(rows: unknown): readonly PaymentSums[] {
  return rows as readonly PaymentSums[]
}

function bucketKey(bucket: DebtBucket): MutableBucketKey {
  if (bucket === DebtBucket.Over30Days) return 'overdue30'
  if (bucket === DebtBucket.Over7Days) return 'overdue7'
  if (bucket === DebtBucket.PastDue) return 'overdue'
  return 'dueSoon'
}

type MutableBucketKey = keyof DebtBuckets
type MutableBuckets = { readonly [key in MutableBucketKey]: DebtRow[] }

function dueLocalDate(dueAt: Date, utcOffsetMinutes: number): LocalDate {
  return fromUtcInstant(dueAt, utcOffsetMinutes).localDate
}

function doctorName(firstName: string, lastName: string | null): string {
  return lastName === null || lastName === '' ? firstName : `${firstName} ${lastName}`
}

export async function contactList(args: { tx: TransactionClient; ctx: TenantContext; now: Date }): Promise<DebtBuckets> {
  requirePermission(args.ctx, Permission.ViewDebts)
  return tenantDebts(args.tx, args.ctx.tenantId, args.now)
}

export async function clinicDebts(args: { tx: TransactionClient; ctx: TenantContext; now: Date }): Promise<DebtBuckets> {
  requirePermission(args.ctx, Permission.ViewDebts)
  return tenantDebts(args.tx, args.ctx.tenantId, args.now)
}

export async function doctorDebts(args: { tx: TransactionClient; ctx: TenantContext; now: Date }): Promise<DebtBuckets> {
  requirePermission(args.ctx, Permission.ViewDebts)
  return tenantDebts(args.tx, args.ctx.tenantId, args.now, { doctorId: args.ctx.userId })
}

export async function customerDebts(args: { readonly tx: TransactionClient; readonly tenantId: string; readonly customerId: string; readonly now: Date }): Promise<readonly DebtRow[]> {
  const buckets = await tenantDebts(args.tx, args.tenantId, args.now)
  const all = [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue, ...buckets.dueSoon]
  return all.filter((row) => row.customerId === args.customerId)
}

export async function customerDebtFollowUps(args: { readonly tx: TransactionClient; readonly tenantId: string; readonly customerId: string }) {
  return args.tx.debtFollowUp.findMany({
    where: { tenantId: args.tenantId, appointment: { customerId: args.customerId } },
    include: {
      appointment: { select: { localDate: true, service: { select: { name: true } }, doctor: { select: { firstName: true, lastName: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}