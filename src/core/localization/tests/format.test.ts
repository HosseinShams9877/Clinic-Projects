/**
 * Every value the product renders as text.
 *
 * `07-localization.md` §7.1 defines this API and says why a component may not do
 * any of it inline: "`new Intl.NumberFormat(...)` in a component is a finding — it
 * belongs in this module, where it is tested once." The tests below are that "once".
 *
 * Three assertions in this file carry more weight than their length suggests, and
 * each is a defect that survives review and reaches a clinic:
 *
 * - **`formatMoney` divides by ten.** §6 of `06-constants.md` stores Rial and
 *   displays Toman; a formatter that forgot shows every price ten times too large,
 *   and `۵۰۰٬۰۰۰ تومان` is checked against the specification's own example.
 * - **The thousands separator is `٬` (U+066C), never `,`.** A comma is invisible in
 *   review and obvious to a Persian reader.
 * - **`formatDate(date, 'relative')` requires the reference day.** §8 of
 *   `05-conventions.md` forbids reading the clock in business logic, so there is no
 *   default, and the missing argument is a thrown error rather than a phrase
 *   computed against a date nobody supplied.
 */

import { describe, expect, it } from 'vitest'

import { RIAL_PER_TOMAN } from '@/core/constants'

import {
  ISOLATE_LTR_END,
  ISOLATE_LTR_START,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPhone,
  formatTime,
  isolateLtr,
  type DateStyle,
} from '../format'
import { addLocalDays, asLocalDate, asLocalTime } from '../jalali'
import type { LocalDate } from '../types'

const date = (value: string): LocalDate => asLocalDate(value)
const time = (value: string) => asLocalTime(value)

/**
 * `formatDate` with its overloads widened.
 *
 * The overloads are a typing guarantee, not a runtime one: `relative` without a
 * reference day is a compile error at a call site but is still reachable from
 * JavaScript and from a cast, and the schema says the function throws in that case
 * rather than inventing a "now". A test can only reach it by widening the type,
 * which is exactly what this alias is for.
 */
const formatDateUnguarded = formatDate as (
  date: LocalDate,
  style: DateStyle,
  today?: LocalDate,
) => string

/** `today` for every relative assertion below — one fixed day, never the clock. */
const TODAY = date('1405-06-29')

/** A date `offset` days from `TODAY`, built rather than written. */
const relative = (offset: number): string =>
  formatDateUnguarded(addLocalDays(TODAY, offset), 'relative', TODAY)

/* ── Text direction ───────────────────────────────────────────────────────── */

describe('isolateLtr', () => {
  it('wraps a run in the Unicode isolate pair §5 names', () => {
    // §5: "Every such run is wrapped in an isolation boundary — a `<bdi>` element or
    // the equivalent Unicode isolate characters — with the run itself marked as
    // LTR." A string in an `aria-label` or a `tel:` href cannot hold a `<bdi>`.
    expect(ISOLATE_LTR_START).toBe('⁦')
    expect(ISOLATE_LTR_END).toBe('⁩')
    expect(isolateLtr('09123456789')).toBe('⁦09123456789⁩')
    expect(isolateLtr('')).toBe('⁦⁩')
  })

  it('leaves the run itself untouched', () => {
    expect(isolateLtr('a/b')).toBe(`${ISOLATE_LTR_START}a/b${ISOLATE_LTR_END}`)
  })
})

/* ── Numbers ──────────────────────────────────────────────────────────────── */

