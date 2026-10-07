/**
 * The reports page — `02-architecture.md` §9's `admin/reports.html`.
 *
 * The seven retention reports the specification closed, over the Jalali range the
 * manager picks. The page holds no financial figure: `reports` is the module the
 * specification keeps money out of, and the page cannot render what the module will
 * not return (`tests/no-financial-surface.test.ts` is the gate that says so).
 *
 * The range comes from the query string and defaults to the current Jalali month, so
 * a manager who opens the page sees the month they are in and a manager who shares a
 * link shares the exact range. Both ends are inclusive, which is the convention
 * `localDateWhere` keeps as the one fact.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  formatDate,
  formatNumber,
  formatPercent,
  fromUtcInstant,
  isValidLocalDate,
  type LocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'

import { requireStaffPanel } from '@/app/_shell/session'
import {
  DOCTOR_FIELDS,
  LAST_VISIT_BUCKET_LABELS,
  REPORT_FIELDS,
  REPORT_LABELS,
  averageSessionsReport,
  cycleCompletionReport,
  doctorComparisonReport,
  dropOffCurveReport,
  lastVisitDistributionReport,
  monthStartOf,
  noShowReport,
  readReportOffset,
  returnRateReport,
} from '@/modules/reports'
import type { DoctorComparisonRow, ReportRange } from '@/modules/reports'

export const metadata: Metadata = { title: REPORT_FIELDS.title }

export default async function ReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams

  const reports = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const offset = await readReportOffset(tx, session.tenantId)
    const today = fromUtcInstant(realClock(), offset).localDate
    const range = resolveRange(params, today)

    const [
      returnRate,
      averageSessions,
      cycleCompletion,
      noShow,
      dropOffCurve,
      lastVisit,
      doctors,
    ] = await Promise.all([
      returnRateReport(tx, session.tenantId, range),
      averageSessionsReport(tx, session.tenantId, range),
      cycleCompletionReport(tx, session.tenantId, range),
      noShowReport(tx, session.tenantId, range),
      dropOffCurveReport(tx, session.tenantId, range),
      lastVisitDistributionReport(tx, session.tenantId, realClock()),
      doctorComparisonReport(tx, session.tenantId, range),
    ])

    return Object.freeze({
      range,
      returnRate,
      averageSessions,
      cycleCompletion,
      noShow,
      dropOffCurve,
      lastVisit,
      doctors,
    })
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{REPORT_FIELDS.title}</h1>
        <p className="text-sm text-ink-2">{REPORT_FIELDS.lead}</p>
      </div>

      <RangeForm from={reports.range.from} to={reports.range.to} />

      <ReportCard title={REPORT_LABELS.returnRate.title} lead={REPORT_LABELS.returnRate.lead}>
        <RateRow
          label={REPORT_LABELS.returnRate.title}
          rate={reports.returnRate.rate}
          detail={`${formatNumber(reports.returnRate.returningCustomers)} / ${formatNumber(
            reports.returnRate.totalCustomers,
          )}`}
        />
      </ReportCard>

      <ReportCard
        title={REPORT_LABELS.averageSessions.title}
        lead={REPORT_LABELS.averageSessions.lead}
      >
        <RateRow
          label={REPORT_LABELS.averageSessions.title}
          rate={reports.averageSessions.averageSessions}
          detail={formatNumber(reports.averageSessions.customers)}
        />
      </ReportCard>

      <ReportCard
        title={REPORT_LABELS.cycleCompletion.title}
        lead={REPORT_LABELS.cycleCompletion.lead}
      >
        <RateRow
          label={REPORT_LABELS.cycleCompletion.title}
          rate={reports.cycleCompletion.rate}
          detail={`${formatNumber(reports.cycleCompletion.completed)} / ${formatNumber(
            reports.cycleCompletion.terminal,
          )}`}
        />
      </ReportCard>

      <ReportCard title={REPORT_LABELS.noShow.title} lead={REPORT_LABELS.noShow.lead}>
        <RateRow
          label={REPORT_LABELS.noShow.title}
          rate={reports.noShow.rate}
          detail={`${formatNumber(reports.noShow.noShows)} / ${formatNumber(
            reports.noShow.completed + reports.noShow.noShows,
          )}`}
        />
      </ReportCard>

      <ReportCard title={REPORT_LABELS.dropOffCurve.title} lead={REPORT_LABELS.dropOffCurve.lead}>
        {reports.dropOffCurve.points.length === 0 ? (
          <p className="text-sm text-ink-3">{REPORT_FIELDS.empty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.dropOffCurve.points.map((point) => (
              <div key={point.sessionNumber} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-ink-2">
                  {formatNumber(point.sessionNumber)}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-ink"
                    style={{ width: `${Math.round(point.rate * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-left tabular-nums text-ink-2">
                  {formatPercent(Math.round(point.rate * 100))}
                </span>
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      <ReportCard
        title={REPORT_LABELS.lastVisitDistribution.title}
        lead={REPORT_LABELS.lastVisitDistribution.lead}
      >
        <div className="flex flex-col gap-2">
          {reports.lastVisit.buckets.length === 0 ? (
            <p className="text-sm text-ink-3">{REPORT_FIELDS.empty}</p>
          ) : (
            reports.lastVisit.buckets.map((row) => (
              <div key={row.bucket} className="flex items-center justify-between text-sm">
                <span className="text-ink-2">{LAST_VISIT_BUCKET_LABELS[row.bucket].label}</span>
                <span className="tabular-nums text-ink">{formatNumber(row.count)}</span>
              </div>
            ))
          )}
        </div>
      </ReportCard>

      <ReportCard
        title={REPORT_LABELS.doctorComparison.title}
        lead={REPORT_LABELS.doctorComparison.lead}
      >
        {reports.doctors.doctors.length === 0 ? (
          <p className="text-sm text-ink-3">{REPORT_FIELDS.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{REPORT_LABELS.doctorComparison.title}</caption>
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="px-3 py-2 text-right font-normal">{DOCTOR_FIELDS.doctor}</th>
                  <th className="px-3 py-2 text-right font-normal">{DOCTOR_FIELDS.sessions}</th>
                  <th className="px-3 py-2 text-right font-normal">{DOCTOR_FIELDS.noShows}</th>
                  <th className="px-3 py-2 text-right font-normal">{DOCTOR_FIELDS.noShowRate}</th>
                  <th className="px-3 py-2 text-right font-normal">{DOCTOR_FIELDS.activeCycles}</th>
                  <th className="px-3 py-2 text-right font-normal">{DOCTOR_FIELDS.completionRate}</th>
                </tr>
              </thead>
              <tbody>
                {reports.doctors.doctors.map((doctor) => (
                  <DoctorRow key={doctor.doctorId} doctor={doctor} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>
    </div>
  )
}

/** The range the query string names, or the current Jalali month. */
function resolveRange(
  params: Record<string, string | string[] | undefined>,
  today: LocalDate,
): ReportRange {
  const from = firstOf(params.from)
  const to = firstOf(params.to)

  if (from !== undefined && isValidLocalDate(from) && to !== undefined && isValidLocalDate(to)) {
    return Object.freeze({ from: asLocalDate(from), to: asLocalDate(to) })
  }

  return Object.freeze({ from: monthStartOf(today), to: today })
}

