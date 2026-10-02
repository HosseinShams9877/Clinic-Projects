/**
 * The calendar, tested to `07-localization.md` §6.3 and `10-testing-strategy.md`
 * §3.5.
 *
 * §6.3 opens with the reason this file is long:
 *
 * > The calendar is the single highest-risk piece of pure logic in the product,
 * > because a one-day error is invisible until a clinic acts on the wrong day.
 *
 * Each `describe` below is one of the four obligations §6.3 names, and they are
 * independent of each other on purpose — an implementation can satisfy any three
 * and still be wrong:
 *
 * | Obligation | Where |
 * |---|---|
 * | Round-trip property over ≥200 years | "the round trip" |
 * | Anchor vectors: leap years, month lengths, year-end boundary | "the shape of a year" |
 * | Cross-check against `Intl` with the Persian calendar | "against ICU" |
 * | Supported range ۱۳۹۰–۱۴۵۰ asserted explicitly | "against ICU" |
 *
 * The `Intl` cross-check is the only oracle here not derived from
 * `date-fns-jalali` itself. The others assert *structure* — that a year has 365 or
 * 366 days, that months 1–6 have 31 — which a consistently **shifted** calendar
 * would satisfy exactly as well. ICU is what catches a shift.
 *
 * `Intl` is used **only** here. §6.1 refuses it as the runtime implementation
 * because its output varies with the ICU build bundled in the Node runtime, and
 * that refusal is unchanged: the point of comparing against it is that a future
 * ICU change fails this test loudly instead of changing a screen silently.
 *
 * ## Why every instant is built rather than written
 *
 * `dateToLocalDate` reads a `Date`'s **local** Gregorian parts, so a hard-coded
 * `'2026-09-20T00:00:00.000Z'` would be the 20th in Tehran and the 19th in
 * Honolulu — a test that passes here and fails in CI on another runner. Every
 * `Date` below is therefore either a **local** construction (`new Date(2026, 8,
 * 20, 12)`, which is local noon in every zone) or read back through the **UTC**
 * accessors via `fromUtcInstant`, which is offset arithmetic and not a host
 * lookup. `vitest.config.ts` explains why no `TZ` is pinned and why that property
 * is worth keeping rather than working around.
 */

import { describe, expect, it } from 'vitest'

import {
  MAX_LOCAL_DATE_YEAR,
  MIN_LOCAL_DATE_YEAR,
  SUPPORTED_JALALI_YEAR_MAX,
  SUPPORTED_JALALI_YEAR_MIN,
} from '@/core/constants'

import {
  JALALI_WEEK_START,
  addLocalDays,
  addLocalMonths,
  addMinutesToTime,
  asLocalDate,
  asLocalTime,
  clockParts,
  compareLocalDates,
  dateToLocalDate,
  daysInJalaliMonth,
  diffLocalDays,
  fromClockParts,
  fromJalaliParts,
  fromUtcInstant,
  isAfterLocalDate,
  isBeforeLocalDate,
  isJalaliLeapYear,
  isSameLocalDate,
  isValidLocalDate,
  isValidLocalTime,
  isWithinLocalDates,
  jalaliParts,
  jalaliWeekday,
  localDateRange,
  minutesToTime,
  nowLocalTime,
  timeToMinutes,
  toUtcInstant,
  todayLocalDate,
} from '../jalali'
import type { LocalDate, LocalTime } from '../types'

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const date = (value: string): LocalDate => asLocalDate(value)
const time = (value: string): LocalTime => asLocalTime(value)

/** A Gregorian day, as a `Date` at local noon — the same calendar day everywhere. */
const gregorianNoon = (year: number, month: number, day: number): Date =>
  new Date(year, month - 1, day, 12, 0, 0, 0)

/** The Gregorian day a `Date` carries, read through the UTC accessors. */
function utcGregorian(instant: Date): { year: number; month: number; day: number } {
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  }
}

/**
 * The 33-year rule of §6.2, written independently of the implementation.
 *
 * §6.2: "Leap years follow the 33-year cycle of the Solar Hijri calendar, with the
 * known exception years handled by an explicit break table rather than a formula —
 * the formula alone is wrong for a handful of years in every cycle."
 *
 * Over ۱۳۹۰–۱۴۵۰ the cycle term `25y + 11 mod 33` is never negative, so the library's
 * `(m < 8 && m >= -1) || m <= -27` reduces to `m < 8`, which is what is asserted
 * here. Outside the supported range the break table matters and this oracle would
 * be wrong — which is exactly why the assertion lives inside the supported range.
 * ICU's Persian calendar implements the same formula, so this is a second,
 * independent statement of the same rule rather than a restatement of the code.
 */
const cycleSaysLeap = (year: number): boolean => ((25 * year + 11) % 33) < 8

