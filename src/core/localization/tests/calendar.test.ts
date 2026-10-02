/**
 * The week, the month, and the ranges between them.
 *
 * `07-localization.md` §6.4 states the obligation this file exists to discharge,
 * and it is a behavioural one rather than a formatting one:
 *
 * > **The week starting on Saturday is a behavioural requirement, not a
 * > formatting one.** It governs slot generation, the "this week" report ranges,
 * > working-hours configuration, and the appointment grid's column order. A
 * > calendar that starts on Sunday is wrong even if every date on it is correct.
 *
 * So the assertions below are about *where the week begins* and *where a month's
 * grid ends*, not about how a date is printed. The one concrete anchor — that
 * ۱ فروردین ۱۴۰۵ is a شنبه — is worth its hard-coded weekday because it is the
 * boundary between the two numbering conventions: Saturday is 6 to JavaScript and
 * 0 to the product, and every assertion here fails if that shift is applied
 * backwards. `jalali.test.ts` verifies the same shift independently against ICU.
 */

import { describe, expect, it } from 'vitest'

import { SUPPORTED_JALALI_YEAR_MAX, SUPPORTED_JALALI_YEAR_MIN } from '@/core/constants'

import {
  addLocalDays,
  asLocalDate,
  daysInJalaliMonth,
  diffLocalDays,
  isJalaliLeapYear,
  jalaliWeekday,
} from '../jalali'
import type { LocalDate } from '../types'
import {
  endOfJalaliMonth,
  endOfJalaliWeek,
  isInJalaliMonthOf,
  isInJalaliWeekOf,
  isSameJalaliMonth,
  jalaliDayOf,
  jalaliMonth,
  jalaliMonthGrid,
  jalaliMonthOf,
  jalaliMonthRange,
  jalaliMonthWindow,
  jalaliWeek,
  jalaliYearOf,
  jalaliYearRange,
  startOfJalaliMonth,
  startOfJalaliWeek,
  weekColumnOf,
  weekColumns,
} from '../calendar'

const date = (value: string): LocalDate => asLocalDate(value)

/**
 * ۱ فروردین ۱۴۰۵ — 21 March 2026, which is a شنبه.
 *
 * The year therefore begins on the first column of its own grid, which makes it
 * the cleanest possible anchor: every week that follows is a plain seven-day
 * block with no padding in front of it.
 */
const NOWRUZ_1405 = date('1405-01-01')

/* ── The week ─────────────────────────────────────────────────────────────── */

