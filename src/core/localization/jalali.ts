/**
 * The Jalali calendar — conversion, parts, and arithmetic.
 *
 * `01-tech-stack.md` §8.6 splits the work in two: `date-fns-jalali` owns
 * "Gregorian ↔ Jalali conversion, day/month/year arithmetic, month grids, week
 * ranges", and this repository owns the display layer. **This file is the entire
 * boundary between them.** It is the only module in the codebase that imports
 * `date-fns-jalali`, which is checkable — one grep, one file — and it is what
 * makes the library replaceable without touching a component.
 *
 * The public surface deals in `LocalDate` and `LocalTime`, never in `Date`.
 * Leaking `Date` out of here would put the library's representation into every
 * caller, and `Date` is precisely the type that carries the timezone bug §3.1 of
 * `03-data-model.md` describes. `Date` appears in exactly three places, each
 * named for the boundary it crosses: `dateToLocalDate`, `toUtcInstant` and
 * `fromUtcInstant`.
 *
 * ## Why the library's behaviour can be relied on
 *
 * The fork keeps a JavaScript `Date` as a Gregorian instant and converts on every
 * accessor: `getYear`, `getMonth` and `getDate` read the date's **local**
 * Gregorian parts and run them through the Julian Day Number conversion, and
 * `newDate` converts Jalali parts back and constructs a local `Date`. Numeric
 * `format` tokens (`yyyy`, `MM`, `dd`) go through the same accessors, so
 * `format(d, 'yyyy-MM-dd')` yields the Jalali date in ASCII digits.
 *
 * Two consequences are load-bearing, and both are asserted in the test file
 * beside this one rather than trusted:
 *
 * - **The runtime's timezone does not change a `LocalDate`.** Both directions use
 *   the same local parts, so the Jalali date is stable whichever zone the process
 *   runs in. This is the property `07-localization.md` §6.1 demands, and it is why
 *   the library does not carry `Intl`'s runtime-dependence.
 * - **Overflow is silently normalised away.** `newDate(1405, 5, 32)` is
 *   1405-07-01, not an error, because the constructor converts through a Julian
 *   Day Number and a day number has no notion of a month boundary. **Validation is
 *   therefore ours and is not optional** — `asLocalDate` checks the day against
 *   the month's real length before any construction happens.
 */

import {
  addDays as dfAddDays,
  addMonths as dfAddMonths,
  differenceInCalendarDays as dfDifferenceInCalendarDays,
  eachDayOfInterval as dfEachDayOfInterval,
  getDate as dfGetDate,
  getDay as dfGetDay,
  getDaysInMonth as dfGetDaysInMonth,
  getHours as dfGetHours,
  getMinutes as dfGetMinutes,
  getMonth as dfGetMonth,
  getYear as dfGetYear,
  isLeapYear as dfIsLeapYear,
  newDate as dfNewDate,
} from 'date-fns-jalali'

import {
  DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
  MAX_LOCAL_DATE_YEAR,
  MIN_LOCAL_DATE_YEAR,
} from '@/core/constants'
import { ValidationError } from '@/core/types'

import { toLatinDigits } from './digits'
import type {
  ClockParts,
  GregorianParts,
  JalaliParts,
  LocalDate,
  LocalTime,
  WeekdayIndex,
} from './types'
import { LOCAL_DATE_PATTERN, LOCAL_TIME_PATTERN } from './types'

/* ── Errors ───────────────────────────────────────────────────────────────── */

function invalidDate(value: string, reason: string): ValidationError {
  return new ValidationError(`Invalid local date ${JSON.stringify(value)}: ${reason}`, {
    messageKey: 'validation.localDate.invalid',
    messageParams: { value },
    detail: { reason },
  })
}

function invalidTime(value: string): ValidationError {
  return new ValidationError(`Invalid local time ${JSON.stringify(value)}`, {
    messageKey: 'validation.localTime.invalid',
    messageParams: { value },
  })
}

/* ── Formatting primitives ────────────────────────────────────────────────── */

