/**
 * The week, the month, and the ranges between them.
 *
 * `01-tech-stack.md` §8.6 assigns this file one thing: "The week starting on
 * **شنبه**". `07-localization.md` §6.4 explains why that is a file and not a
 * setting:
 *
 * > **The week starting on Saturday is a behavioural requirement, not a
 * > formatting one.** It governs slot generation, the "this week" report ranges,
 * > working-hours configuration, and the appointment grid's column order. A
 * > calendar that starts on Sunday is wrong even if every date on it is correct.
 *
 * Four different features consume the same week, so the week is computed once.
 * A module that needs "the seven days containing this date" calls
 * `jalaliWeek`; it does not subtract the weekday itself, because the day it
 * would subtract is a JavaScript weekday (`getDay`, Sunday = 0) and the day it
 * means is a product weekday (شنبه = 0). That mismatch has exactly one
 * conversion in the codebase — `jalaliWeekday` in `jalali.ts` — and this file is
 * its only caller together with the grids below.
 *
 * ## What is deliberately absent
 *
 * **There is no `isWeekend`.** It is tempting: the Iranian weekend is Friday, so
 * `jalaliWeekday(date) === 6` looks like the answer. It is not. The clinic's
 * closed days are **configuration**, not calendar fact — `06-constants.md` §4
 * gives the tenant a working-hours setting and the behavioural toggle «اجازه
 * رزرو در روزهای تعطیل», described as "for clinics running exceptional shifts".
 * A clinic that works Fridays, and a clinic that closes Thursdays, are both real.
 * A hard-coded weekend would silently disagree with the setting the manager
 * actually filled in — and the disagreement would surface as an appointment the
 * grid refuses to place. Closed days come from the tenant's working hours.
 *
 * **There is no holiday table.** Nowruz, and the religious and national holidays
 * that move every year, are not in the specification's data model. They are a
 * future module, not a constant to guess at now.
 */

import {
  addLocalDays,
  daysInJalaliMonth,
  fromJalaliParts,
  isWithinLocalDates,
  jalaliParts,
  jalaliWeekday,
  localDateRange,
} from './jalali'
import type { LocalDate } from './types'
import { DAYS_IN_WEEK, WEEKDAY_INDEXES, type WeekdayIndex } from './types'

/* ── The week ─────────────────────────────────────────────────────────────── */

/**
 * The شنبه that begins the week containing `localDate`.
 *
 * The subtraction is against `jalaliWeekday`, which already numbers شنبه as 0 —
 * so a date that *is* شنبه moves nowhere, which is the property that makes this
 * function idempotent and therefore safe to call on a value that may already be a
 * week start.
 */
export function startOfJalaliWeek(localDate: LocalDate): LocalDate {
  return addLocalDays(localDate, -jalaliWeekday(localDate))
}

/** The جمعه that ends the week containing `localDate`. */
export function endOfJalaliWeek(localDate: LocalDate): LocalDate {
  return addLocalDays(startOfJalaliWeek(localDate), DAYS_IN_WEEK - 1)
}

/**
 * The seven days of the week containing `localDate`, شنبه first.
 *
 * The appointment grid's columns and the "this week" report range both come from
 * here, so they cannot disagree about where the week starts.
 */
export function jalaliWeek(localDate: LocalDate): LocalDate[] {
  return localDateRange(startOfJalaliWeek(localDate), endOfJalaliWeek(localDate))
}

/** The `WeekdayIndex` of `localDate` within the displayed week, شنبه = 0. */
export function weekColumnOf(localDate: LocalDate): WeekdayIndex {
  return jalaliWeekday(localDate)
}

/** The seven weekday indexes in display order, شنبه first. */
export function weekColumns(): readonly WeekdayIndex[] {
  return WEEKDAY_INDEXES
}

/* ── The month ────────────────────────────────────────────────────────────── */

/** The first day of the month containing `localDate`. */
export function startOfJalaliMonth(localDate: LocalDate): LocalDate {
  const { year, month } = jalaliParts(localDate)
  return fromJalaliParts({ year, month, day: 1 })
}

/**
 * The last day of the month containing `localDate`.
 *
 * Asks `daysInJalaliMonth` rather than writing `31, 31, …, 30, 29`. The month
 * length is a calendar fact with one implementation, in `jalali.ts`, delegated to
 * the library so the leap rule is never hand-copied.
 */
export function endOfJalaliMonth(localDate: LocalDate): LocalDate {
  const { year, month } = jalaliParts(localDate)
  return fromJalaliParts({ year, month, day: daysInJalaliMonth(year, month) })
}

