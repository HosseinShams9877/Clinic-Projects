/**
 * The reports page — `02-architecture.md` §9's `admin/reports.html`.
 *
 * The retention reports the specification closed, over the Jalali range the manager
 * picks, arranged as the demo arranges them: four tiles, two bar cards, and the one
 * doctor comparison. The page holds no financial figure: `reports` is the module the
 * specification keeps money out of, and the page cannot render what the module will
 * not return (`tests/no-financial-surface.test.ts` is the gate that says so).
 *
 * ## What the demo holds that this page does not
 *
 * Two of the demo's figures name reads no module exposes. The fourth tile,
 * «نرخ پرشدن ظرفیت», is a capacity rate — booked slots over the slots the doctors'
 * working hours offer — and no read in the product returns either half of it, so the
 * tile is absent rather than a number invented to fill the fourth cell of a grid. The
 * comparison table's last column, «مانده‌حساب مراجعینش», is a per-doctor balance and
 * money is the one thing this module is closed against, so the column is absent for
 * the same reason the whole page holds no revenue figure.
 *
 * The demo's own notes name two derived facts and this page computes both, because a
 * derivation over a read the page already holds is a read and not a guess: the
 * curve's note names the steepest drop between two consecutive sessions, and the
 * distribution's note names the count of customers who have not been back in over
 * six months, which is the last bucket the module already returns.
 *
 * ## Why the tiles carry a previous span
 *
 * Each tile's sub-line is the same report over the span that came before the one the
 * manager is looking at, because a rate on its own is a fact and a rate against its
 * own past is the decision — the reports the tiles hold are re-run over the previous
 * span in the same transaction, so the two numbers a manager compares are two moments
 * and not two queries. A span the manager picks by hand gets a previous span of the
 * same length; a preset gets the preset's own calendar step.
 *
 * ## Why the head holds both a select and two date fields
 *
 * The demo's head holds a `<select>` over three presets and the page keeps it, as a
 * route push that writes `?range=`; the two date fields stay because a preset cannot
 * name «هفته اول ماه گذشته» and the module's range is any span, so the custom span is
 * the surface the preset is the shortcut to. Both are the same URL, and either one the
 * manager changes re-reads the same seven reports.
 *
 * ## Why the four tiles are three rates and a mean
 *
 * The demo's fourth tile is the capacity rate this page cannot render, and the tile
 * that takes its cell is the module's own `averageSessions` — one of the seven the
 * specification closed, which the demo's own surface has no card for and this page
 * would otherwise drop. A tile is the shape a rate renders in, and a mean renders in
 * one too; its sub-line is the previous span's mean and not a percent, because a mean
 * of sessions is a count.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  formatDate,
  formatNumber,
  formatPercent,
  fromUtcInstant,
  isValidLocalDate,
  monthName,
  toPersianDigits,
  type LocalDate,
} from '@/core/localization'
import {
  addLocalDays,
  diffLocalDays,
  isSameJalaliMonth,
  jalaliParts,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { ADMIN_REPORTS } from '@/app/admin/catalog'
import { requireStaffPanel } from '@/app/_shell/session'
import {
  RANGE_LAST_MONTH,
  RANGE_QUARTER,
  RANGE_THIS_MONTH,
  RangeSelect,
} from './_components/RangeSelect'
import { RangeForm } from './_components/RangeForm'
import {
  DOCTOR_FIELDS,
  LAST_VISIT_BUCKETS,
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
import type {
  AverageSessionsReport,
  CycleCompletionReport,
  DoctorComparisonRow,
  LastVisitBucketCount,
  NoShowReport,
  ReportRange,
  ReturnRateReport,
} from '@/modules/reports'

export const metadata: Metadata = { title: REPORT_FIELDS.title }

/** The page's own route, as the head's select writes it. */
const BASE_PATH = '/admin/reports'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/** The same params, awaited, as the range helpers read them. */
type Params = { readonly [key: string]: string | string[] | undefined }

