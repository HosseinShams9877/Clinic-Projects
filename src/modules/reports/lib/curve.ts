/**
 * The two distribution reports — the drop-off curve across a course's sessions, and
 * the last-visit distribution across the clinic's customers.
 *
 * Both are counts over buckets rather than a single ratio, because a distribution
 * is what tells the manager *where* the loss happens: the curve names the session a
 * course tends to end at, and the buckets name how long the clinic has not seen a
 * customer for. Neither has a financial column in it, for the reason the module's
 * header states.
 */

import {
  diffLocalDays,
  fromUtcInstant,
  todayLocalDate,
} from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'

import type {
  DropOffCurveReport,
  DropOffPoint,
  LastVisitBucket,
  LastVisitBucketCount,
  LastVisitDistributionReport,
  ReportRange,
} from '../types'
import { LAST_VISIT_BUCKETS } from '../types'
import { readReportOffset, toInstantRange } from './range'

/** The columns the curve reads, and nothing else. */
const CYCLE_SELECT = {
  id: true,
  completedSessions: true,
} as const

const CUSTOMER_SELECT = {
  id: true,
  lastVisitAt: true,
} as const

/** The upper edge of a bucket, in days since the last visit. */
const BUCKET_EDGES: Readonly<Record<LastVisitBucket, number>> = Object.freeze({
  WITHIN_30: 30,
  DAYS_31_TO_60: 60,
  DAYS_61_TO_90: 90,
  DAYS_91_TO_180: 180,
  // The last bucket has no edge; it is everything beyond 180 days.
  BEYOND_180: Number.POSITIVE_INFINITY,
})

/**
 * منحنی ریزش — for each session number, how many of the range's cycles got that far.
 *
 * Session 1 is every cycle in the range, and each subsequent point is the cycles
 * still in care, so the curve can only fall. A clinic whose curve drops sharply
 * after session 3 is a clinic whose patients leave three sessions in, which is the
 * one fact this report exists to surface.
 */
export async function dropOffCurveReport(
  tx: TransactionClient,
  tenantId: string,
  range: ReportRange,
): Promise<DropOffCurveReport> {
  const offset = await readReportOffset(tx, tenantId)
  const instants = toInstantRange(range, offset)

  const cycles = await tx.treatmentCycle.findMany({
    where: { tenantId, startedAt: { gte: instants.start, lt: instants.endExclusive } },
    select: CYCLE_SELECT,
  })

  if (cycles.length === 0) return Object.freeze({ points: [], cycles: 0 })

  const furthest = cycles.reduce((max, row) => Math.max(max, row.completedSessions), 0)
  if (furthest === 0) return Object.freeze({ points: [], cycles: cycles.length })

  const points: DropOffPoint[] = []
  for (let session = 1; session <= furthest; session += 1) {
    const count = cycles.filter((row) => row.completedSessions >= session).length
    points.push({
      sessionNumber: session,
      count,
      rate: count / cycles.length,
    })
  }

  return Object.freeze({ points, cycles: cycles.length })
}

/**
 * توزیع آخرین مراجعه — the clinic's customers grouped by how long ago they were
 * last seen, relative to the clinic-local day of `now`.
 *
 * A snapshot rather than a range: the question is "who have we not seen lately",
 * which is a fact about today and not about a month. The 90-day edge is the same
 * one the «خوابیده‌ها» audience group uses, so the bucket a customer falls into here
 * is the bucket the retention campaign would target them in.
 */
export async function lastVisitDistributionReport(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<LastVisitDistributionReport> {
  const offset = await readReportOffset(tx, tenantId)
  const asOf = todayLocalDate(now)

  const customers = await tx.customer.findMany({
    where: { tenantId, lastVisitAt: { not: null }, isActive: true },
    select: CUSTOMER_SELECT,
  })

  const counts = new Map<LastVisitBucket, number>()
  for (const bucket of LAST_VISIT_BUCKETS) counts.set(bucket, 0)

  for (const customer of customers) {
    if (customer.lastVisitAt === null) continue
    const lastDay = fromUtcInstant(customer.lastVisitAt, offset).localDate
    const days = diffLocalDays(asOf, lastDay)
    const bucket = bucketOf(days)
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  return Object.freeze({
    asOf,
    buckets: LAST_VISIT_BUCKETS.map((bucket) => ({
      bucket,
      count: counts.get(bucket) ?? 0,
    })) satisfies readonly LastVisitBucketCount[],
  })
}

/** The bucket a whole-day gap belongs in. `days` may be negative for a visit later today. */
function bucketOf(days: number): LastVisitBucket {
  if (days <= BUCKET_EDGES.WITHIN_30) return 'WITHIN_30'
  if (days <= BUCKET_EDGES.DAYS_31_TO_60) return 'DAYS_31_TO_60'
  if (days <= BUCKET_EDGES.DAYS_61_TO_90) return 'DAYS_61_TO_90'
  if (days <= BUCKET_EDGES.DAYS_91_TO_180) return 'DAYS_91_TO_180'
  return 'BEYOND_180'
}
