/**
 * The four buckets — `03-data-model.md` §4.3's "four ranges over the same index".
 *
 * The buckets are exclusive and ordered most severe first, so a row lands in the one
 * the desk most needs to see it in. The boundary dates are the four the list is named
 * for — «بیش از ۳۰ روز», «بیش از ۷ روز», «گذشته از سررسید», «نزدیک سررسید» — and
 * each one is a comparison against the due date, which is `scheduledAt + grace` and
 * therefore monotonic in `scheduledAt`. That monotonicity is what §4.3 means when it
 * says a debt query is a range scan on `appt_tenant_status_sched_idx`: the bucket is
 * computed here, and the rows that feed it are served by the index.
 */

import { DebtBucket } from '@/core/constants'
import { fromUtcInstant, type LocalDate } from '@/core/localization'

/** How many milliseconds each boundary is expressed in, so the comparisons read as days. */
const DAY_MS = 24 * 60 * 60 * 1000

/** The threshold of each severity, in days past the due date. */
const OVERDUE_30_DAYS = 30
const OVERDUE_7_DAYS = 7

/**
 * The bucket a debt is in, from the due date the row already computed.
 *
 * The due date is the effective one — the customer's promise when the desk recorded
 * one, else the session plus the grace period — and `now` is the injected clock, never
 * the wall clock (`05-conventions.md` §8).
 */
export function bucketOf(now: Date, dueAt: Date): DebtBucket {
  const overdueDays = Math.floor((now.getTime() - dueAt.getTime()) / DAY_MS)
  if (overdueDays > OVERDUE_30_DAYS) return DebtBucket.Over30Days
  if (overdueDays > OVERDUE_7_DAYS) return DebtBucket.Over7Days
  if (overdueDays >= 0) return DebtBucket.PastDue
  return DebtBucket.DueSoon
}

/**
 * The effective due instant — the promise when there is one, else the computed date.
 *
 * The override is the desk's own record of what the customer agreed to, and it wins
 * over arithmetic because a promise the clinic made and then ignored is worse than a
 * date it derived. `graceDays` is added to the session's instant, which is the same
 * day-count arithmetic either way; the day the desk reads comes back through the
 * localization layer so a due date never walks back a month at a Jalali boundary.
 */
export function effectiveDueInstant(args: {
  readonly scheduledAt: Date
  readonly override: Date | null
  readonly graceDays: number
}): Date {
  if (args.override !== null) return args.override
  return new Date(args.scheduledAt.getTime() + args.graceDays * DAY_MS)
}

/** The due date as the local day the desk reads it, through the tenant's own calendar. */
export function dueLocalDate(dueAt: Date, utcOffsetMinutes: number): LocalDate {
  return fromUtcInstant(dueAt, utcOffsetMinutes).localDate
}