describe('formatNumber', () => {
  it('renders a number in Persian digits', () => {
    expect(formatNumber(0)).toBe('۰')
    expect(formatNumber(7)).toBe('۷')
    // A four-digit number is still a number, so it is still grouped: 1405 is
    // «۱٬۴۰۵». That is the right rendering for a count and the wrong one for a
    // year, which is why a year is passed as a `string` — the two cases
    // `message.ts` documents, and `message.test.ts` asserts side by side.
    expect(formatNumber(1405)).toBe('۱٬۴۰۵')
  })

  it('groups thousands with ٬ (U+066C), counting from the right', () => {
    // Not a comma. §4.1 fixes `٬` as the separator, and `toLocaleString()` — the
    // obvious shortcut — produces the wrong one.
    expect(formatNumber(999)).toBe('۹۹۹')
    expect(formatNumber(1000)).toBe('۱٬۰۰۰')
    expect(formatNumber(12_345)).toBe('۱۲٬۳۴۵')
    expect(formatNumber(1_234_567)).toBe('۱٬۲۳۴٬۵۶۷')
    expect(formatNumber(-1_234_567)).toBe('-۱٬۲۳۴٬۵۶۷')
    expect(formatNumber(1_234_567_000)).toBe('۱٬۲۳۴٬۵۶۷٬۰۰۰')
  })

  it('accepts a bigint and keeps it a bigint until the last step', () => {
    // §3.3 of `10-testing-strategy.md`: "no float ever appears". Money reaches this
    // function as a `bigint` and must not be coerced on the way.
    expect(formatNumber(5_000_000n)).toBe('۵٬۰۰۰٬۰۰۰')
    expect(formatNumber(0n)).toBe('۰')
    expect(formatNumber(-10n)).toBe('-۱۰')
  })

  it('renders a fractional part with ٫ (U+066B)', () => {
    // §4.1's decimal separator. Money is an integer in Rial so this arises for a
    // rate, which is why it is handled rather than refused.
    expect(formatNumber(12.5)).toBe('۱۲٫۵')
    expect(formatNumber(0.25)).toBe('۰٫۲۵')
    expect(formatNumber(-12.5)).toBe('-۱۲٫۵')
    expect(formatNumber(12_345.678)).toBe('۱۲٬۳۴۵٫۶۷۸')
  })

  it('drops a trailing zero fraction, because there is no fraction to show', () => {
    // `String(12.0)` is `'12'`, so the value is an integer and renders as one.
    expect(formatNumber(12.0)).toBe('۱۲')
  })

  it('throws on a non-finite number rather than rendering NaN', () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError)
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => formatNumber(Number.NEGATIVE_INFINITY)).toThrow(RangeError)
  })

  it('throws on exponential notation rather than rendering a Latin letter', () => {
    // `String(1e21)` is `"1e+21"`, which would render as a Persian-digited string
    // containing a Latin `e` — not a number to a reader and not a value anyone can
    // act on. A count that large is a defect upstream and surfaces here.
    expect(() => formatNumber(1e21)).toThrow(RangeError)
    expect(() => formatNumber(1e-7)).toThrow(RangeError)
    // Just below the threshold still renders, so the guard is a boundary and not a
    // blanket refusal of large numbers.
    expect(formatNumber(1e18)).toBe('۱٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰')
  })
})

describe('formatPercent', () => {
  it('renders the percentage itself, not a fraction', () => {
    // The convention this asserts is the whole point of the test: `formatPercent(15)`
    // is `۱۵٪` and not `۰٫۱۵٪`. A fraction-taking formatter is the classic source of
    // a value a hundred times wrong.
    expect(formatPercent(15)).toBe('۱۵٪')
    expect(formatPercent(0)).toBe('۰٪')
    expect(formatPercent(100)).toBe('۱۰۰٪')
    expect(formatPercent(12.5)).toBe('۱۲٫۵٪')
  })

  it('appends the Persian percent sign, not the Latin one', () => {
    expect(formatPercent(50)).not.toContain('%')
    expect(formatPercent(50).endsWith('٪')).toBe(true)
  })
})

/* ── Money ────────────────────────────────────────────────────────────────── */