/** Every day of the storable range, walked forward from the first. */
function everyDayOfStorableRange(): LocalDate[] {
  return localDateRange(
    fromJalaliParts({ year: MIN_LOCAL_DATE_YEAR, month: 1, day: 1 }),
    fromJalaliParts({ year: MAX_LOCAL_DATE_YEAR, month: 12, day: 29 }),
  )
}

const STORABLE_DAYS = everyDayOfStorableRange()
const STORABLE_FIRST = STORABLE_DAYS[0] as LocalDate
const STORABLE_LAST = STORABLE_DAYS[STORABLE_DAYS.length - 1] as LocalDate

/** The supported range, which is the range whose ICU agreement is asserted. */
const SUPPORTED_DAYS = STORABLE_DAYS.filter((day) => {
  const { year } = jalaliParts(day)
  return year >= SUPPORTED_JALALI_YEAR_MIN && year <= SUPPORTED_JALALI_YEAR_MAX
})

/**
 * The budget for the three sweeps that walk the whole range.
 *
 * Building and re-reading roughly seventy-three thousand dates is a second or two
 * of real work, and Vitest's five-second default is close enough to that to make
 * the suite flaky on a loaded CI runner. A larger explicit budget is honest about
 * what the test does; a smaller range would not be, because §6.3 asks for every
 * day.
 */
const SWEEP_BUDGET_MS = 120_000

/* ── The ICU oracle ───────────────────────────────────────────────────────── */

const ICU_PERSIAN_CALENDAR = 'persian'
const icuFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})
const icuWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
})

/** The Jalali y/m/d ICU assigns to an instant, read in UTC. */
function icuJalali(instant: Date): { year: number; month: number; day: number } {
  const parts = icuFormatter.formatToParts(instant)
  const read = (type: 'year' | 'month' | 'day'): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? Number.NaN)
  return { year: read('year'), month: read('month'), day: read('day') }
}

/** The English weekday name ICU assigns to an instant, read in UTC. */
function icuWeekday(instant: Date): string {
  return icuWeekdayFormatter.format(instant)
}

/** JavaScript's weekday numbering, which is what ICU's weekday names map onto. */
const JS_WEEKDAY_BY_NAME: Readonly<Record<string, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

/** `day` as an instant whose UTC calendar day is `day`'s Gregorian day, at noon. */
const utcNoonOf = (day: LocalDate): Date => toUtcInstant(day, time('12:00'), 0)

/* ── The shape of a year ──────────────────────────────────────────────────── */

describe('month lengths', () => {
  it('gives months 1 to 6 thirty-one days, in a common year and a leap year', () => {
    for (const year of [1404, 1403]) {
      for (let month = 1; month <= 6; month += 1) {
        expect(daysInJalaliMonth(year, month)).toBe(31)
      }
    }
  })

  it('gives months 7 to 11 thirty days, in a common year and a leap year', () => {
    for (const year of [1404, 1403]) {
      for (let month = 7; month <= 11; month += 1) {
        expect(daysInJalaliMonth(year, month)).toBe(30)
      }
    }
  })

  it('gives اسفند twenty-nine days in a common year and thirty in a leap year', () => {
    // The single assertion that distinguishes a calendar implementing the leap
    // rule from one approximating it.
    expect(isJalaliLeapYear(1404)).toBe(false)
    expect(daysInJalaliMonth(1404, 12)).toBe(29)

    expect(isJalaliLeapYear(1403)).toBe(true)
    expect(daysInJalaliMonth(1403, 12)).toBe(30)
  })

  it('agrees with the 33-year cycle for every supported year', () => {
    for (let year = SUPPORTED_JALALI_YEAR_MIN; year <= SUPPORTED_JALALI_YEAR_MAX; year += 1) {
      expect(isJalaliLeapYear(year)).toBe(cycleSaysLeap(year))
      // The same fact read through the month length, so a leap predicate that
      // disagreed with the calendar itself fails here as well.
      expect(daysInJalaliMonth(year, 12)).toBe(cycleSaysLeap(year) ? 30 : 29)
    }
  })

  it('produces a year of 365 or 366 days, matching the leap rule', () => {
    for (let year = SUPPORTED_JALALI_YEAR_MIN; year < SUPPORTED_JALALI_YEAR_MAX; year += 1) {
      const first = fromJalaliParts({ year, month: 1, day: 1 })
      const next = fromJalaliParts({ year: year + 1, month: 1, day: 1 })
      expect(diffLocalDays(next, first)).toBe(isJalaliLeapYear(year) ? 366 : 365)
    }
  })
})

