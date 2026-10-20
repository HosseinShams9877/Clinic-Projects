/**
 * The module's reads — the four buckets, over the appointments that carry a balance.
 */

import { AppointmentStatus, DebtBucket, Permission } from '@/core/constants'
import { fromUtcInstant, type LocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'

import type { DebtBuckets, DebtRow, LastFollowUp } from '../types'
import { bucketOf, daysOverdueOf, effectiveDueInstant } from './buckets'
import { readDebtSettings } from './settings'

const LIST_LIMIT = 200

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
  service: { select: { name: true } }, // 👈 اسم خدمت
  installments: {
    select: {
      sequence: true,
      amount: true,
      note: true,
      dueAt: true, // 👈 تاریخ سررسید قسط
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
    readonly sequence: number
    readonly amount: bigint
    readonly note: string | null
    readonly dueAt: Date
  }[]
}

type PaymentSums = {
  readonly appointmentId: string
  readonly _sum: { readonly amount: bigint | null; readonly discountAmount: bigint | null }
}

function asBalance(charged: bigint, discount: bigint, paid: bigint) {
  return Object.freeze({ charged, discount, paid, balance: charged - discount - paid })
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
    orderBy: { scheduledAt: 'asc' },
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
    
    let charged = row.priceAtBooking
    let paid = sumsForRow?._sum.amount ?? 0n
    const discount = sumsForRow?._sum.discountAmount ?? 0n
    let totalInstallments = 0
    let paidInstallments = 0
    let currentDueAt = row.scheduledAt
    let installmentSequence = 0
    let installmentAmount = 0n

    if (row.installments && row.installments.length > 0) {
      const inst = row.installments[0]
      
      const parts = inst.note?.split(':') || []
      totalInstallments = Number(parts[1] || 1)
      const totalAmount = BigInt(parts[3] || row.priceAtBooking)
      
      charged = totalAmount
      paid = sumsForRow?._sum.amount ?? 0n
      paidInstallments = inst.sequence - 1
      
      currentDueAt = inst.dueAt
      installmentSequence = inst.sequence
      installmentAmount = inst.amount
    }

    const balance = asBalance(charged, discount, paid)
    if (balance.balance <= 0n) continue

    const dueAt = effectiveDueInstant({
      scheduledAt: currentDueAt, // 👈 تاریخ سررسید از روی قسط فعلی
      override: row.debtDueDateOverride,
      graceDays: settings.debtGraceDays,
    })

    const lastFollowUp: LastFollowUp | null =
      row.debtFollowUpAt === null ? null : { at: row.debtFollowUpAt, note: row.debtFollowUpNote }

    buckets[bucketKey(bucketOf(now, dueAt))].push({
      appointmentId: row.id,
      customerId: row.customerId,
      customerFirstName: row.customer.firstName,
      customerLastName: row.customer.lastName,
      customerMobile: row.customer.mobile,
      doctorId: row.doctorId,
      doctorName: doctorName(row.doctor.firstName, row.doctor.lastName),
      serviceId: row.serviceId,
      serviceName: row.service?.name ?? null,
      charged: balance.charged,
      discount: balance.discount,
      paid: balance.paid,
      balance: balance.balance,
      dueLocalDate: dueLocalDate(dueAt, settings.utcOffsetMinutes),
      lastFollowUp,
      nextContactAt: row.debtNextContactAt,
      dueDateOverride: row.debtDueDateOverride,
      bucket: bucketOf(now, dueAt),
      daysOverdue: daysOverdueOf(now, dueAt),
      totalInstallments: Math.max(1, totalInstallments),
      paidInstallments,
      installmentSequence,
      installmentAmount,
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