export default async function ReportsPage({ searchParams }: { readonly searchParams: PageSearchParams }) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams

  const reports = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const offset = await readReportOffset(tx, session.tenantId)
    const today = fromUtcInstant(realClock(), offset).localDate
    const range = resolveRange(params, today)
    const previous = previousSpan(range, params)

    const [
      returnRate,
      averageSessions,
      cycleCompletion,
      noShow,
      dropOffCurve,
      lastVisit,
      doctors,
      prevReturnRate,
      prevAverageSessions,
      prevCycleCompletion,
      prevNoShow,
    ] = await Promise.all([
      returnRateReport(tx, session.tenantId, range),
      averageSessionsReport(tx, session.tenantId, range),
      cycleCompletionReport(tx, session.tenantId, range),
      noShowReport(tx, session.tenantId, range),
      dropOffCurveReport(tx, session.tenantId, range),
      lastVisitDistributionReport(tx, session.tenantId, realClock()),
      doctorComparisonReport(tx, session.tenantId, range),
      returnRateReport(tx, session.tenantId, previous),
      averageSessionsReport(tx, session.tenantId, previous),
      cycleCompletionReport(tx, session.tenantId, previous),
      noShowReport(tx, session.tenantId, previous),
    ])

    return Object.freeze({
      range,
      preset: presetOf(params),
      returnRate,
      averageSessions,
      cycleCompletion,
      noShow,
      dropOffCurve,
      lastVisit,
      doctors,
      prevReturnRate,
      prevAverageSessions,
      prevCycleCompletion,
      prevNoShow,
    })
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{REPORT_FIELDS.title}</h1>
          <p className="text-sm text-ink-2">{rangeLabel(reports.range)}</p>
        </div>
        <RangeSelect basePath={BASE_PATH} value={reports.preset} />
      </div>

      <div
        role="status"
        className="flex items-start gap-3 rounded-md bg-info-bg px-4 py-3 text-sm text-info [border:1px_solid_var(--info)]"
      >
        <Icon name="info" size="card" />
        <span>{ADMIN_REPORTS.noMoneyAlert}</span>
      </div>

      <ReportTiles reports={reports} />

      <RangeForm from={reports.range.from} to={reports.range.to} basePath={BASE_PATH} />

      <div className="grid grid-cols-1 gap-6 panel:grid-cols-2">
        <DropOffCard points={reports.dropOffCurve.points} />
        <LastVisitCard buckets={reports.lastVisit.buckets} />
      </div>

      <DoctorComparisonCard doctors={reports.doctors.doctors} />
    </div>
  )
}

/* ── The range ─────────────────────────────────────────────────────────────── */

/** The span the URL names, or the current Jalali month when it names none. */
function resolveRange(params: Params, today: LocalDate): ReportRange {
  const from = firstOf(params.from)
  const to = firstOf(params.to)

  if (from !== undefined && isValidLocalDate(from) && to !== undefined && isValidLocalDate(to)) {
    return Object.freeze({ from: asLocalDate(from), to: asLocalDate(to) })
  }

  return presetRange(presetOf(params), today)
}

/** The preset the URL names, or the default the head's own select holds first. */
function presetOf(params: Params): string {
  const value = firstOf(params.range)
  if (value === RANGE_LAST_MONTH || value === RANGE_QUARTER) return value
  return RANGE_THIS_MONTH
}

/**
 * One preset's own span, as the calendar works it out.
 *
 * «این ماه» is the month the manager is in and «ماه گذشته» the whole one before it,
 * both from `monthStartOf` because a Jalali month's first day is a calendar fact and
 * not an arithmetic one (`jalali-month-lengths`). «۳ ماه اخیر» is a count of days
 * back from today, which is the span the name promises.
 */