/**
 * A non-negative integer padded to `length` digits.
 *
 * Strict on purpose. Every value that reaches it has already been validated, so
 * a negative or a `NaN` here means a brand was cast away somewhere upstream — and
 * the alternative to throwing is emitting `0NaN-0NaN-0NaN`, which is a string
 * that looks like a date and sorts like one.
 */
function pad(value: number, length: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`Cannot pad ${String(value)} into a date field`, {
      messageKey: 'validation.localDate.invalid',
      detail: { value: String(value) },
    })
  }
  return String(value).padStart(length, '0')
}

/* ── Calendar facts ───────────────────────────────────────────────────────── */

/**
 * `true` when the Jalali year is a leap year.
 *
 * Delegated to the library rather than reimplemented. The rule is the 33-year
 * cycle in its `_lib/jalali.js` — `mod(25 * year + 11, 33) < 8` for every year
 * this product can hold — but the cycle has known exception years that the
 * formula alone gets wrong, and a second copy of it here is a second thing to
 * keep correct.
 */
export function isJalaliLeapYear(year: number): boolean {
  assertStorableYear(year)
  return dfIsLeapYear(dfNewDate(year, 0, 1))
}

/**
 * The number of days in a Jalali month: 31 for months 1–6, 30 for 7–11, and 29 or
 * 30 for اسفند depending on the leap year (`07-localization.md` §6.2).
 *
 * Also delegated. `getDaysInMonth` asks the library for "day 0 of the next
 * month", which is the last day of this one, and the library's `setFullYear`
 * normalises the roll-over through the Jalali calendar rather than through
 * Gregorian arithmetic — the distinction that makes Esfand come out right.
 */
export function daysInJalaliMonth(year: number, month: number): number {
  assertStorableYear(year)
  assertMonth(month)
  return dfGetDaysInMonth(dfNewDate(year, month - 1, 1))
}

function assertStorableYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_LOCAL_DATE_YEAR || year > MAX_LOCAL_DATE_YEAR) {
    throw new ValidationError(
      `Jalali year ${String(year)} is outside ${MIN_LOCAL_DATE_YEAR}–${MAX_LOCAL_DATE_YEAR}`,
      {
        messageKey: 'validation.localDate.outOfRange',
        messageParams: { min: String(MIN_LOCAL_DATE_YEAR), max: String(MAX_LOCAL_DATE_YEAR) },
        detail: { year: String(year) },
      },
    )
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError(`Jalali month ${String(month)} is outside 1–12`, {
      messageKey: 'validation.localDate.invalid',
      detail: { month: String(month) },
    })
  }
}

/* ── LocalDate ────────────────────────────────────────────────────────────── */

/**
 * `true` when `value` is a `LocalDate` this product will store.
 *
 * The predicate, and the **only** implementation of the rule — `asLocalDate` is a
 * thin cast on top of it. Two functions carrying the same checks is how a Zod
 * schema and a constructor come to disagree about what a valid date is.
 *
 * Persian and Arabic-Indic digits are accepted and normalised to Latin, because
 * `07-localization.md` §4.1 makes that the input rule: "a value typed as «۱۲۳»
 * and a value typed as `123` are the same value". The *stored* form is Latin; the
 * *accepted* form is both.
 */
export function isValidLocalDate(value: string): boolean {
  const normalized = toLatinDigits(value.trim())
  if (!LOCAL_DATE_PATTERN.test(normalized)) return false

  const year = Number(normalized.slice(0, 4))
  const month = Number(normalized.slice(5, 7))
  const day = Number(normalized.slice(8, 10))

  if (year < MIN_LOCAL_DATE_YEAR || year > MAX_LOCAL_DATE_YEAR) return false
  if (month < 1 || month > 12) return false
  if (day < 1) return false

  return day <= dfGetDaysInMonth(dfNewDate(year, month - 1, 1))
}

/**
 * Validates and brands a `LocalDate`.
 *
 * Every date that enters the system passes through here — from a form, a query
 * parameter, a seeded fixture, or a row read out of the database. The database is
 * not a trusted source: `03-data-model.md` §5 stores dates as plain `String`
 * columns because neither engine has a Jalali type, so the column cannot enforce
 * its own contents and this function is the only thing that does.
 */
