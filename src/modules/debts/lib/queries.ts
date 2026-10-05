/**
 * The module's reads — the four buckets, over the appointments that carry a balance.
 *
 * There is no `debts` table (`03-data-model.md` §4.3), so every read here is a
 * computation: the appointments that completed, the payments that settled them, and
 * the three terms put together by the `payments` module's own function. `debts` reads
 * financial facts and writes nothing but a follow-up, which is the division the phase's
 * instruction names.
 *
 * | Read | Surface |
 * |---|---|
 * | `contactList` | `reception/debts.html`, with the row actions |
 * | `clinicDebts` | `admin/debts.html`, read-only oversight |
 * | `doctorDebts` | `doctor/debts.html`, the caller's own courses |
 * | `customerDebts` | the customer profile's debt summary |
 */

import { AppointmentStatus, DebtBucket, Permission } from '@/core/constants'
import { fromUtcInstant, type LocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'
import { asBalance } from '@/modules/payments'

import type { DebtBuckets, DebtRow } from '../types'
import { bucketOf, effectiveDueInstant } from './buckets'
import { readDebtSettings } from './settings'

/** The most a bucket reads in one go; a list is scrolled, not paged. */
const LIST_LIMIT = 200

/** The columns a debt row reads off the appointment, and nothing more. */
const APPOINTMENT_SELECT = {
  id: true,
  customerId: true,
  doctorId: true,
  serviceId: true,
  scheduledAt: true,
  priceAtBooking: true,
  debtFollowUpAt: true,
  debtNextContactAt: true,
  debtDueDateOverride: true,
  customer: { select: { firstName: true, lastName: true, mobile: true } },
} as const

/** The shape Prisma hands back from the appointments read. */
type AppointmentRow = {
  readonly id: string
  readonly customerId: string | null
  readonly doctorId: string
  readonly serviceId: string | null
  readonly scheduledAt: Date
  readonly priceAtBooking: bigint
  readonly debtFollowUpAt: Date | null
  readonly debtNextContactAt: Date | null
  readonly debtDueDateOverride: Date | null
  readonly customer: {
    readonly firstName: string
    readonly lastName: string | null
    readonly mobile: string
  }
}

/** The sums one appointment's payments carry, as a `groupBy` hands them back. */
type PaymentSums = {
  readonly appointmentId: string
  readonly _sum: { readonly amount: bigint | null; readonly discountAmount: bigint | null }
}

/**
 * The tenant's debts, in the four buckets — the read the three debt pages share.
 *
 * Takes no permission itself; the three wrappers below each hold their own, because the
 * three surfaces are three authorisation decisions over one set of rows. The doctor's
 * wrapper scopes by `doctorId` in the `where` and not by a guard after it, which is
 * `09-security.md` §6.3's read half: another doctor's debts are absent from the read.
 */
async function tenantDebts(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
  scope: Partial<{ readonly doctorId: string }> = {},
): Promise<DebtBuckets> {
  const settings = await readDebtSettings(tx, tenantId)

  const appointments = (await tx.appointment.findMany({
    where: { tenantId, status: AppointmentStatus.Completed, ...scope },
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

  const buckets: MutableBuckets = {
    overdue30: [],
    overdue7: [],
    overdue: [],
    dueSoon: [],
  }

  for (const row of appointments) {
    if (row.customerId === null) continue
    const sumsForRow = byAppointment.get(row.id)
    const balance = asBalance(
      row.priceAtBooking,
      sumsForRow?._sum.discountAmount ?? 0n,
      sumsForRow?._sum.amount ?? 0n,
    )
    if (balance.balance <= 0n) continue

    const dueAt = effectiveDueInstant({
      scheduledAt: row.scheduledAt,
      override: row.debtDueDateOverride,
      graceDays: settings.debtGraceDays,
    })

    buckets[bucketKey(bucketOf(now, dueAt))].push({
      appointmentId: row.id,
      customerId: row.customerId,
      customerFirstName: row.customer.firstName,
      customerLastName: row.customer.lastName,
      customerMobile: row.customer.mobile,
      doctorId: row.doctorId,
      serviceId: row.serviceId,
      charged: balance.charged,
      discount: balance.discount,
      paid: balance.paid,
      balance: balance.balance,
      dueLocalDate: dueLocalDate(dueAt, settings.utcOffsetMinutes),
      debtFollowUpAt: row.debtFollowUpAt,
      debtNextContactAt: row.debtNextContactAt,
      debtDueDateOverride: row.debtDueDateOverride,
      bucket: bucketOf(now, dueAt),
    })
  }

  return Object.freeze(buckets)
}

/**
 * Prisma's `groupBy` return is a readonly array of exactly this shape, but the args'
 * inferred type carries the `by` literal and the array together, so the cast is the one
 * the call needs rather than a cast of the result.
 */
function groupBySums(rows: unknown): readonly PaymentSums[] {
  return rows as readonly PaymentSums[]
}

/** The bucket as the buckets object's own key. */
function bucketKey(bucket: DebtBucket): MutableBucketKey {
  if (bucket === DebtBucket.Over30Days) return 'overdue30'
  if (bucket === DebtBucket.Over7Days) return 'overdue7'
  if (bucket === DebtBucket.PastDue) return 'overdue'
  return 'dueSoon'
}

/** The four bucket names, mutable while the lists are being built. */
type MutableBucketKey = keyof DebtBuckets

/** The buckets while they fill — frozen before they leave this file. */
type MutableBuckets = {
  readonly [key in MutableBucketKey]: DebtRow[]
}

/** The due date as a `LocalDate`, in the tenant's own calendar and digits. */
function dueLocalDate(dueAt: Date, utcOffsetMinutes: number): LocalDate {
  return fromUtcInstant(dueAt, utcOffsetMinutes).localDate
}

/**
 * «بدهکاران» — the desk's four buckets, with the row actions.
 *
 * @throws PermissionError — no `view_debts`.
 */
export async function contactList(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly now: Date
}): Promise<DebtBuckets> {
  requirePermission(args.ctx, Permission.ViewDebts)
  return tenantDebts(args.tx, args.ctx.tenantId, args.now)
}

/**
 * The clinic's debts — the manager's read-only oversight.
 *
 * Read-only is the page's and not the query's: the rows are the same rows the desk's
 * own `follow_up_debt` writes reach, and the oversight table is where the manager reads
 * them before deciding which one needs a call.
 *
 * @throws PermissionError — no `view_debts`.
 */
export async function clinicDebts(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly now: Date
}): Promise<DebtBuckets> {
  requirePermission(args.ctx, Permission.ViewDebts)
  return tenantDebts(args.tx, args.ctx.tenantId, args.now)
}

/**
 * «بدهکاری‌های من» — the doctor's own, visible only with the granted permission.
 *
 * The scoping is the `where` clause, so another doctor's debts are absent from this
 * read and the doctor's page cannot render a course that is not theirs.
 *
 * @throws PermissionError — no `view_debts`, which §2.1 gives the manager and the desk.
 */
export async function doctorDebts(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly now: Date
}): Promise<DebtBuckets> {
  requirePermission(args.ctx, Permission.ViewDebts)
  return tenantDebts(args.tx, args.ctx.tenantId, args.now, { doctorId: args.ctx.userId })
}

/** One customer's debts, for the customer profile's summary. */
export async function customerDebts(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly now: Date
}): Promise<readonly DebtRow[]> {
  const buckets = await tenantDebts(args.tx, args.tenantId, args.now)
  return [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue, ...buckets.dueSoon]
}