/** Every day of the month containing `localDate`. */
export function jalaliMonth(localDate: LocalDate): LocalDate[] {
  return localDateRange(startOfJalaliMonth(localDate), endOfJalaliMonth(localDate))
}

/** `true` when both dates fall in the same Jalali year and month. */
export function isSameJalaliMonth(left: LocalDate, right: LocalDate): boolean {
  const a = jalaliParts(left)
  const b = jalaliParts(right)
  return a.year === b.year && a.month === b.month
}

/**
 * The month laid out as a calendar page: full weeks of seven days, شنبه first.
 *
 * Each row is a week. The first and last rows are **padded with the neighbouring
 * month's real dates** rather than with blanks — the grid is always exactly seven
 * columns wide and every cell is a date the product can hold and render. A cell
 * outside the displayed month is detected with `isSameJalaliMonth(cell, anyDay)`,
 * which is what a grid needs in order to dim it; the alternative, padding with
 * `null`, pushes a null check into every cell renderer and gains nothing.
 *
 * The result is four to six rows, never more: the longest month is 31 days and
 * the shortest is 29, and a 29-day month beginning on شنبه with five full weeks
 * still fits.
 */
export function jalaliMonthGrid(localDate: LocalDate): LocalDate[][] {
  const days = localDateRange(
    startOfJalaliWeek(startOfJalaliMonth(localDate)),
    endOfJalaliWeek(endOfJalaliMonth(localDate)),
  )
  const weeks: LocalDate[][] = []
  for (let index = 0; index < days.length; index += DAYS_IN_WEEK) {
    weeks.push(days.slice(index, index + DAYS_IN_WEEK))
  }
  return weeks
}

/* ── Ranges ───────────────────────────────────────────────────────────────── */

/**
 * The first and last day of a Jalali month.
 *
 * A report asks for a month by number, not by a date inside it, so this is the
 * entry point that does not require inventing one. The bounds are validated by
 * `daysInJalaliMonth` and `fromJalaliParts`, so a thirteenth month throws rather
 * than producing a range that contains nothing.
 */
export function jalaliMonthRange(year: number, month: number): { start: LocalDate; end: LocalDate } {
  return {
    start: fromJalaliParts({ year, month, day: 1 }),
    end: fromJalaliParts({ year, month, day: daysInJalaliMonth(year, month) }),
  }
}

/** The first and last day of a Jalali year. Always 1 فروردین to 29/30 اسفند. */
export function jalaliYearRange(year: number): { start: LocalDate; end: LocalDate } {
  return {
    start: fromJalaliParts({ year, month: 1, day: 1 }),
    end: fromJalaliParts({ year, month: 12, day: daysInJalaliMonth(year, 12) }),
  }
}

/**
 * The `count` months ending with the one containing `localDate`, oldest first.
 *
 * `monthWindow(date, 6)` is what a six-month trend chart is drawn from. Months
 * are stepped by constructing the first of each month rather than by adding 30
 * days, so the window has exactly `count` entries whatever the month lengths are.
 */
export function jalaliMonthWindow(
  localDate: LocalDate,
  count: number,
): { year: number; month: number; start: LocalDate; end: LocalDate }[] {
  if (!Number.isInteger(count) || count < 1) {
    return []
  }
  const anchor = jalaliParts(localDate)
  const window: { year: number; month: number; start: LocalDate; end: LocalDate }[] = []

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const absolute = anchor.year * 12 + (anchor.month - 1) - offset
    const year = Math.floor(absolute / 12)
    const month = (absolute % 12) + 1
    const { start, end } = jalaliMonthRange(year, month)
    window.push({ year, month, start, end })
  }
  return window
}

/**
 * `true` when `localDate` falls in the week containing `anchor`.
 *
 * "This week" and "this week's appointments" are the same week only if both ask
 * the same function, so the dashboard's counter and the grid's columns both end
 * up here.
 */
export function isInJalaliWeekOf(localDate: LocalDate, anchor: LocalDate): boolean {
  return isWithinLocalDates(localDate, startOfJalaliWeek(anchor), endOfJalaliWeek(anchor))
}

/** `true` when `localDate` falls in the month containing `anchor`. */
export function isInJalaliMonthOf(localDate: LocalDate, anchor: LocalDate): boolean {
  return isSameJalaliMonth(localDate, anchor)
}

/** The Jalali year of a date, as a number. */
export function jalaliYearOf(localDate: LocalDate): number {
  return jalaliParts(localDate).year
}

/** The Jalali month of a date, 1–12. */
export function jalaliMonthOf(localDate: LocalDate): number {
  return jalaliParts(localDate).month
}

/** The day of the Jalali month, 1–31. */
export function jalaliDayOf(localDate: LocalDate): number {
  return jalaliParts(localDate).day
}