export function asLocalDate(value: string): LocalDate {
  const normalized = toLatinDigits(value.trim())
  if (!isValidLocalDate(normalized)) {
    throw invalidDate(value, 'not a well-formed Jalali date within the storable range')
  }
  return normalized as LocalDate
}

/** The Jalali parts of a `LocalDate`. Constructs nothing, so it cannot fail. */
export function jalaliParts(localDate: LocalDate): JalaliParts {
  return {
    year: Number(localDate.slice(0, 4)),
    month: Number(localDate.slice(5, 7)),
    day: Number(localDate.slice(8, 10)),
  }
}

/**
 * Builds a `LocalDate` from its parts, validating as it goes.
 *
 * A calendar grid and a date picker both hold parts and need the string; going
 * through `asLocalDate` means a grid cannot construct a day that does not exist,
 * which is the failure a hand-built `1403-12-30` in a common year would produce.
 */
export function fromJalaliParts(parts: JalaliParts): LocalDate {
  return asLocalDate(`${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`)
}

/* ── LocalTime and the clock ──────────────────────────────────────────────── */

/** `true` when `value` is a `HH:mm` time of day. Accepts Persian digits. */
export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME_PATTERN.test(toLatinDigits(value.trim()))
}

/** Validates and brands a `LocalTime`. */
export function asLocalTime(value: string): LocalTime {
  const normalized = toLatinDigits(value.trim())
  if (!isValidLocalTime(normalized)) {
    throw invalidTime(value)
  }
  return normalized as LocalTime
}

/** The hour and minute of a `LocalTime`. */
export function clockParts(localTime: LocalTime): ClockParts {
  return {
    hour: Number(localTime.slice(0, 2)),
    minute: Number(localTime.slice(3, 5)),
  }
}

/** Builds a `LocalTime` from its parts, wrapping a 24th hour into the next day. */
export function fromClockParts(parts: ClockParts): LocalTime {
  return minutesToTime(parts.hour * 60 + parts.minute)
}

/**
 * Minutes since midnight.
 *
 * The unit every slot calculation uses. `03-data-model.md` §3.1 keeps `localTime`
 * a string because a string is what a grid displays and what an index compares;
 * arithmetic converts to minutes at the edges and back, never carrying a
 * half-converted value in between.
 */
export function timeToMinutes(localTime: LocalTime): number {
  const { hour, minute } = clockParts(localTime)
  return hour * 60 + minute
}

/**
 * Minutes since midnight back to a `LocalTime`.
 *
 * `minutesToTime(1440)` is `00:00` — the next day — so a caller that needs the
 * date too must use `addLocalDays` as well, or `addMinutesToTime` on a slot that
 * knows its own day. The function is total on negative values and on values past
 * midnight rather than throwing, because slot generation legitimately walks past
 * the end of a working day and asks what time that is.
 */
export function minutesToTime(minutes: number): LocalTime {
  const total = Math.trunc(minutes)
  const wrapped = ((total % 1440) + 1440) % 1440
  return asLocalTime(`${pad(Math.floor(wrapped / 60), 2)}:${pad(wrapped % 60, 2)}`)
}

/** `localTime` shifted by `minutes`, wrapping within the day. */
export function addMinutesToTime(localTime: LocalTime, minutes: number): LocalTime {
  return minutesToTime(timeToMinutes(localTime) + minutes)
}

/* ── The bridge to and from the UTC instant ───────────────────────────────── */

/** `localDate` as a `Date` at local midnight, for the library to work on. */
function dateObjectOf(localDate: LocalDate): Date {
  const { year, month, day } = jalaliParts(localDate)
  return dfNewDate(year, month - 1, day)
}

/** The Jalali parts of a `Date` the library produced. */
function jalaliPartsOf(date: Date): JalaliParts {
  return { year: dfGetYear(date), month: dfGetMonth(date) + 1, day: dfGetDate(date) }
}