function presetRange(preset: string, today: LocalDate): ReportRange {
  if (preset === RANGE_LAST_MONTH) {
    const end = addLocalDays(monthStartOf(today), -1)
    return Object.freeze({ from: monthStartOf(end), to: end })
  }
  if (preset === RANGE_QUARTER) {
    return Object.freeze({ from: addLocalDays(today, -QUARTER_DAYS), to: today })
  }
  return Object.freeze({ from: monthStartOf(today), to: today })
}

/**
 * The span before the one the manager is looking at, which the tiles' own sub-lines
 * hold.
 *
 * A preset's previous span is the preset's own calendar step, so a month is compared
 * with the month before it and the quarter with the ninety days before it. A custom
 * span's previous span is the same length ending the day before it starts, because a
 * comparison against a span of a different length compares two facts that are not
 * alike.
 */
function previousSpan(range: ReportRange, params: Params): ReportRange {
  const preset = presetOf(params)
  if (preset === RANGE_THIS_MONTH || preset === RANGE_LAST_MONTH) {
    const end = addLocalDays(range.from, -1)
    return Object.freeze({ from: monthStartOf(end), to: end })
  }
  if (preset === RANGE_QUARTER) {
    return Object.freeze({ from: addLocalDays(range.from, -QUARTER_DAYS), to: addLocalDays(range.from, -1) })
  }
  return Object.freeze({
    from: addLocalDays(range.from, -diffLocalDays(range.to, range.from) - 1),
    to: addLocalDays(range.from, -1),
  })
}

/** «۹۰ روز» — the quarter's own length, which the preset's two spans share. */
const QUARTER_DAYS = 90

/** The head's own sentence, which is the month's name when the span is one month. */
function rangeLabel(range: ReportRange): string {
  if (isSameJalaliMonth(range.from, range.to)) {
    const { year, month } = jalaliParts(range.to)
    return `${monthName(month)} ${toPersianDigits(year)}`
  }
  return `${formatDate(range.from, 'long')}${ADMIN_REPORTS.spanJoin}${formatDate(range.to, 'long')}`
}

/** The query string's one value, when it is one value. */
function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/* ── The four tiles ────────────────────────────────────────────────────────── */