describe('the start and end of the week', () => {
  it('begins the year on a شنبه, which is the first column', () => {
    expect(jalaliWeekday(NOWRUZ_1405)).toBe(0)
    // Making it safe to call on a value that is already a week start — the
    // idempotence that lets a grid normalise a date it was handed without first
    // asking what it is.
    expect(startOfJalaliWeek(NOWRUZ_1405)).toBe('1405-01-01')
    expect(endOfJalaliWeek(NOWRUZ_1405)).toBe('1405-01-07')
  })

  it('finds the شنبه before a mid-week date, and the جمعه after it', () => {
    // ۴ فروردین ۱۴۰۵ is the fourth column, so its week is the year's first.
    expect(weekColumnOf(date('1405-01-04'))).toBe(3)
    expect(startOfJalaliWeek(date('1405-01-04'))).toBe('1405-01-01')
    expect(endOfJalaliWeek(date('1405-01-04'))).toBe('1405-01-07')
  })

  it('names جمعه as the last column', () => {
    expect(weekColumnOf(date('1405-01-07'))).toBe(6)
    expect(startOfJalaliWeek(date('1405-01-07'))).toBe('1405-01-01')
    expect(endOfJalaliWeek(date('1405-01-07'))).toBe('1405-01-07')
  })

  it('crosses a month boundary as one week', () => {
    // ۳۱ شهریور ۱۴۰۵ is a سهشنبه, so its week ends in مهر. A week is a week
    // whatever month it straddles — the case that breaks an implementation which
    // clamps the end of a week to the end of the month.
    expect(weekColumnOf(date('1405-06-31'))).toBe(3)
    expect(startOfJalaliWeek(date('1405-06-31'))).toBe('1405-06-28')
    expect(endOfJalaliWeek(date('1405-06-31'))).toBe('1405-07-03')
  })

  it('places every date in exactly one week, across the supported range', () => {
    // The property the four consumers actually depend on: weeks tile the calendar
    // with no gap and no overlap, so an appointment counted in a "this week" total
    // appears in exactly one column of the grid.
    const weekOf = new Map<string, string>()
    let checked = 0
    for (let year = SUPPORTED_JALALI_YEAR_MIN; year <= SUPPORTED_JALALI_YEAR_MAX; year += 1) {
      for (const month of [1, 6, 12]) {
        for (let day = 1; day <= daysInJalaliMonth(year, month); day += 9) {
          const anchor = addLocalDays(fromParts(year, month), day - 1)
          const week = jalaliWeek(anchor)
          expect(week).toHaveLength(7)
          expect(week[0]).toBe(startOfJalaliWeek(anchor))
          expect(week[6]).toBe(endOfJalaliWeek(anchor))
          for (const [column, member] of week.entries()) {
            // A date that already belonged to a different week means two weeks
            // overlapped, which is the failure this loop exists to catch.
            expect(weekOf.get(member) ?? week[0]).toBe(week[0])
            weekOf.set(member, week[0] as string)
            expect(weekColumnOf(member)).toBe(column)
            checked += 1
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1_000)
  })

  it('builds the seven columns in display order, شنبه first', () => {
    expect(weekColumns()).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(jalaliWeek(date('1405-01-04'))).toEqual([
      '1405-01-01',
      '1405-01-02',
      '1405-01-03',
      '1405-01-04',
      '1405-01-05',
      '1405-01-06',
      '1405-01-07',
    ])
  })
})

describe('isInJalaliWeekOf', () => {
  it('answers by the week the first date falls in', () => {
    const anchor = date('1405-01-04')
    expect(isInJalaliWeekOf(date('1405-01-01'), anchor)).toBe(true)
    expect(isInJalaliWeekOf(date('1405-01-07'), anchor)).toBe(true)
    expect(isInJalaliWeekOf(date('1405-01-08'), anchor)).toBe(false)
    expect(isInJalaliWeekOf(date('1404-12-29'), anchor)).toBe(false)
  })

  it('agrees with the week it builds', () => {
    const localDate = date('1405-06-31')
    for (const member of jalaliWeek(localDate)) {
      expect(isInJalaliWeekOf(localDate, member)).toBe(true)
    }
    expect(isInJalaliWeekOf(localDate, addLocalDays(endOfJalaliWeek(localDate), 1))).toBe(false)
    expect(isInJalaliWeekOf(localDate, addLocalDays(startOfJalaliWeek(localDate), -1))).toBe(false)
  })
})

/* ── The month ────────────────────────────────────────────────────────────── */

function fromParts(year: number, month: number): LocalDate {
  return date(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`)
}

describe('the start and end of the month', () => {
  it('finds the first and last day of the month containing a date', () => {
    expect(startOfJalaliMonth(date('1405-06-29'))).toBe('1405-06-01')
    expect(endOfJalaliMonth(date('1405-06-29'))).toBe('1405-06-31')
    expect(startOfJalaliMonth(date('1405-06-01'))).toBe('1405-06-01')
    expect(endOfJalaliMonth(date('1405-06-01'))).toBe('1405-06-31')
  })

  it('ends a thirty-day month on the thirtieth, not the thirty-first', () => {
    expect(endOfJalaliMonth(date('1405-07-01'))).toBe('1405-07-30')
    expect(endOfJalaliMonth(date('1405-11-15'))).toBe('1405-11-30')
  })

  it('ends اسفند on the twenty-ninth or the thirtieth, by the leap rule', () => {
    expect(endOfJalaliMonth(date('1404-12-15'))).toBe('1404-12-29')
    expect(endOfJalaliMonth(date('1403-12-15'))).toBe('1403-12-30')
  })

  it('lists every day of the month, and its length matches the calendar', () => {
    for (const year of [1403, 1404, 1405]) {
      for (let month = 1; month <= 12; month += 1) {
        expect(jalaliMonth(fromParts(year, month))).toHaveLength(daysInJalaliMonth(year, month))
      }
    }
  })

  it('compares two dates by year and month, across a year boundary', () => {
    expect(isSameJalaliMonth(date('1405-06-01'), date('1405-06-31'))).toBe(true)
    expect(isSameJalaliMonth(date('1405-06-01'), date('1405-07-01'))).toBe(false)
    // Same month number, different year: the case a comparison on the month alone
    // gets wrong.
    expect(isSameJalaliMonth(date('1404-06-15'), date('1405-06-15'))).toBe(false)
  })

  it('answers isInJalaliMonthOf from the month containing a date', () => {
    expect(isInJalaliMonthOf(date('1405-06-15'), date('1405-06-30'))).toBe(true)
    expect(isInJalaliMonthOf(date('1405-07-15'), date('1405-06-30'))).toBe(false)
  })

  it('reads a date’s parts', () => {
    expect(jalaliYearOf(date('1405-06-29'))).toBe(1405)
    expect(jalaliMonthOf(date('1405-06-29'))).toBe(6)
    expect(jalaliDayOf(date('1405-06-29'))).toBe(29)
  })
})

/* ── The month grid ───────────────────────────────────────────────────────── */

describe('jalaliMonthGrid', () => {
  it('lays a month out in rows of seven, شنبه first', () => {
    const grid = jalaliMonthGrid(date('1405-01-15'))
    // فروردین ۱۴۰۵ begins on a شنبه and has 31 days, so it is exactly five weeks
    // with no padding in front of it.
    expect(grid).toHaveLength(5)
    for (const row of grid) {
      expect(row).toHaveLength(7)
    }
    expect(grid[0]).toEqual([
      '1405-01-01',
      '1405-01-02',
      '1405-01-03',
      '1405-01-04',
      '1405-01-05',
      '1405-01-06',
      '1405-01-07',
    ])
    expect(grid[4]?.[6]).toBe('1405-02-04')
  })

  it('pads the first and last rows with real neighbouring dates, not blanks', () => {
    // شهریور ۱۴۰۵ does not begin on a شنبه, so the first row carries the end of
    // مرداد. Every cell is a date the product can hold and render, which is what
    // keeps a null check out of every cell renderer.
    const grid = jalaliMonthGrid(date('1405-06-15'))
    const flattened = grid.flat()
    expect(flattened[0]).toBe('1405-05-31')
    expect(flattened).toContain('1405-07-03')
    expect(flattened).toContain('1405-06-01')
    expect(flattened).toContain('1405-06-31')
    expect(grid[0]?.[0]).toBe('1405-05-31')
    expect(grid[0]?.[1]).toBe('1405-06-01')
  })

  it('runs as one unbroken run of days, with no gap and no repeat', () => {
    // The property a hand-built padding loop breaks: a row that starts a day late
    // or repeats the row above it still has the right shape and the right length.
    for (let year = 1404; year <= 1406; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const flattened = jalaliMonthGrid(fromParts(year, month)).flat()
        expect(new Set(flattened).size).toBe(flattened.length)
        for (let index = 1; index < flattened.length; index += 1) {
          expect(flattened[index]).toBe(addLocalDays(flattened[index - 1] as LocalDate, 1))
        }
      }
    }
  })

  it('contains the whole month it displays', () => {
    for (let year = 1404; year <= 1406; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const anchor = fromParts(year, month)
        const flattened = jalaliMonthGrid(anchor).flat()
        for (const day of jalaliMonth(anchor)) {
          expect(flattened).toContain(day)
        }
      }
    }
  })

  it('starts on a شنبه and ends on a جمعه, for every month of three years', () => {
    for (let year = 1404; year <= 1406; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const grid = jalaliMonthGrid(fromParts(year, month))
        const firstRow = grid[0] as LocalDate[]
        const lastRow = grid[grid.length - 1] as LocalDate[]
        expect(weekColumnOf(firstRow[0] as LocalDate)).toBe(0)
        expect(weekColumnOf(lastRow[6] as LocalDate)).toBe(6)
      }
    }
  })

  it('never exceeds six rows, which is what a fixed-height grid can hold', () => {
    // The longest month is 31 days and the shortest 29, so six rows is the ceiling
    // whatever day the month begins on.
    for (let year = 1390; year <= 1450; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const grid = jalaliMonthGrid(fromParts(year, month))
        expect(grid.length).toBeGreaterThanOrEqual(4)
        expect(grid.length).toBeLessThanOrEqual(6)
      }
    }
  })
})

/* ── Ranges ───────────────────────────────────────────────────────────────── */

describe('jalaliMonthRange and jalaliYearRange', () => {
  it('returns the first and last day of a month by number', () => {
    expect(jalaliMonthRange(1405, 6)).toEqual({ start: '1405-06-01', end: '1405-06-31' })
    expect(jalaliMonthRange(1405, 7)).toEqual({ start: '1405-07-01', end: '1405-07-30' })
    expect(jalaliMonthRange(1404, 12)).toEqual({ start: '1404-12-01', end: '1404-12-29' })
    expect(jalaliMonthRange(1403, 12)).toEqual({ start: '1403-12-01', end: '1403-12-30' })
  })

  it('throws on a thirteenth month rather than returning an empty range', () => {
    expect(() => jalaliMonthRange(1405, 13)).toThrow()
    expect(() => jalaliMonthRange(1405, 0)).toThrow()
    expect(() => jalaliMonthRange(1299, 1)).toThrow()
  })

  it('returns the first and last day of a year', () => {
    expect(jalaliYearRange(1405)).toEqual({ start: '1405-01-01', end: '1405-12-29' })
    expect(jalaliYearRange(1403)).toEqual({ start: '1403-01-01', end: '1403-12-30' })
  })

  it('spans a year’s real length', () => {
    for (const year of [1403, 1404, 1405]) {
      const { start, end } = jalaliYearRange(year)
      expect(start).toBe(fromParts(year, 1))
      expect(diffLocalDays(end, start) + 1).toBe(isJalaliLeapYear(year) ? 366 : 365)
    }
  })
})

describe('jalaliMonthWindow', () => {
  it('returns the months ending with the anchor, oldest first', () => {
    expect(jalaliMonthWindow(date('1405-06-15'), 3)).toEqual([
      { year: 1405, month: 4, start: '1405-04-01', end: '1405-04-31' },
      { year: 1405, month: 5, start: '1405-05-01', end: '1405-05-31' },
      { year: 1405, month: 6, start: '1405-06-01', end: '1405-06-31' },
    ])
  })

  it('steps back across a year boundary', () => {
    expect(jalaliMonthWindow(date('1405-02-15'), 4)).toEqual([
      { year: 1404, month: 11, start: '1404-11-01', end: '1404-11-30' },
      { year: 1404, month: 12, start: '1404-12-01', end: '1404-12-29' },
      { year: 1405, month: 1, start: '1405-01-01', end: '1405-01-31' },
      { year: 1405, month: 2, start: '1405-02-01', end: '1405-02-31' },
    ])
  })

  it('returns exactly the requested number of months, whatever their lengths', () => {
    // Stepping by days rather than by months would drift and produce a short window
    // at the wrong end of a year.
    for (const count of [1, 2, 6, 12, 13, 25]) {
      expect(jalaliMonthWindow(date('1405-06-15'), count)).toHaveLength(count)
    }
    expect(jalaliMonthWindow(date('1405-06-15'), 12)[0]).toEqual({
      year: 1404,
      month: 7,
      start: '1404-07-01',
      end: '1404-07-30',
    })
  })

  it('returns an empty window for a count that is not a positive integer', () => {
    // A chart asking for zero months renders nothing rather than throwing in a
    // dashboard that is otherwise fine.
    expect(jalaliMonthWindow(date('1405-06-15'), 0)).toEqual([])
    expect(jalaliMonthWindow(date('1405-06-15'), -1)).toEqual([])
    expect(jalaliMonthWindow(date('1405-06-15'), 2.5)).toEqual([])
  })
})
