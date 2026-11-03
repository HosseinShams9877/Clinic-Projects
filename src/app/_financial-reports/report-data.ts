/**
 * بارگذاریِ داده‌ی صفحه‌ی «گزارش‌های مالی» — مشترک بین سه پنل.
 *
 * هر سه پنل (مدیر، منشی، پزشک) در گذشته یک کپیِ تقریباً یکسان از همین Pipeline را
 * داشتند. تفاوتِ تنها، محدوده‌ی دید است: پنلِ پزشک فقط نوبت‌های خودش را می‌بیند
 * (`doctorDebts`)، دو پنلِ دیگر کلِ کلینیک را (`clinicDebts`). این loader آن تفاوت
 * را در یک `scope` خلاصه می‌کند تا جدولِ ردیف‌ها، شمارش‌ها، خلاصه‌ی درآمدِ بازه و
 * خط‌های پرداختِ دیالوگِ جزئیات برای هر سه پنل یکسان بماند.
 */

import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import { asLocalTime, fromJalaliParts, fromUtcInstant, jalaliParts, toUtcInstant } from '@/core/localization'
import { clinicDebts, doctorDebts, readDebtSettings } from '@/modules/debts'
import type { DebtBuckets, DebtRow } from '@/modules/debts'
import { appointmentPaymentLines, financialSummary } from '@/modules/payments'
import type { FinancialSummaryReport, PaymentLine } from '@/modules/payments'
import { loadDoctorNamesByUserId } from '@/app/_customers/page-data'

/** خروجیِ یکپارچه‌ی صفحه‌ی گزارشِ مالی. */
export interface FinancialReportData {
  readonly rows: readonly DebtRow[]
  readonly uniqueDoctors: ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly weekDueCount: number
  readonly activeDebtorsCount: number
  readonly followedTodayCount: number
  readonly awaitingResultCount: number
  /** خلاصه‌ی درآمدِ بازه — اینجا، ماهِ جاریِ تقویمِ جلالی. */
  readonly summary: FinancialSummaryReport
  /** خط‌های پرداختِ نوبت‌های دیده‌شده — برای دیالوگِ «جزئیات پرداخت». */
  readonly paymentLines: readonly PaymentLine[]
  readonly followUps: readonly any[]
}

/**
 * کلِ داده‌ی صفحه را در یک scope می‌خواند.
 *
 * @param scope `'doctor'` نوبت‌های خودِ کاربرِ واردشده را محدود می‌کند (و خلاصه‌ی
 *   درآمد را هم به همان پرداخت‌ها)، `'clinic'` کلِ کلینیک را.
 */
export async function loadFinancialReportData(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly now: Date
  readonly scope: 'clinic' | 'doctor'
  readonly q: string
  readonly doctorId: string
  readonly bucket: string
}): Promise<FinancialReportData> {
  const { tx, ctx, now, scope } = args

  const debts: DebtBuckets =
    scope === 'doctor' ? await doctorDebts({ tx, ctx, now }) : await clinicDebts({ tx, ctx, now })

  const allRows = Object.values(debts).flat() as DebtRow[]
  const allDoctorIds = Array.from(new Set(allRows.map((d) => d.doctorId).filter(Boolean)))

  const [doctorNames, settings] = await Promise.all([
    loadDoctorNamesByUserId(tx, ctx.tenantId, allDoctorIds),
    readDebtSettings(tx, ctx.tenantId),
  ])

  // بازه‌ی ماهِ جاریِ تقویمِ جلالی — همان محاسبه‌ی `paymentsThisMonth`، با مرزِ
  // بازِ `[monthStart, now)`.
  const today = fromUtcInstant(now, settings.utcOffsetMinutes).localDate
  const parts = jalaliParts(today)
  const monthStart = toUtcInstant(
    fromJalaliParts({ year: parts.year, month: parts.month, day: 1 }),
    asLocalTime('00:00'),
    settings.utcOffsetMinutes,
  )

  const [summary, paymentLines, allFollowUps] = await Promise.all([
    financialSummary({
      tx,
      tenantId: ctx.tenantId,
      from: monthStart,
      to: now,
      ...(scope === 'doctor' ? { doctorId: ctx.userId } : {}),
    }),
    appointmentPaymentLines({
      tx,
      ctx,
      appointmentIds: Array.from(new Set(allRows.map((row) => row.appointmentId))),
    }),
    tx.debtFollowUp.findMany({
      where: {
        tenantId: ctx.tenantId,
        appointmentId: { in: allRows.map((row) => row.appointmentId) },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  const rows = allRows.filter((row) => {
    if (args.q) {
      const term = args.q.toLowerCase()
      const name = `${row.customerFirstName} ${row.customerLastName ?? ''}`.toLowerCase()
      if (!name.includes(term)) return false
    }
    if (args.doctorId && row.doctorId !== args.doctorId) return false
    if (args.bucket) {
      if (args.bucket === 'past' && row.daysOverdue <= 0) return false
      if (args.bucket === 'awaiting' && row.daysOverdue > 0) return false
    }
    return true
  })

  const weekDueCount = allRows.filter((r) => r.daysOverdue <= 7 && r.daysOverdue > 0).length
  const activeDebtorsCount = new Set(allRows.map((r) => r.customerId)).size
  const followedTodayCount = allRows.filter(
    (r) => r.lastFollowUp?.at && new Date(r.lastFollowUp.at).toDateString() === now.toDateString(),
  ).length
  const awaitingResultCount = allRows.filter((r) => !r.lastFollowUp).length

  return {
    rows,
    uniqueDoctors: Object.entries(doctorNames).map(([id, name]) => ({ id, name })),
    weekDueCount,
    activeDebtorsCount,
    followedTodayCount,
    awaitingResultCount,
    summary,
    paymentLines,
    followUps: allFollowUps,
  }
}
