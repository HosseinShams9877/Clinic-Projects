/**
 * The vocabulary of the localization layer.
 *
 * `03-data-model.md` §3.1 fixes the product's **dual date representation**, and
 * these types are what makes that decision enforceable rather than merely
 * documented:
 *
 * - `scheduledAt: DateTime` — the UTC instant. Ordering and arithmetic.
 * - `localDate: String` (`YYYY-MM-DD`, **Jalali years**) and `localTime: String`
 *   (`HH:mm`) — clinic-local. Day grids, display, uniqueness.
 *
 * `LocalDate` is branded, and the brand is the point. A Gregorian `2026-09-20`
 * and a Jalali `1405-06-29` are both `YYYY-MM-DD` strings; nothing but a brand
 * stops one being passed where the other is expected. §3.1 states the risk in
 * its own words — "Iranian time (UTC+3:30) is exactly the kind of offset that
 * produces off-by-one-day bugs that appear only in production" — and a brand is
 * the cheapest defence available: it costs one function call at each boundary
 * and it cannot be forgotten at a call site, because the call site does not
 * compile.
 *
 * There are deliberately **no constructors in this file.** Parsing validates, and
 * validation needs the calendar, which lives in `jalali.ts`. Splitting them would
 * create two parsers with different strictness and a caller who picks the wrong
 * one. One parser, one place: `asLocalDate` in `jalali.ts`.
 */

import type { Brand } from '@/core/types'

import { MOBILE_DIGIT_LENGTH, MOBILE_PREFIX } from '@/core/constants'

/* ── Dates and times ──────────────────────────────────────────────────────── */

/**
 * A calendar day in the **Jalali** calendar, `YYYY-MM-DD`, Latin digits.
 *
 * Latin digits, not Persian: `07-localization.md` §4.1 — "Values are stored and
 * computed in Latin digits and converted at the render boundary… A Persian digit
 * in the database is a defect: it breaks sorting, comparison, and every parse."
 */
export type LocalDate = Brand<string, 'LocalDate'>

/** A wall-clock time in the clinic's zone, `HH:mm`, 24-hour, Latin digits. */
export type LocalTime = Brand<string, 'LocalTime'>

/** A Jalali date broken into its parts. `month` is 1–12, `day` 1–31. */
export interface JalaliParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** A Gregorian date broken into its parts. `month` is 1–12, the Gregorian year. */
export interface GregorianParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

/**
 * A time of day broken into its parts, 24-hour.
 *
 * `GregorianParts` is **not exported** from the layer. `JalaliParts` is, because a
 * date picker holds parts and hands them back, and `fromJalaliParts` is how it
 * turns a selection into a `LocalDate`. The two shapes are structurally identical,
 * so TypeScript cannot stop one being passed where the other is expected — and
 * that is the same hazard the `LocalDate` brand exists to close at the string
 * level. It is closed here by naming and by scarcity rather than by the type
 * system: a Gregorian triple is never a value any caller can obtain, so the only
 * parts a caller can hold are Jalali ones.
 */
export interface ClockParts {
  readonly hour: number
  readonly minute: number
}

/* ── The week ─────────────────────────────────────────────────────────────── */

/**
 * A weekday, where **0 is شنبه** (Saturday).
 *
 * `07-localization.md` §6.4: "**The week starting on Saturday is a behavioural
 * requirement, not a formatting one.** It governs slot generation, the 'this
 * week' report ranges, working-hours configuration, and the appointment grid's
 * column order. A calendar that starts on Sunday is wrong even if every date on
 * it is correct."
 *
 * `Date.prototype.getDay()` numbers Sunday as 0. That mismatch is the single
 * most likely source of a one-column-shifted grid, so the two are never mixed:
 * `calendar.ts` converts once, in `startOfJalaliWeek`, and every grid consumes
 * `WeekdayIndex`. Anything holding a `0` from `getDay()` is a raw JS weekday and
 * is not this type.
 */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** The seven weekdays in display order, شنبه first. */
export const WEEKDAY_INDEXES: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * The number of days in a week.
 *
 * A named constant rather than a literal `7` in the four places that need one —
 * `calendar.ts` when it lays out a month grid, `format.ts` when it turns a day
 * count into a week count. Not from `06-constants.md`, because it is not a
 * product decision; it is what a week is.
 */
export const DAYS_IN_WEEK = 7

/** A Jalali month number, 1 = فروردین … 12 = اسفند. */
export type JalaliMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** The twelve months in order. */
export const JALALI_MONTHS: readonly JalaliMonth[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/* ── Shapes ───────────────────────────────────────────────────────────────── */

/**
 * `YYYY-MM-DD` with four digits for the year.
 *
 * A shape test only. It accepts `1405-13-45`, which is not a date — that
 * rejection belongs to `asLocalDate`, which can consult the calendar. Keeping the
 * pattern exported lets a Zod schema reject a malformed string cheaply before the
 * calendar is involved, and lets the two agree by importing the same constant.
 */
export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `HH:mm`, 24-hour. Unlike the date pattern this one is also a validity test. */
export const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The stored mobile shape: the country's trunk prefix followed by the remaining
 * nine digits.
 *
 * Derived from `MOBILE_PREFIX` and `MOBILE_DIGIT_LENGTH` rather than written as
 * `/^09\d{9}$/`, because `06-constants.md` §7 rule 2 forbids the same value
 * appearing as a literal in two places — and a country whose mobile length
 * changed must not have to be hunted for across the codebase.
 */
export const MOBILE_PATTERN = new RegExp(
  `^${MOBILE_PREFIX}\\d{${MOBILE_DIGIT_LENGTH - MOBILE_PREFIX.length}}$`,
)