/** The Gregorian parts of a `LocalDate`, read back off the constructed `Date`. */
function gregorianPartsOf(localDate: LocalDate): GregorianParts {
  const date = dateObjectOf(localDate)
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

/**
 * The `LocalDate` a `Date` falls on, in the clinic's calendar.
 *
 * Reads the date's local Gregorian parts and converts them to Jalali. It is the
 * inverse of `toUtcInstant` only when the `Date` is already the clinic's wall
 * clock, which is why a caller holding a stored instant reaches for
 * `fromUtcInstant` instead of this.
 *
 * Throws on an Invalid `Date` rather than rendering `NaN-NaN-NaN`. A `Date` that
 * cannot be read is a defect upstream, and `05-conventions.md` §7 says the
 * response to one is to fail loudly — not to return a value that looks like data.
 */
export function dateToLocalDate(date: Date): LocalDate {
  if (Number.isNaN(date.getTime())) {
    throw invalidDate(String(date), 'Invalid Date')
  }
  return fromJalaliParts(jalaliPartsOf(date))
}

/**
 * The `LocalDate` that `now` falls on, read as "today".
 *
 * `05-conventions.md` §8: "**No `new Date()` in business logic.** Time comes from
 * an injected clock, so a test can place the system at any instant." The clock is
 * therefore a **required** parameter, and this layer never reads one. A route
 * handler or a server component supplies the instant from the request; a test
 * supplies a literal; nothing supplies the wall clock implicitly.
 *
 * The function is a named alias of `dateToLocalDate` and earns its place by what
 * the name asserts at a call site — `todayLocalDate(clock.now())` says the instant
 * is being used as *today*, which is exactly the assumption that has to be visible
 * wherever a report or a reminder depends on it.
 */
export function todayLocalDate(now: Date): LocalDate {
  return dateToLocalDate(now)
}

/**
 * The wall-clock time of `now`, `HH:mm`.
 *
 * A required parameter for the same reason as `todayLocalDate`. The library's
 * `getHours` and `getMinutes` read the date's local parts, so the result is the
 * clock time on the machine that produced the instant — which is why the caller
 * that produces it, not this function, is where the clinic's offset belongs.
 */
export function nowLocalTime(now: Date): LocalTime {
  if (Number.isNaN(now.getTime())) {
    throw invalidTime(String(now))
  }
  return fromClockParts({ hour: dfGetHours(now), minute: dfGetMinutes(now) })
}

/**
 * The UTC instant for a clinic-local date and time.
 *
 * `03-data-model.md` §3.1 stores both representations of every scheduled thing,
 * and this is the one direction that has to know the clinic's offset. The offset
 * is a **parameter**, not a lookup: the tenant's setting is the authority, and a
 * module that needs the instant has already loaded its settings. The default is
 * the constant, so a form preview or a test can call it without one.
 *
 * The offset is applied as arithmetic on a UTC timestamp rather than by setting
 * the process timezone, so the result cannot depend on `TZ` being right on the
 * host — the same reasoning as `DEFAULT_CLINIC_UTC_OFFSET_MINUTES` itself.
 */
export function toUtcInstant(
  localDate: LocalDate,
  localTime: LocalTime,
  utcOffsetMinutes: number = DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
): Date {
  const gregorian = gregorianPartsOf(localDate)
  const { hour, minute } = clockParts(localTime)
  const asIfUtc = Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day, hour, minute, 0, 0)
  return new Date(asIfUtc - utcOffsetMinutes * 60_000)
}

/**
 * The clinic-local date and time of a UTC instant.
 *
 * The inverse of `toUtcInstant`, and what a day-grid query uses when it holds a
 * stored instant and needs the column to put it in.
 */
export function fromUtcInstant(
  instant: Date,
  utcOffsetMinutes: number = DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
): { readonly localDate: LocalDate; readonly localTime: LocalTime } {
  if (Number.isNaN(instant.getTime())) {
    throw invalidDate(String(instant), 'Invalid Date')
  }
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60_000)
  // The UTC accessors of the shifted instant *are* the clinic's wall clock. The
  // local accessors would re-apply the host's offset and undo the shift.
  const localDate = dateToLocalDate(
    new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  )
  return {
    localDate,
    localTime: fromClockParts({ hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() }),
  }
}

/* ── Arithmetic ───────────────────────────────────────────────────────────── */

/**
 * `localDate` shifted by whole days.
 *
 * The result is re-validated, so a shift that walks off the end of the storable
 * range throws instead of producing `1501-01-01`. That boundary is real: it is
 * where the product stops accepting dates, and a silent value past it would be a
 * date nobody has agreed to hold.
 */