/** The query string's one value, when it is one value. */
function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** A report's name, its sentence, and its figures. */
function ReportCard({
  title,
  lead,
  children,
}: {
  readonly title: string
  readonly lead: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <p className="text-xs text-ink-3">{lead}</p>
      </div>
      {children}
    </section>
  )
}

/** One rate and the two counts it is made of, as a report's own line. */
function RateRow({ label, rate, detail }: { readonly label: string; readonly rate: number; readonly detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-ink-3">{detail}</span>
        <span className="font-bold tabular-nums text-ink">{formatPercent(Math.round(rate * 100))}</span>
      </span>
    </div>
  )
}

/** The range the manager picks, as the two date fields the page re-reads. */
function RangeForm({ from, to }: { readonly from: string; readonly to: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-3">{REPORT_FIELDS.rangeFrom}</span>
        <input
          name="from"
          defaultValue={from}
          className="rounded-md border border-line bg-page px-3 py-1.5 text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-3">{REPORT_FIELDS.rangeTo}</span>
        <input
          name="to"
          defaultValue={to}
          className="rounded-md border border-line bg-page px-3 py-1.5 text-ink"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-page"
      >
        {REPORT_FIELDS.apply}
      </button>
      <p className="text-xs text-ink-3">
        {formatDate(asLocalDate(from), 'long')} — {formatDate(asLocalDate(to), 'long')}
      </p>
    </form>
  )
}

/** One doctor's figures, as the comparison table renders them. */
function DoctorRow({ doctor }: { readonly doctor: DoctorComparisonRow }) {
  return (
    <tr className="border-b border-line/60 text-ink">
      <td className="px-3 py-2 font-medium">{doctor.doctorName}</td>
      <td className="px-3 py-2 tabular-nums">{formatNumber(doctor.completedSessions)}</td>
      <td className="px-3 py-2 tabular-nums">{formatNumber(doctor.noShows)}</td>
      <td className="px-3 py-2 tabular-nums">
        {formatPercent(Math.round(doctor.noShowRate * 100))}
      </td>
      <td className="px-3 py-2 tabular-nums">{formatNumber(doctor.activeCycles)}</td>
      <td className="px-3 py-2 tabular-nums">
        {formatPercent(Math.round(doctor.cycleCompletionRate * 100))}
      </td>
    </tr>
  )
}
