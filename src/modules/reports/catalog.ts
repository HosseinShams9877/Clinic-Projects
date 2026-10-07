/**
 * The Persian surface of the reports module — the seven reports' names, the
 * sentences that explain them, and the last-visit buckets' labels.
 *
 * `05-conventions.md` §14 puts every Persian literal in a catalog, and this is the
 * reports module's. The page reaches it through the barrel and references a label
 * by its key, so a sentence with no report is a compile error rather than a string
 * nothing renders.
 */

import type { LastVisitBucket } from './types'

/** The page's own name and scope, as the reports page renders them. */
export const REPORT_FIELDS = Object.freeze({
  title: 'گزارش‌ها',
  lead: 'گزارش‌های بازگشت مشتری و تکمیل دوره درمان.',
  rangeFrom: 'از تاریخ',
  rangeTo: 'تا تاریخ',
  apply: 'اعمال بازه',
  empty: 'در این بازه داده‌ای برای این گزارش نیست.',
}) satisfies Record<string, string>

/**
 * The doctor comparison's own columns, as the one table the page renders names them.
 *
 * Separate from `REPORT_LABELS` because the seven are reports and these are the
 * columns of one of them; a column the table does not have is a key with no cell.
 */
export const DOCTOR_FIELDS = Object.freeze({
  doctor: 'پزشک',
  sessions: 'جلسات',
  noShows: 'عدم حضور',
  noShowRate: 'نرخ عدم حضور',
  activeCycles: 'دوره‌های فعال',
  completionRate: 'تکمیل دوره',
}) satisfies Record<string, string>

/** The seven reports the page offers, keyed as the barrel names them. */
export type ReportKey =
  | 'returnRate'
  | 'averageSessions'
  | 'cycleCompletion'
  | 'noShow'
  | 'dropOffCurve'
  | 'lastVisitDistribution'
  | 'doctorComparison'

/** The name and the one-line explanation of each report. */
export const REPORT_LABELS: Readonly<
  Record<ReportKey, { readonly title: string; readonly lead: string }>
> = Object.freeze({
  returnRate: {
    title: 'نرخ بازگشت',
    lead: 'سهم مشتریانی که برای بار دوم به کلینیک آمدند.',
  },
  averageSessions: {
    title: 'میانگین جلسات',
    lead: 'میانگین جلسات کامل‌شده به ازای هر مشتری.',
  },
  cycleCompletion: {
    title: 'تکمیل دوره درمان',
    lead: 'سهم دوره‌هایی که به جای رها شدن، کامل شدند.',
  },
  noShow: {
    title: 'نرخ عدم حضور',
    lead: 'سهم جلساتی که مشتری در آن‌ها حاضر نشد.',
  },
  dropOffCurve: {
    title: 'منحنی ریزش',
    lead: 'تعداد دوره‌هایی که تا هر جلسه پیش رفتند.',
  },
  lastVisitDistribution: {
    title: 'توزیع آخرین مراجعه',
    lead: 'مشتریان بر اساس روزهایی که از آخرین مراجعه آن‌ها می‌گذرد.',
  },
  doctorComparison: {
    title: 'مقایسه پزشکان',
    lead: 'حضور بیماران و تکمیل دوره برای هر پزشک.',
  },
})

/** The reports the page groups under one heading, in the order they render. */
export const REPORT_ORDER: readonly ReportKey[] = Object.freeze([
  'returnRate',
  'averageSessions',
  'cycleCompletion',
  'noShow',
  'dropOffCurve',
  'lastVisitDistribution',
  'doctorComparison',
])

/** The label of each last-visit bucket, with the day range the bucket covers. */
export const LAST_VISIT_BUCKET_LABELS: Readonly<
  Record<LastVisitBucket, { readonly label: string; readonly days: string }>
> = Object.freeze({
  WITHIN_30: { label: 'کمتر از ۳۰ روز', days: '۰ تا ۳۰' },
  DAYS_31_TO_60: { label: '۳۱ تا ۶۰ روز', days: '۳۱ تا ۶۰' },
  DAYS_61_TO_90: { label: '۶۱ تا ۹۰ روز', days: '۶۱ تا ۹۰' },
  DAYS_91_TO_180: { label: '۹۱ تا ۱۸۰ روز', days: '۹۱ تا ۱۸۰' },
  BEYOND_180: { label: 'بیش از ۱۸۰ روز', days: '۱۸۰ به بالا' },
})