describe('formatMoney', () => {
  it('renders Rial as Toman, with the unit, exactly as the specification writes it', () => {
    // `06-constants.md` §6's own example is «۵۰۰٬۰۰۰ تومان» for a 5٬000٬000 Rial
    // deposit. This is the assertion that catches the missing division by ten.
    expect(formatMoney(5_000_000n)).toBe('۵۰۰٬۰۰۰ تومان')
    expect(RIAL_PER_TOMAN).toBe(10n)
  })

  it('omits the unit when the surface already carries it in a header', () => {
    // §8 of `07-localization.md` requires that "a money value should carry its
    // unit", so the default is to include it — a ledger column headed «مبلغ (تومان)»
    // is the case that turns it off.
    expect(formatMoney(5_000_000n, { unit: false })).toBe('۵۰۰٬۰۰۰')
    expect(formatMoney(5_000_000n, { unit: true })).toBe('۵۰۰٬۰۰۰ تومان')
    expect(formatMoney(5_000_000n, {})).toBe('۵۰۰٬۰۰۰ تومان')
  })

  it('renders zero and a small amount without a separator', () => {
    expect(formatMoney(0n)).toBe('۰ تومان')
    expect(formatMoney(1_000n)).toBe('۱۰۰ تومان')
    expect(formatMoney(90n)).toBe('۹ تومان')
  })

  it('rounds a Rial remainder half-up, at the boundary', () => {
    // A price is a round Toman amount and divides exactly; a percentage discount
    // computed against a Rial price does not. The remainder is under one Toman, so
    // the choice is a display decision that cannot hide a real amount — the stored
    // Rial integer stays authoritative.
    expect(formatMoney(10n)).toBe('۱ تومان') // exact
    expect(formatMoney(14n)).toBe('۱ تومان') // 0.4 → down
    expect(formatMoney(15n)).toBe('۲ تومان') // 0.5 → up
    expect(formatMoney(19n)).toBe('۲ تومان') // 0.9 → up
    expect(formatMoney(4n)).toBe('۰ تومان') // 0.4 → down
    expect(formatMoney(5n)).toBe('۱ تومان') // 0.5 → up
  })

  it('keeps the sign when a computed difference is negative', () => {
    // §8 of `06-constants.md` forbids *storing* a negative amount — debt is a
    // positive amount with a direction — so a negative reaching here is a report's
    // difference, and it keeps its sign rather than being quietly made positive.
    expect(formatMoney(-5_000_000n)).toBe('-۵۰۰٬۰۰۰ تومان')
    expect(formatMoney(-15n)).toBe('-۲ تومان')
  })
})

/* ── Dates and times ──────────────────────────────────────────────────────── */

describe('formatDate', () => {
  it('renders the short form as ۱۴۰۵/۰۶/۲۹', () => {
    // §6.4's short date. Latin slashes, zero-padded fields, Persian digits.
    expect(formatDate(date('1405-06-29'), 'short')).toBe('۱۴۰۵/۰۶/۲۹')
    expect(formatDate(date('1404-01-05'), 'short')).toBe('۱۴۰۴/۰۱/۰۵')
  })

  it('renders the long form as ۲۹ شهریور ۱۴۰۵', () => {
    // §6.4's long date: the day unpadded, then the month name, then the year.
    expect(formatDate(date('1405-06-29'), 'long')).toBe('۲۹ شهریور ۱۴۰۵')
    expect(formatDate(date('1405-01-01'), 'long')).toBe('۱ فروردین ۱۴۰۵')
    expect(formatDate(date('1403-12-30'), 'long')).toBe('۳۰ اسفند ۱۴۰۳')
  })

  it('names every month of the year', () => {
    const names = [
      'فروردین',
      'اردیبهشت',
      'خرداد',
      'تیر',
      'مرداد',
      'شهریور',
      'مهر',
      'آبان',
      'آذر',
      'دی',
      'بهمن',
      'اسفند',
    ]
    for (const [index, name] of names.entries()) {
      expect(formatDate(date(`1405-${String(index + 1).padStart(2, '0')}-01`), 'long')).toBe(
        `۱ ${name} ۱۴۰۵`,
      )
    }
  })
})