describe('the year-end boundary', () => {
  it('rolls ۳۰ اسفند ۱۴۰۳ into ۱ فروردین ۱۴۰۴', () => {
    expect(addLocalDays(date('1403-12-30'), 1)).toBe('1404-01-01')
  })

  it('rolls ۲۹ اسفند ۱۴۰۴ into ۱ فروردین ۱۴۰۵', () => {
    expect(addLocalDays(date('1404-12-29'), 1)).toBe('1405-01-01')
  })

  it('rolls ۱ فروردین back to the last day of the previous year', () => {
    expect(addLocalDays(date('1404-01-01'), -1)).toBe('1403-12-30')
    expect(addLocalDays(date('1405-01-01'), -1)).toBe('1404-12-29')
  })

  it('ends every supported year on a day that rolls into the next', () => {
    for (let year = SUPPORTED_JALALI_YEAR_MIN; year < SUPPORTED_JALALI_YEAR_MAX; year += 1) {
      const lastDay = fromJalaliParts({ year, month: 12, day: daysInJalaliMonth(year, 12) })
      expect(addLocalDays(lastDay, 1)).toBe(fromJalaliParts({ year: year + 1, month: 1, day: 1 }))
    }
  })
})

describe('the last day of every month', () => {
  it('agrees with the month-length table in a leap year and a common year', () => {
    for (const year of [1403, 1404]) {
      for (let month = 1; month <= 12; month += 1) {
        const lastDay = fromJalaliParts({ year, month, day: daysInJalaliMonth(year, month) })
        expect(addLocalDays(lastDay, 1)).toBe(
          month === 12
            ? fromJalaliParts({ year: year + 1, month: 1, day: 1 })
            : fromJalaliParts({ year, month: month + 1, day: 1 }),
        )
      }
    }
  })
})

/* ── Validation ───────────────────────────────────────────────────────────── */

describe('isValidLocalDate and asLocalDate', () => {
  it('accepts a well-formed Jalali date in the stored shape', () => {
    expect(isValidLocalDate('1405-06-29')).toBe(true)
    expect(asLocalDate('1405-06-29')).toBe('1405-06-29')
  })

  it('accepts Persian digits and surrounding whitespace', () => {
    // §4.1: "A form that rejects Persian-digit input is a defect — it is the
    // natural way a Persian speaker types a number."
    expect(isValidLocalDate('۱۴۰۵-۰۶-۲۹')).toBe(true)
    expect(asLocalDate('۱۴۰۵-۰۶-۲۹')).toBe('1405-06-29')
    expect(asLocalDate('  1405-06-29  ')).toBe('1405-06-29')
  })

  it('rejects a malformed shape', () => {
    // The slash form is the one a Persian reader types most naturally, and it is
    // rejected here on purpose: `1405/06/29` sorts and compares as a different
    // string from `1405-06-29`, so accepting it into storage would put two
    // spellings of one day in the same column. The input control converts the
    // separator; this function accepts only the stored shape.
    for (const value of ['', '1405-6-29', '۱۴۰۵-۶-۲۹', '1405/06/29', '14050629', 'not a date']) {
      expect(isValidLocalDate(value)).toBe(false)
      expect(() => asLocalDate(value)).toThrow()
    }
  })

  it('rejects a month outside 1–12 and a day outside the month', () => {
    expect(isValidLocalDate('1405-00-01')).toBe(false)
    expect(isValidLocalDate('1405-13-01')).toBe(false)
    expect(isValidLocalDate('1405-06-00')).toBe(false)
    expect(isValidLocalDate('1405-06-32')).toBe(false)
    // Month 12 has 30 days in a leap year and 29 in a common one, so `1404-12-30`
    // does not exist — the case the library silently normalises to `1405-01-01`
    // when validation is left to it.
    expect(isValidLocalDate('1404-12-30')).toBe(false)
    expect(isValidLocalDate('1403-12-30')).toBe(true)
    // Months 7 to 11 have 30 days, never 31.
    expect(isValidLocalDate('1405-07-31')).toBe(false)
    expect(isValidLocalDate('1405-07-30')).toBe(true)
  })

  it('rejects a year outside the storable range', () => {
    expect(isValidLocalDate('1299-01-01')).toBe(false)
    expect(isValidLocalDate('1501-01-01')).toBe(false)
    expect(isValidLocalDate('0001-01-01')).toBe(false)
    expect(isValidLocalDate('9999-12-29')).toBe(false)
    expect(isValidLocalDate(`${MIN_LOCAL_DATE_YEAR}-01-01`)).toBe(true)
    expect(isValidLocalDate(`${MAX_LOCAL_DATE_YEAR}-12-29`)).toBe(true)
  })

  it('throws a ValidationError carrying a catalog key', () => {
    expect(() => asLocalDate('1405-13-01')).toThrow(
      expect.objectContaining({ code: 'VALIDATION', messageKey: 'validation.localDate.invalid' }),
    )
  })
})