export function addLocalDays(localDate: LocalDate, days: number): LocalDate {
  return fromJalaliParts(jalaliPartsOf(dfAddDays(dateObjectOf(localDate), days)))
}

/**
 * `localDate` shifted by whole months.
 *
 * The library keeps the day-of-month and clamps where the target month is
 * shorter, so 31 فروردین plus one month is 31 اردیبهشت and 31 شهریور plus one
 * month is 30 مهر. Which day a month shift lands on is a product decision that a
 * library upgrade could quietly change, so it is asserted in the tests rather
 * than assumed.
 */
export function addLocalMonths(localDate: LocalDate, months: number): LocalDate {
  return fromJalaliParts(jalaliPartsOf(dfAddMonths(dateObjectOf(localDate), months)))
}

/** Whole calendar days from `earlier` to `later`. Negative when `later` precedes. */
export function diffLocalDays(later: LocalDate, earlier: LocalDate): number {
  return dfDifferenceInCalendarDays(dateObjectOf(later), dateObjectOf(earlier))
}

/* ── Comparison ───────────────────────────────────────────────────────────── */

/**
 * Orders two `LocalDate`s.
 *
 * A plain string comparison would be correct — `YYYY-MM-DD` sorts
 * lexicographically exactly as it sorts chronologically, zero-padded and
 * four-digit, and that is *why* the stored form is that string. The function
 * exists so callers do not have to know that, and so a future change of stored
 * form breaks one function instead of every `<` in the codebase.
 */
export function compareLocalDates(left: LocalDate, right: LocalDate): -1 | 0 | 1 {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export const isSameLocalDate = (left: LocalDate, right: LocalDate): boolean => left === right

/** `true` when `left` falls strictly before `right`. */
export const isBeforeLocalDate = (left: LocalDate, right: LocalDate): boolean => left < right

/** `true` when `left` falls strictly after `right`. */
export const isAfterLocalDate = (left: LocalDate, right: LocalDate): boolean => left > right

/** `true` when `localDate` falls in `[start, end]`, inclusive at both ends. */
export function isWithinLocalDates(
  localDate: LocalDate,
  start: LocalDate,
  end: LocalDate,
): boolean {
  return localDate >= start && localDate <= end
}

/**
 * Every day from `start` to `end`, inclusive.
 *
 * Returns an empty array when `start` is after `end` rather than throwing: a grid
 * scrolled past the end of a range should render nothing, and an exception there
 * would be a crash in the user's hands. Both ends are validated on entry, because
 * the list is built by walking forward from the first.
 */
export function localDateRange(start: LocalDate, end: LocalDate): LocalDate[] {
  if (isAfterLocalDate(start, end)) return []
  return dfEachDayOfInterval({ start: dateObjectOf(start), end: dateObjectOf(end) }).map((date) =>
    fromJalaliParts(jalaliPartsOf(date)),
  )
}

/* ── The week ─────────────────────────────────────────────────────────────── */

/**
 * The weekday of a `LocalDate`, numbered from **شنبه**.
 *
 * `Date.prototype.getDay()` numbers Sunday as 0 and the library's `getDay` passes
 * that through unchanged. `07-localization.md` §6.4 makes شنبه the first day of
 * the week, and this is the single conversion between the two conventions:
 * Saturday is 6 in JavaScript and 0 in the product, so every index shifts by one.
 * `(6 + 1) % 7` is `0`, `(0 + 1) % 7` is `1`, `(5 + 1) % 7` is `6`.
 *
 * Doing it here, once, is the point. A grid that writes `(getDay(d) + 1) % 7`
 * inline is a grid that will one day write `getDay(d)` and be off by a column —
 * §6.4: "A calendar that starts on Sunday is wrong even if every date on it is
 * correct."
 */
export function jalaliWeekday(localDate: LocalDate): WeekdayIndex {
  return ((dfGetDay(dateObjectOf(localDate)) + 1) % 7) as WeekdayIndex
}

/** The index of شنبه in the product's week, and the library's `weekStartsOn`. */
export const JALALI_WEEK_START = 6