describe('formatDate with the relative style', () => {
  it('names the three days around today', () => {
    expect(relative(0)).toBe('امروز')
    expect(relative(1)).toBe('فردا')
    expect(relative(-1)).toBe('دیروز')
  })

  it('counts days within two weeks, in both directions', () => {
    // §6.4's «۳ روز پیش» and its mirror.
    expect(relative(-2)).toBe('۲ روز پیش')
    expect(relative(-3)).toBe('۳ روز پیش')
    expect(relative(2)).toBe('۲ روز دیگر')
    expect(relative(3)).toBe('۳ روز دیگر')
    expect(relative(-13)).toBe('۱۳ روز پیش')
    expect(relative(13)).toBe('۱۳ روز دیگر')
  })

  it('switches to weeks at fourteen days', () => {
    // §6.4's «۲ هفته دیگر» is the example the boundary is drawn around, so the
    // assertions sit on both sides of it.
    expect(relative(14)).toBe('۲ هفته دیگر')
    expect(relative(-14)).toBe('۲ هفته پیش')
    expect(relative(21)).toBe('۳ هفته دیگر')
    expect(relative(-41)).toBe('۶ هفته پیش')
  })

  it('falls back to the short date beyond six weeks', () => {
    // §6.4 fixes days and weeks and gives no month form, so past six weeks the date
    // itself is clearer than a phrase. Inventing «۱ ماه دیگر» would mean inventing
    // Persian vocabulary the specification does not contain — see the Phase 1
    // report's open question on relative dates.
    expect(relative(42)).toBe(formatDate(addLocalDays(TODAY, 42), 'short'))
    expect(relative(-42)).toBe(formatDate(addLocalDays(TODAY, -42), 'short'))
    expect(relative(365)).toBe(formatDate(addLocalDays(TODAY, 365), 'short'))
  })

  it('rounds a week count rather than truncating it', () => {
    // A floor would render twenty days as «۲ هفته دیگر» — a phrase that reads as
    // fourteen. Rounding is what makes the count honest.
    expect(relative(20)).toBe('۳ هفته دیگر')
    expect(relative(17)).toBe('۲ هفته دیگر')
  })

  it('throws when the reference day is missing rather than reading the clock', () => {
    // §8 of `05-conventions.md`: "**No `new Date()` in business logic.** Time comes
    // from an injected clock." The overloads make this a compile error at a call
    // site; the throw covers the JavaScript and cast callers, and names the missing
    // argument instead of rendering a phrase against a date nobody supplied.
    expect(() => formatDateUnguarded(date('1405-06-29'), 'relative')).toThrow(
      expect.objectContaining({
        code: 'VALIDATION',
        messageKey: 'validation.relativeDate.missingReference',
      }),
    )
  })

  it('throws on a style the product does not have', () => {
    // `exhaustive()` turns a future fourth style into a loud failure at the switch
    // rather than a silently missing case. The value cannot be written as a `DateStyle`
    // — that is the point of the test — so it is reached the only way it can be,
    // through a cast that goes through `unknown` because the two types do not overlap.
    const unknownStyle = 'weekday' as unknown as DateStyle

    expect(() => formatDateUnguarded(date('1405-06-29'), unknownStyle)).toThrow(
      expect.objectContaining({ messageKey: 'error.unhandledCase' }),
    )
  })
})

describe('formatTime and formatDateTime', () => {
  it('renders a time in Persian digits with a Latin colon', () => {
    // §7.1's `formatTime`. The zero padding stays: a time is a tabular value, and a
    // right-aligned column of ۹:۳۰ and ۱۰:۱۵ reads as ragged.
    expect(formatTime(time('09:30'))).toBe('۰۹:۳۰')
    expect(formatTime(time('00:00'))).toBe('۰۰:۰۰')
    expect(formatTime(time('23:59'))).toBe('۲۳:۵۹')
  })

  it('joins a date and a time with the short date', () => {
    expect(formatDateTime(date('1405-06-29'), time('09:30'))).toBe('۱۴۰۵/۰۶/۲۹ ۰۹:۳۰')
    expect(formatDateTime(date('1404-01-05'), time('00:00'))).toBe('۱۴۰۴/۰۱/۰۵ ۰۰:۰۰')
  })
})

/* ── Phone numbers ────────────────────────────────────────────────────────── */

describe('formatPhone', () => {
  it('renders the stored mobile in Persian digits, isolated as an LTR run', () => {
    // §5: "a phone number can render with its leading zero at the wrong end". It is
    // also the value most likely to be rendered outside a component — into an
    // `aria-label` or a `tel:` href — which is why it carries its own boundary.
    expect(formatPhone('09123456789')).toBe(`${ISOLATE_LTR_START}۰۹۱۲۳۴۵۶۷۸۹${ISOLATE_LTR_END}`)
  })

  it('renders every accepted input form identically', () => {
    const expected = `${ISOLATE_LTR_START}۰۹۱۲۳۴۵۶۷۸۹${ISOLATE_LTR_END}`
    for (const input of [
      '09123456789',
      '۰۹۱۲۳۴۵۶۷۸۹',
      '+989123456789',
      '00989123456789',
      '9123456789',
      '۰۹۱۲ ۳۴۵ ۶۷۸۹',
    ]) {
      expect(formatPhone(input)).toBe(expected)
    }
  })

  it('does not throw on input it cannot recognise', () => {
    // It normalises; it does not validate. Validation belongs to the schema, which
    // rejects the *result* with a Persian sentence rather than the request failing
    // with an exception.
    expect(() => formatPhone('')).not.toThrow()
    expect(() => formatPhone('tell the receptionist')).not.toThrow()
    expect(formatPhone('tell the receptionist')).toBe(`${ISOLATE_LTR_START}${ISOLATE_LTR_END}`)
  })
})