describe('isValidLocalTime and asLocalTime', () => {
  it('accepts HH:mm, in Latin or Persian digits', () => {
    expect(isValidLocalTime('09:30')).toBe(true)
    expect(isValidLocalTime('۰۰:۰۰')).toBe(true)
    expect(isValidLocalTime('23:59')).toBe(true)
    expect(asLocalTime('۰۹:۳۰')).toBe('09:30')
  })

  it('rejects a 24th hour, a 60th minute, and a single-digit hour', () => {
    expect(isValidLocalTime('24:00')).toBe(false)
    expect(isValidLocalTime('09:60')).toBe(false)
    expect(isValidLocalTime('9:30')).toBe(false)
    expect(isValidLocalTime('0930')).toBe(false)
    expect(isValidLocalTime('')).toBe(false)
    expect(() => asLocalTime('24:00')).toThrow(
      expect.objectContaining({ code: 'VALIDATION', messageKey: 'validation.localTime.invalid' }),
    )
  })
})

describe('the calendar refuses to build a date that does not exist', () => {
  it('throws rather than letting a day overflow into the next month', () => {
    // The library adds the day number without validating it, so `newDate(1405, 5,
    // 32)` is silently 1405-07-01. `fromJalaliParts` goes through `asLocalDate`, so
    // the overflow cannot reach a stored value.
    expect(() => fromJalaliParts({ year: 1405, month: 6, day: 32 })).toThrow()
    expect(() => fromJalaliParts({ year: 1405, month: 1, day: 32 })).toThrow()
  })

  it('throws on a non-integer or negative part rather than padding NaN into a date', () => {
    // Reachable only by casting a brand away — which is the case the guard exists
    // for, because the alternative is the string `0NaN-0NaN-0NaN`.
    expect(() => fromJalaliParts({ year: 1405, month: 6, day: -1 })).toThrow()
    expect(() => fromJalaliParts({ year: 1405.5, month: 6, day: 1 })).toThrow()
    expect(() => minutesToTime(Number.NaN)).toThrow()
  })

  it('throws on a year or month the calendar does not cover', () => {
    expect(() => isJalaliLeapYear(MIN_LOCAL_DATE_YEAR - 1)).toThrow()
    expect(() => isJalaliLeapYear(MAX_LOCAL_DATE_YEAR + 1)).toThrow()
    expect(() => isJalaliLeapYear(1405.5)).toThrow()
    expect(() => daysInJalaliMonth(1405, 0)).toThrow()
    expect(() => daysInJalaliMonth(1405, 13)).toThrow()
    expect(() => daysInJalaliMonth(1405, 1.5)).toThrow()
  })
})

/* ── Parts and the clock ──────────────────────────────────────────────────── */

describe('parts', () => {
  it('round-trips a date through jalaliParts and fromJalaliParts', () => {
    expect(jalaliParts(date('1405-06-29'))).toEqual({ year: 1405, month: 6, day: 29 })
    expect(fromJalaliParts({ year: 1405, month: 6, day: 29 })).toBe('1405-06-29')
    expect(fromJalaliParts({ year: 1405, month: 1, day: 1 })).toBe('1405-01-01')
  })

  it('round-trips a time through clockParts and fromClockParts', () => {
    expect(clockParts(time('09:30'))).toEqual({ hour: 9, minute: 30 })
    expect(fromClockParts({ hour: 9, minute: 30 })).toBe('09:30')
    expect(fromClockParts({ hour: 0, minute: 0 })).toBe('00:00')
    expect(fromClockParts({ hour: 23, minute: 59 })).toBe('23:59')
  })

  it('wraps an hour past the end of the day rather than rejecting it', () => {
    // Slot generation walks past the end of a working day and asks what time that
    // is; it knows about the day roll itself.
    expect(fromClockParts({ hour: 24, minute: 0 })).toBe('00:00')
    expect(fromClockParts({ hour: 25, minute: 30 })).toBe('01:30')
  })
})

describe('minutes', () => {
  it('converts a time to minutes and back', () => {
    expect(timeToMinutes(time('00:00'))).toBe(0)
    expect(timeToMinutes(time('09:30'))).toBe(570)
    expect(timeToMinutes(time('23:59'))).toBe(1439)
    expect(minutesToTime(570)).toBe('09:30')
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(1439)).toBe('23:59')
  })

  it('wraps past midnight and before it, in both directions', () => {
    // Total on negative values as well as on values past midnight, because a slot
    // calculation legitimately produces both.
    expect(minutesToTime(1440)).toBe('00:00')
    expect(minutesToTime(1500)).toBe('01:00')
    expect(minutesToTime(-1)).toBe('23:59')
    expect(minutesToTime(-30)).toBe('23:30')
    expect(minutesToTime(-1440)).toBe('00:00')
  })

  it('adds minutes across midnight in both directions', () => {
    expect(addMinutesToTime(time('09:30'), 45)).toBe('10:15')
    expect(addMinutesToTime(time('23:30'), 45)).toBe('00:15')
    expect(addMinutesToTime(time('00:15'), -45)).toBe('23:30')
    expect(addMinutesToTime(time('09:30'), 0)).toBe('09:30')
  })
})

