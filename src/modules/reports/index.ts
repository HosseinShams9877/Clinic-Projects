/**
 * The `reports` module's complete public surface — `02-architecture.md` §10 rule 2:
 * "If something is not in the barrel, it is private."
 *
 * The surface is seven report functions and the labels the page renders them with.
 * The seven are the closed set the specification names, and nothing financial is
 * exported — a property `tests/no-financial-surface.test.ts` enumerates the barrel
 * to assert, so a `revenue` report added to this file would fail the phase's own
 * gate rather than pass unnoticed.
 */

export type {
  AverageSessionsReport,
  CycleCompletionReport,
  DoctorComparisonReport,
  DoctorComparisonRow,
  DropOffCurveReport,
  DropOffPoint,
  InstantRange,
  LastVisitBucketCount,
  LastVisitDistributionReport,
  NoShowReport,
  ReportRange,
  ReturnRateReport,
} from './types'

export { LAST_VISIT_BUCKETS } from './types'

export {
  DOCTOR_FIELDS,
  LAST_VISIT_BUCKET_LABELS,
  REPORT_FIELDS,
  REPORT_LABELS,
  REPORT_ORDER,
} from './catalog'
export type { ReportKey } from './catalog'

// The range vocabulary the seven reports share. It is exported because the range is
// not a reports-internal detail: a span of days has to be read the same way wherever
// it is read, and the dashboard's month and day counts are spans of days too.
export { localDateWhere, monthStartOf, readReportOffset, toInstantRange } from './lib/range'

export { averageSessionsReport, cycleCompletionReport, noShowReport, returnRateReport } from './lib/retention'

export { dropOffCurveReport, lastVisitDistributionReport } from './lib/curve'

export { doctorComparisonReport } from './lib/doctors'
