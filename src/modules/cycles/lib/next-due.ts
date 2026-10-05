/**
 * `nextDueDate = lastSessionAt + cycle.intervalDays` — `03-data-model.md` §2.4.1
 * rule 3, and the single most important arithmetic in the module.
 *
 * ## Why the result is a day and not an instant
 *
 * The column is a `DateTime` and the sweep compares it against the clock, so it holds
 * an instant — but the fact it holds is a **day**: «موعد رسیده» is a statement about a
 * date, and the contact list is a list of days the desk works through. The stored
 * instant is therefore the due day's own start, and a cycle becomes due at the
 * beginning of the day it is due on rather than at the hour of the session that
 * started the interval.
 *
 * That choice is what makes the list readable in the morning. A session completed at
 * 17:00 with a seven-day interval would be due at 17:00 the following week under
 * instant arithmetic, and at 09:00 on the due day the desk would not see it — the
 * customer's due day would open with the cycle missing from the list, and the desk
 * would not call them until the afternoon.
 *
 * ## Why the day comes from the library and not from `86_400_000`
 *
 * Iran does not observe daylight saving, so for this product the two are arithmetically
 * equal. They are not *semantically* equal: the day the customer reads is the Jalali
 * one, and `07-localization.md` §6.1 draws the line at exactly this — the library owns
 * the conversion, and a second implementation is the one that would be wrong. The
 * clinic's offset is therefore a required parameter here and not a default, because the
 * instant the column stores is only meaningful against the tenant's own calendar, and
 * the module that stores it has already loaded the settings.
 *
 * ## Why a month boundary is a boundary at all
 *
 * `intervalDays` is whole days and not whole months, so crossing a month is not the
 * arithmetic that makes the result — but the Jalali months are unequal (اسفند has 29 in
 * a common year and 30 in a leap one), and a day count that walked the Gregorian
 * calendar would land on the wrong Jalali day whenever the interval crosses one. The
 * test table in `tests/cycles.test.ts` is the DoD 2 assertion that it does not.
 */

import {
  addLocalDays,
  fromClockParts,
  fromUtcInstant,
  toUtcInstant,
  type LocalDate,
} from '@/core/localization'

/** The day's own start, which is the time a due date carries. */
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

/**
 * The Jalali day a session's interval expires on.
 *
 * The whole computation, in the library's own terms: the instant becomes the clinic's
 * Jalali day, the day shifts by the interval, and the result is a `LocalDate` the page
 * can render without a second conversion.
 */
export function nextDueLocalDate(
  lastSessionAt: Date,
  intervalDays: number,
  utcOffsetMinutes: number,
): LocalDate {
  const { localDate } = fromUtcInstant(lastSessionAt, utcOffsetMinutes)
  return addLocalDays(localDate, intervalDays)
}

/**
 * The instant the column stores for that day — the due day's own start, against the
 * tenant's offset.
 *
 * `nextDueDate` and `nextContactAt` are the two columns this module stores as a day,
 * and both use the day's start for the same reason the follow-up date does in
 * `_customers/actions.ts`: a day the person reads as «۱۴۰۵/۰۳/۰۴» has to land on that
 * day.
 */
export function nextDueInstant(
  lastSessionAt: Date,
  intervalDays: number,
  utcOffsetMinutes: number,
): Date {
  return toUtcInstant(
    nextDueLocalDate(lastSessionAt, intervalDays, utcOffsetMinutes),
    MIDNIGHT,
    utcOffsetMinutes,
  )
}