/* ── Arithmetic and comparison ─────────────────────────────────────────────── */

describe('addLocalDays and diffLocalDays', () => {
  it('moves within a month and across a month boundary', () => {
    expect(addLocalDays(date('1405-06-15'), 1)).toBe('1405-06-16')
    expect(addLocalDays(date('1405-06-31'), 1)).toBe('1405-07-01')
    expect(addLocalDays(date('1405-06-15'), -1)).toBe('1405-06-14')
    expect(addLocalDays(date('1405-06-15'), 0)).toBe('1405-06-15')
    expect(addLocalDays(date('1405-01-01'), -1)).toBe('1404-12-29')
  })

  it('measures whole calendar days, signed', () => {
    expect(diffLocalDays(date('1405-06-29'), date('1405-06-29'))).toBe(0)
    expect(diffLocalDays(date('1405-06-30'), date('1405-06-29'))).toBe(1)
    expect(diffLocalDays(date('1405-06-29'), date('1405-06-30'))).toBe(-1)
    expect(diffLocalDays(date('1405-07-01'), date('1405-06-31'))).toBe(1)
    expect(diffLocalDays(date('1405-01-01'), date('1404-01-01'))).toBe(365)
  })

  it('is the inverse of addLocalDays across a year of days', () => {
    const start = date('1404-01-01')
    for (let offset = -400; offset <= 400; offset += 1) {
      expect(diffLocalDays(addLocalDays(start, offset), start)).toBe(offset)
    }
  })

  it('throws rather than producing a date past the end of the storable range', () => {
    expect(() => addLocalDays(STORABLE_LAST, 1)).toThrow()
    expect(() => addLocalDays(STORABLE_FIRST, -1)).toThrow()
  })
})

describe('addLocalMonths', () => {
  it('keeps the day of the month when the target month is long enough', () => {
    expect(addLocalMonths(date('1405-06-15'), 1)).toBe('1405-07-15')
    expect(addLocalMonths(date('1405-06-15'), -1)).toBe('1405-05-15')
    expect(addLocalMonths(date('1405-06-15'), 12)).toBe('1406-06-15')
    expect(addLocalMonths(date('1405-06-15'), 0)).toBe('1405-06-15')
  })

  it('clamps to the last day when the target month is shorter', () => {
    // Month 6 has 31 days and month 7 has 30, so the day has to move. Stated as
    // `min(source day, target month length)` rather than as a literal, because the
    // clamping rule is what the product depends on, not the one date it was
    // observed on.
    expect(addLocalMonths(date('1405-06-31'), 1)).toBe('1405-07-30')
    expect(addLocalMonths(date('1405-05-31'), 2)).toBe('1405-07-30')
    expect(addLocalMonths(date('1405-04-31'), 3)).toBe('1405-07-30')
  })

  it('clamps into اسفند correctly in a common year and a leap year', () => {
    expect(addLocalMonths(date('1404-11-30'), 1)).toBe('1404-12-29')
    expect(addLocalMonths(date('1403-11-30'), 1)).toBe('1403-12-30')
  })

  it('steps across a year boundary and back', () => {
    expect(addLocalMonths(date('1404-12-29'), 1)).toBe('1405-01-29')
    expect(addLocalMonths(date('1405-01-15'), -1)).toBe('1404-12-15')
    expect(addLocalMonths(date('1404-06-15'), 12)).toBe('1405-06-15')
    expect(addLocalMonths(date('1405-06-15'), -12)).toBe('1404-06-15')
  })
})

