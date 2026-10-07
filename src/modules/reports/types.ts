/**
 * The shapes the seven retention reports return.
 *
 * None carries money. `reports` is the one module the specification deliberately
 * keeps financial figures out of, and that is a property of the types before it is
 * a property of any query — a field that is not here is a figure no screen can
 * render and no caller can ask for.
 */

import type { LocalDate } from '@/core/localization'

/** The Jalali range a report is computed over, rendered on the page beside it. */
export interface ReportRange {
  readonly from: LocalDate
  readonly to: LocalDate
}

/**
 * The two instants of a range, for the columns that store an instant rather than a
 * Jalali string. Exclusive at the end, so the last day is whole.
 */
export interface InstantRange {
  readonly start: Date
  readonly endExclusive: Date
}

/** نرخ بازگشت — the share of a cohort that came back more than once. */
export interface ReturnRateReport {
  /** The cohort: customers whose first visit falls in the range. */
  readonly totalCustomers: number
  /** Those of them with two or more completed sessions. */
  readonly returningCustomers: number
  /** `returningCustomers / totalCustomers`, `0` when the cohort is empty. */
  readonly rate: number
}

/** میانگین جلسات به ازای هر مشتری — the cohort's mean completed sessions. */
export interface AverageSessionsReport {
  readonly averageSessions: number
  readonly customers: number
}

/** نرخ تکمیل دوره — completed cycles over the cycles that reached an end. */
export interface CycleCompletionReport {
  readonly completed: number
  readonly abandoned: number
  /** Completed + abandoned: the cycles whose outcome is known. */
  readonly terminal: number
  /** `completed / terminal`, `0` when no cycle has ended. */
  readonly rate: number
}

/** نرخ عدم حضور — no-shows over the sessions that had an outcome. */
export interface NoShowReport {
  readonly completed: number
  readonly noShows: number
  /** `noShows / (completed + noShows)`, `0` when neither occurred. */
  readonly rate: number
}

/** One point of منحنی ریزش — how many cycles reached this session number. */
export interface DropOffPoint {
  readonly sessionNumber: number
  /** Cycles whose `completedSessions` is at least this number. */
  readonly count: number
  /** `count / cycles`, the share that is still in care at this session. */
  readonly rate: number
}

export interface DropOffCurveReport {
  readonly points: readonly DropOffPoint[]
  /** The cycles the curve is built from. */
  readonly cycles: number
}

/** The buckets توزیع آخرین مراجعه groups customers by. */
export const LastVisitBucket = {
  Within30: 'WITHIN_30',
  Days31To60: 'DAYS_31_TO_60',
  Days61To90: 'DAYS_61_TO_90',
  Days91To180: 'DAYS_91_TO_180',
  Beyond180: 'BEYOND_180',
} as const
export type LastVisitBucket = (typeof LastVisitBucket)[keyof typeof LastVisitBucket]

/** The five buckets, in the order the page renders them. */
export const LAST_VISIT_BUCKETS = [
  LastVisitBucket.Within30,
  LastVisitBucket.Days31To60,
  LastVisitBucket.Days61To90,
  LastVisitBucket.Days91To180,
  LastVisitBucket.Beyond180,
] as const satisfies readonly LastVisitBucket[]

export interface LastVisitBucketCount {
  readonly bucket: LastVisitBucket
  readonly count: number
}

export interface LastVisitDistributionReport {
  readonly buckets: readonly LastVisitBucketCount[]
  /** The clinic-local day the distribution is relative to. */
  readonly asOf: LocalDate
}

/** مقایسه پزشکان — one row per doctor who saw the cohort. */
export interface DoctorComparisonRow {
  readonly doctorId: string
  readonly doctorName: string
  readonly completedSessions: number
  readonly noShows: number
  readonly noShowRate: number
  readonly activeCycles: number
  readonly completedCycles: number
  readonly abandonedCycles: number
  readonly cycleCompletionRate: number
}

export interface DoctorComparisonReport {
  readonly doctors: readonly DoctorComparisonRow[]
}