/** The four rates the head holds, each against the span that came before it. */
function ReportTiles({
  reports,
}: {
  readonly reports: {
    readonly cycleCompletion: CycleCompletionReport
    readonly noShow: NoShowReport
    readonly returnRate: ReturnRateReport
    readonly averageSessions: AverageSessionsReport
    readonly prevCycleCompletion: CycleCompletionReport
    readonly prevNoShow: NoShowReport
    readonly prevReturnRate: ReturnRateReport
    readonly prevAverageSessions: AverageSessionsReport
  }
}) {
  const tiles: readonly {
    readonly label: string
    readonly value: string
    readonly sub: string
    readonly icon: IconName
    readonly tone: string
  }[] = [
    {
      label: REPORT_LABELS.cycleCompletion.title,
      value: formatPercent(Math.round(reports.cycleCompletion.rate * 100)),
      sub: `${ADMIN_REPORTS.previousSpan}${formatPercent(
        Math.round(reports.prevCycleCompletion.rate * 100),
      )}`,
      icon: 'confirm',
      tone: 'bg-ok-bg text-ok',
    },
    {
      label: REPORT_LABELS.noShow.title,
      value: formatPercent(Math.round(reports.noShow.rate * 100)),
      sub: `${ADMIN_REPORTS.previousSpan}${formatPercent(Math.round(reports.prevNoShow.rate * 100))}`,
      icon: 'alert',
      tone: 'bg-danger-bg text-danger',
    },
    {
      label: REPORT_LABELS.returnRate.title,
      value: formatPercent(Math.round(reports.returnRate.rate * 100)),
      sub: `${ADMIN_REPORTS.previousSpan}${formatPercent(
        Math.round(reports.prevReturnRate.rate * 100),
      )}`,
      icon: 'customers',
      tone: 'bg-info-bg text-info',
    },
    {
      label: REPORT_LABELS.averageSessions.title,
      value: formatNumber(reports.averageSessions.averageSessions),
      sub: `${ADMIN_REPORTS.previousSpan}${formatNumber(reports.prevAverageSessions.averageSessions)}`,
      icon: 'clock',
      tone: 'bg-warn-bg text-warn',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3"
        >
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tile.tone)}>
            <Icon name={tile.icon} size="card" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-ink-3">{tile.label}</span>
            <span className="truncate text-lg font-bold text-ink tabular-nums">{tile.value}</span>
            <span className="truncate text-xs text-ink-3 tabular-nums">{tile.sub}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── The two bar cards ─────────────────────────────────────────────────────── */

/**
 * «دوره‌های درمان — کجا رها می‌شوند» — the drop-off curve, as the demo's own bars
 * render it.
 *
 * Each bar is the share of cycles that reached the session the row names, so the
 * curve only falls and the last row is the share that finished. The note names the
 * steepest drop, because that is the one sentence a manager acts on and it is a
 * derivation over the points the module already returned.
 */
function DropOffCard({
  points,
}: {
  readonly points: readonly { readonly sessionNumber: number; readonly rate: number }[]
}) {
  const steepest = steepestDrop(points)

  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-bold text-ink">{REPORT_LABELS.dropOffCurve.title}</h2>
        <p className="text-sm text-ink-2">{REPORT_LABELS.dropOffCurve.lead}</p>
      </div>
      {points.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">{REPORT_FIELDS.empty}</p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {points.map((point) => (
            <div key={point.sessionNumber} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-2">{`${ADMIN_REPORTS.sessionLabel}${formatNumber(
                  point.sessionNumber,
                )}`}</span>
                <span className="font-semibold text-ink tabular-nums">
                  {formatPercent(Math.round(point.rate * 100))}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.round(point.rate * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {steepest === null ? null : (
            <p className="flex items-start gap-2 text-xs text-ink-3">
              <Icon name="info" size="compact" className="mt-0.5 shrink-0" />
              <span>{`${ADMIN_REPORTS.steepestDropStart}${formatNumber(
                steepest.from,
              )}${ADMIN_REPORTS.steepestDropMiddle}${formatNumber(
                steepest.to,
              )}${ADMIN_REPORTS.steepestDropEnd}`}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * The steepest drop the curve holds, as the note's own two session numbers.
 *
 * `null` when the curve holds fewer than two points, because a drop needs a pair to
 * fall between, and the note is the sentence that says it. A tie keeps the earlier
 * pair, because the first gap a manager closes is the one the most cycles fall into
 * first.
 */
function steepestDrop(
  points: readonly { readonly sessionNumber: number; readonly rate: number }[],
): { readonly from: number; readonly to: number } | null {
  const [first, second] = points
  if (first === undefined || second === undefined) return null
  let from = first.sessionNumber
  let to = second.sessionNumber
  let fall = first.rate - second.rate
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    if (current === undefined || next === undefined) continue
    const drop = current.rate - next.rate
    if (drop > fall) {
      from = current.sessionNumber
      to = next.sessionNumber
      fall = drop
    }
  }
  return { from, to }
}

/**
 * «مشتریان بر اساس آخرین مراجعه» — the five buckets the module spells, as the
 * demo's own bars render them.
 *
 * The demo's four are the module's five, because a bucket the set spells is a bucket
 * a customer may be in and the demo's own «۳ تا ۶ ماه» is the module's two. The bar
 * is the bucket's share of the biggest one, which is the comparison the eye makes;
 * the count is the number itself. The note names the customers who have not been back
 * in over six months and links to the winback campaign, because that is the one
 * audience the distribution decides.
 */
function LastVisitCard({ buckets }: { readonly buckets: readonly LastVisitBucketCount[] }) {
  const counts = new Map<LastVisitBucketCount['bucket'], number>(
    buckets.map((row) => [row.bucket, row.count]),
  )
  const beyond = counts.get(BEYOND_BUCKET) ?? 0
  const max = Math.max(1, ...buckets.map((row) => row.count))

  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-bold text-ink">{REPORT_LABELS.lastVisitDistribution.title}</h2>
        <p className="text-sm text-ink-2">{REPORT_LABELS.lastVisitDistribution.lead}</p>
      </div>
      {buckets.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">{REPORT_FIELDS.empty}</p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {LAST_VISIT_BUCKETS.map((bucket) => {
            const count = counts.get(bucket) ?? 0
            return (
              <div key={bucket} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{LAST_VISIT_BUCKET_LABELS[bucket].label}</span>
                  <span className="font-semibold text-ink tabular-nums">{`${formatNumber(count)}${
                    ADMIN_REPORTS.personSuffix
                  }`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className={cx(
                      'h-full rounded-full',
                      bucket === BEYOND_BUCKET ? 'bg-danger' : 'bg-brand',
                    )}
                    style={{ width: `${Math.round((count / max) * 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
          {beyond === 0 ? null : (
            <p className="flex items-start gap-2 text-xs text-ink-3">
              <Icon name="info" size="compact" className="mt-0.5 shrink-0" />
              <span>
                {`${formatNumber(beyond)}${ADMIN_REPORTS.inactiveNoteStart}`}
                <Link
                  href={WINBACK_HREF}
                  className="font-semibold text-brand-700 underline underline-offset-2"
                >
                  {ADMIN_REPORTS.winbackLink}
                </Link>
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** The bucket the note names, which the set spells last. */
const BEYOND_BUCKET = lastOf(LAST_VISIT_BUCKETS)

/**
 * The set's own last bucket, as a value and not a union with `undefined`.
 *
 * The set is a `const` the module owns and its length is a fact the type does not
 * carry past the `noUncheckedIndexedAccess` gate, so the one access the page makes
 * goes through here rather than reaching for a non-null assertion the codebase does
 * not use.
 */
function lastOf(buckets: readonly LastVisitBucketCount['bucket'][]): LastVisitBucketCount['bucket'] {
  const last = buckets[buckets.length - 1]
  if (last === undefined) {
    throw new RangeError('The last-visit distribution holds no bucket')
  }
  return last
}

/** The winback builder's own route, with the type the campaign's own preset reads. */
const WINBACK_HREF = '/admin/campaigns?type=WINBACK'

/* ── The doctor comparison ─────────────────────────────────────────────────── */

/**
 * «مقایسه پزشکان» — the one table, as the demo's own four columns render it.
 *
 * The demo's «نرخ پرشدن» and «مانده‌حساب مراجعینش» have no read (the page's own head
 * says why), so the table holds the four the module does return, in the demo's own
 * order. The card's own head carries the module's sentence and not the demo's
 * insight, because the demo's insight is about the two columns this table does not
 * render.
 */
function DoctorComparisonCard({ doctors }: { readonly doctors: readonly DoctorComparisonRow[] }) {
  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-bold text-ink">{REPORT_LABELS.doctorComparison.title}</h2>
        <p className="text-sm text-ink-2">{REPORT_LABELS.doctorComparison.lead}</p>
      </div>
      {doctors.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">{REPORT_FIELDS.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{REPORT_LABELS.doctorComparison.title}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3">
                <Th>{DOCTOR_FIELDS.doctor}</Th>
                <Th className="text-end">{ADMIN_REPORTS.sessionsThisMonth}</Th>
                <Th className="text-end">{DOCTOR_FIELDS.noShowRate}</Th>
                <Th className="text-end">{DOCTOR_FIELDS.completionRate}</Th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((doctor) => (
                <tr key={doctor.doctorId} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ink">{doctor.doctorName}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-2">
                    {formatNumber(doctor.completedSessions)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-2">
                    {formatPercent(Math.round(doctor.noShowRate * 100))}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-2">
                    {formatPercent(Math.round(doctor.cycleCompletionRate * 100))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** One column header, with the alignment the design system's tables keep. */
function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}