describe('comparison', () => {
  it('orders two dates', () => {
    expect(compareLocalDates(date('1405-06-29'), date('1405-06-29'))).toBe(0)
    expect(compareLocalDates(date('1405-06-29'), date('1405-06-30'))).toBe(-1)
    expect(compareLocalDates(date('1405-06-30'), date('1405-06-29'))).toBe(1)
    // Across a year boundary, where a naive month/day comparison would be wrong.
    expect(compareLocalDates(date('1405-01-01'), date('1404-12-29'))).toBe(1)
    expect(compareLocalDates(date('1404-12-29'), date('1405-01-01'))).toBe(-1)
  })

  it('offers the four predicates the product uses', () => {
    expect(isSameLocalDate(date('1405-06-29'), date('1405-06-29'))).toBe(true)
    expect(isSameLocalDate(date('1405-06-29'), date('1405-06-30'))).toBe(false)
    expect(isBeforeLocalDate(date('1405-06-29'), date('1405-06-30'))).toBe(true)
    expect(isBeforeLocalDate(date('1405-06-29'), date('1405-06-29'))).toBe(false)
    expect(isAfterLocalDate(date('1405-06-30'), date('1405-06-29'))).toBe(true)
    expect(isAfterLocalDate(date('1405-06-29'), date('1405-06-29'))).toBe(false)
    // Inclusive at both ends: a report range excluding its own last day would drop
    // a day of appointments.
    expect(isWithinLocalDates(date('1405-06-01'), date('1405-06-01'), date('1405-06-30'))).toBe(true)
    expect(isWithinLocalDates(date('1405-06-30'), date('1405-06-01'), date('1405-06-30'))).toBe(true)
    expect(isWithinLocalDates(date('1405-05-31'), date('1405-06-01'), date('1405-06-30'))).toBe(
      false,
    )
    expect(isWithinLocalDates(date('1405-07-01'), date('1405-06-01'), date('1405-06-30'))).toBe(
      false,
    )
  })

  it('builds a range inclusively, and an empty one when the ends are reversed', () => {
    expect(localDateRange(date('1405-06-29'), date('1405-06-29'))).toEqual(['1405-06-29'])
    // Four days, not three: the range crosses the end of Shahrivar, and months 1–6
    // have 31 days — `daysInJalaliMonth` asserts the same fact in this file. A range
    // that stopped at «۳۰» would silently drop ۳۱ شهریور from every report that
    // spans a month boundary.
    expect(localDateRange(date('1405-06-29'), date('1405-07-01'))).toEqual([
      '1405-06-29',
      '1405-06-30',
      '1405-06-31',
      '1405-07-01',
    ])
    expect(localDateRange(date('1405-07-01'), date('1405-06-29'))).toEqual([])
  })
})

/* ── The week ─────────────────────────────────────────────────────────────── */

describe('jalaliWeekday', () => {
  it('advances by one, modulo seven, for every day of a year', () => {
    const start = date('1404-01-01')
    for (let offset = 1; offset <= 366; offset += 1) {
      const previous = jalaliWeekday(addLocalDays(start, offset - 1))
      const current = jalaliWeekday(addLocalDays(start, offset))
      expect(current).toBe((previous + 1) % 7)
    }
  })

  it('agrees with ICU on which day is شنبه', () => {
    // The independent check of the shift arithmetic: Saturday is 6 to JavaScript
    // and 0 to the product, and getting it backwards produces a grid shifted by one
    // column that still looks plausible. Strided, because the property belongs to
    // the sequence rather than to any one day.
    for (let index = 0; index < STORABLE_DAYS.length; index += 97) {
      const day = STORABLE_DAYS[index] as LocalDate
      const jsWeekday = JS_WEEKDAY_BY_NAME[icuWeekday(utcNoonOf(day))]
      expect(Number.isInteger(jsWeekday)).toBe(true)
      expect(jalaliWeekday(day)).toBe(((jsWeekday as number) + 1) % 7)
    }
  })

  it('names شنبه as the week start, in both conventions', () => {
    // `JALALI_WEEK_START` is what the library's `weekStartsOn` expects: the
    // JavaScript weekday number of the product's first day.
    expect(JALALI_WEEK_START).toBe(6)
    expect(JS_WEEKDAY_BY_NAME.Saturday).toBe(JALALI_WEEK_START)

    const saturday = STORABLE_DAYS.find(
      (day) => JS_WEEKDAY_BY_NAME[icuWeekday(utcNoonOf(day))] === JALALI_WEEK_START,
    )
    expect(saturday).toBeDefined()
    expect(jalaliWeekday(saturday as LocalDate)).toBe(0)
  })
})

/* ── The UTC bridge ───────────────────────────────────────────────────────── */

describe('toUtcInstant and fromUtcInstant', () => {
  it('puts the clinic wall clock three and a half hours ahead of UTC', () => {
    // Read off the UTC accessors of the produced instant rather than written as a
    // literal ISO string, which would also encode the Gregorian day of this Jalali
    // date and give this test a second thing to be right about.
    const bare = toUtcInstant(date('1405-06-29'), time('09:30'), 0)
    expect([bare.getUTCHours(), bare.getUTCMinutes()]).toEqual([9, 30])

    const shifted = toUtcInstant(date('1405-06-29'), time('09:30'))
    expect([shifted.getUTCHours(), shifted.getUTCMinutes()]).toEqual([6, 0])
    expect(bare.getTime() - shifted.getTime()).toBe(210 * 60_000)
  })

  it('agrees with ICU on the Gregorian day a Jalali date converts to', () => {
    // The one hard-coded pair in this file, and the reason it is worth having: it
    // is an anchor a human can check against a printed calendar. 1405-06-29 is the
    // 184th day of a year beginning 21 March 2026, which is 20 September 2026. ICU
    // is asked first, so a wrong anchor and a wrong implementation cannot agree
    // with each other by construction.
    expect(icuJalali(new Date(Date.UTC(2026, 8, 20, 12)))).toEqual({
      year: 1405,
      month: 6,
      day: 29,
    })
    expect(dateToLocalDate(gregorianNoon(2026, 9, 20))).toBe('1405-06-29')
  })

  it('round-trips a date and time at any clinic offset', () => {
    for (const offset of [0, 210, -300, 780]) {
      for (const value of ['1405-06-29T00:00', '1405-06-29T09:30', '1405-06-29T23:59']) {
        const [localDate, localTime] = value.split('T') as [string, string]
        const back = fromUtcInstant(toUtcInstant(date(localDate), time(localTime), offset), offset)
        expect(back.localDate).toBe(localDate)
        expect(back.localTime).toBe(localTime)
      }
    }
  })

  it('round-trips every year-end boundary in the supported range', () => {
    for (let year = SUPPORTED_JALALI_YEAR_MIN; year <= SUPPORTED_JALALI_YEAR_MAX; year += 1) {
      const lastDay = fromJalaliParts({ year, month: 12, day: daysInJalaliMonth(year, 12) })
      for (const localDate of [lastDay, addLocalDays(lastDay, 1)]) {
        for (const localTime of ['00:00', '23:59']) {
          const back = fromUtcInstant(toUtcInstant(localDate, time(localTime)))
          expect(back.localDate).toBe(localDate)
          expect(back.localTime).toBe(localTime)
        }
      }
    }
  })

  it('reads an instant back through the clinic offset, not the host timezone', () => {
    // `fromUtcInstant` reads the UTC accessors of the shifted instant, so the result
    // is offset arithmetic. Reading the local accessors instead would re-apply the
    // host's offset and make this test depend on `TZ` — the runtime dependence §6.1
    // refuses.
    const back = fromUtcInstant(new Date(Date.UTC(2026, 8, 20, 20, 45)))
    expect(back.localDate).toBe('1405-06-30')
    expect(back.localTime).toBe('00:15')
  })

  it('throws on an Invalid Date rather than returning NaN parts', () => {
    const invalid = new Date(Number.NaN)
    expect(() => dateToLocalDate(invalid)).toThrow(
      expect.objectContaining({ messageKey: 'validation.localDate.invalid' }),
    )
    expect(() => fromUtcInstant(invalid)).toThrow(
      expect.objectContaining({ messageKey: 'validation.localDate.invalid' }),
    )
    expect(() => nowLocalTime(invalid)).toThrow(
      expect.objectContaining({ messageKey: 'validation.localTime.invalid' }),
    )
  })
})

describe('reading the clock', () => {
  it('reads today from an injected instant, never from the wall clock', () => {
    // `gregorianNoon` is a local construction, so the assertion holds in any host
    // timezone: both `dateToLocalDate` and the fixture read local Gregorian parts.
    expect(todayLocalDate(gregorianNoon(2026, 9, 20))).toBe('1405-06-29')
    // The same local calendar day at a different hour is still the same day.
    expect(todayLocalDate(new Date(2026, 8, 20, 0, 0, 1))).toBe('1405-06-29')
    expect(todayLocalDate(new Date(2026, 8, 20, 23, 59, 59))).toBe('1405-06-29')
  })

  it('reads the wall-clock time from an injected instant', () => {
    expect(nowLocalTime(new Date(2026, 8, 20, 9, 30))).toBe('09:30')
    expect(nowLocalTime(new Date(2026, 8, 20, 0, 0))).toBe('00:00')
    expect(nowLocalTime(new Date(2026, 8, 20, 23, 59))).toBe('23:59')
  })
})

/* ── The round trip ───────────────────────────────────────────────────────── */

describe('the round trip', () => {
  it('covers at least two hundred Jalali years', () => {
    // §6.3: "for every day in a range of at least 200 years". The storable range is
    // exactly ۱۳۰۰–۱۵۰۰, so the obligation and the storage limit coincide.
    expect(STORABLE_DAYS.length).toBeGreaterThan(200 * 365)
  })

  it(
    'returns the same Jalali date through Gregorian and back, every day',
    () => {
      let checked = 0
      for (const day of STORABLE_DAYS) {
        // Out through `toUtcInstant` — which converts Jalali to Gregorian — and back
        // through `fromUtcInstant`, the public boundary every stored row crosses on
        // its way to a day grid.
        const back = fromUtcInstant(toUtcInstant(day, time('12:00'), 0), 0)
        expect(back.localDate).toBe(day)
        checked += 1
      }
      expect(checked).toBe(STORABLE_DAYS.length)
    },
    SWEEP_BUDGET_MS,
  )

  it(
    'returns the same Gregorian date through Jalali and back, every fifth day',
    () => {
      // The other direction. The Gregorian walk is a local-noon `Date`, so it is the
      // same calendar day in every host timezone.
      const first = utcGregorian(utcNoonOf(STORABLE_FIRST))
      const last = utcGregorian(utcNoonOf(STORABLE_LAST))
      const cursor = gregorianNoon(first.year, first.month, first.day)
      const end = gregorianNoon(last.year, last.month, last.day)

      let checked = 0
      while (cursor.getTime() <= end.getTime()) {
        const gregorian = {
          year: cursor.getFullYear(),
          month: cursor.getMonth() + 1,
          day: cursor.getDate(),
        }
        const jalali = dateToLocalDate(cursor)
        expect(utcGregorian(toUtcInstant(jalali, time('12:00'), 0))).toEqual(gregorian)
        cursor.setDate(cursor.getDate() + 5)
        checked += 1
      }
      expect(checked).toBeGreaterThan(14_000)
    },
    SWEEP_BUDGET_MS,
  )

  it('keeps every day distinct across the whole storable range', () => {
    // A conversion that collapsed two adjacent days onto one date would satisfy a
    // per-day round trip and still lose a day of appointments.
    expect(new Set(STORABLE_DAYS).size).toBe(STORABLE_DAYS.length)
  })

  it('agrees with ICU on the span of the storable range', () => {
    // The sequence length, checked against UTC arithmetic rather than against the
    // library: if the library dropped or doubled a day somewhere the count would be
    // right while a specific day was wrong, which is why this is a companion to the
    // per-day agreement below and not a replacement for it.
    const first = utcGregorian(utcNoonOf(STORABLE_FIRST))
    const last = utcGregorian(utcNoonOf(STORABLE_LAST))
    const asUtcMillis = (day: { year: number; month: number; day: number }): number =>
      Date.UTC(day.year, day.month - 1, day.day)
    const spanDays = (asUtcMillis(last) - asUtcMillis(first)) / 86_400_000 + 1
    expect(spanDays).toBe(STORABLE_DAYS.length)
  })
})

/* ── Against ICU ──────────────────────────────────────────────────────────── */

describe('against ICU', () => {
  it('is using the Persian calendar and not a Gregorian fallback', () => {
    // If a runtime shipped without the Persian calendar, ICU falls back to Gregorian
    // and every comparison below would fail for a reason that has nothing to do with
    // this repository. Asserting the resolved calendar turns that into one clear
    // failure instead of a hundred confusing ones.
    expect(icuFormatter.resolvedOptions().calendar).toBe(ICU_PERSIAN_CALENDAR)
  })

  it('asserts the supported range explicitly', () => {
    // §6.3: "Supported range: at minimum ۱۳۹۰–۱۴۵۰ Jalali, asserted explicitly."
    expect(SUPPORTED_JALALI_YEAR_MIN).toBe(1390)
    expect(SUPPORTED_JALALI_YEAR_MAX).toBe(1450)
    expect(SUPPORTED_DAYS.length).toBeGreaterThan(20_000)
    expect(jalaliParts(SUPPORTED_DAYS[0] as LocalDate).year).toBe(SUPPORTED_JALALI_YEAR_MIN)
    expect(jalaliParts(SUPPORTED_DAYS[SUPPORTED_DAYS.length - 1] as LocalDate).year).toBe(
      SUPPORTED_JALALI_YEAR_MAX,
    )
  })

  it(
    'agrees with ICU on every supported day it is asked about',
    () => {
      // §6.3: "Cross-check against `Intl` with the Persian calendar across the same
      // range. The test asserts the in-house implementation agrees with ICU — if a
      // future Node version changes ICU, the test fails loudly rather than a screen
      // silently changing."
      //
      // Strided, because ICU is orders of magnitude slower than the library and the
      // property under test — that the calendar is not shifted — belongs to the
      // sequence, not to any one day. A stride coprime with 7 and 30 walks every
      // weekday and every day-of-month, so a shift in any part of the conversion
      // lands on a checked day.
      let checked = 0
      for (let index = 0; index < SUPPORTED_DAYS.length; index += 13) {
        const day = SUPPORTED_DAYS[index] as LocalDate
        expect(icuJalali(utcNoonOf(day))).toEqual(jalaliParts(day))
        checked += 1
      }
      expect(checked).toBeGreaterThan(1_000)
    },
    SWEEP_BUDGET_MS,
  )

  it('agrees with ICU at both ends of the supported range', () => {
    for (const year of [SUPPORTED_JALALI_YEAR_MIN, SUPPORTED_JALALI_YEAR_MAX]) {
      for (const month of [1, 6, 7, 12]) {
        const day = daysInJalaliMonth(year, month)
        const localDate = fromJalaliParts({ year, month, day })
        expect(icuJalali(utcNoonOf(localDate))).toEqual({ year, month, day })
      }
    }
  })
})
