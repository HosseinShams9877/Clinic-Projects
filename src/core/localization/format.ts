/**
 * Every value the product renders as text.
 *
 * `07-localization.md` §7.1 defines this file's API and states its purpose in one
 * line: "No component formats a value inline. `new Intl.NumberFormat(...)` in a
 * component is a finding — it belongs in this module, where it is tested once."
 *
 * So the rule is not "prefer these helpers". It is that formatting happens here or
 * it is a defect. The reasons are all specific to this product:
 *
 * - **Persian digits are mandatory, always** (`06-constants.md` §6). A component
 *   that interpolates a number into JSX renders `3 جلسه` and `07-localization.md`
 *   §8 names that exact string as a violation.
 * - **The thousands separator is `٬`** (U+066C), not `,` — §4.1. A component using
 *   `toLocaleString()` gets a comma, which is invisible in review and obvious to a
 *   Persian reader.
 * - **Money is stored in Rial and shown in Toman** (`06-constants.md` §6). The
 *   conversion divides by ten, and a component that forgets shows every price ten
 *   times too large.
 * - **Bidi isolation** — §5. A phone number inside a Persian sentence reorders its
 *   leading zero without an isolation boundary, and the fix is invisible unless one
 *   place owns it.
 *
 * None of those is a formatting preference. Each is a defect that survives review
 * and reaches a clinic, which is why the module exists and why a second
 * implementation of any of them is a finding rather than a duplicate.
 */

import { RIAL_PER_TOMAN } from '@/core/constants'
import { ValidationError, exhaustive } from '@/core/types'

import {
  CURRENCY_TOMAN_LABEL,
  PERCENT_LABEL,
  RELATIVE_LABELS,
  monthName,
} from './catalog/common'
import { PERSIAN_DECIMAL_SEPARATOR, PERSIAN_THOUSANDS_SEPARATOR, toPersianDigits } from './digits'
import { diffLocalDays, jalaliParts } from './jalali'
import { normalizeMobile } from './normalize'
import type { LocalDate, LocalTime } from './types'
import { DAYS_IN_WEEK } from './types'

/* ── Text direction ───────────────────────────────────────────────────────── */

/**
 * U+2066 LEFT-TO-RIGHT ISOLATE and U+2069 POP DIRECTIONAL ISOLATE.
 *
 * `07-localization.md` §5: "Every such run is wrapped in an isolation boundary — a
 * `<bdi>` element or the equivalent Unicode isolate characters — with the run
 * itself marked as LTR." A component uses `<bdi>`; a **string** — a message
 * template, an `aria-label`, a `tel:` href — cannot, and these are the equivalent
 * the section names.
 *
 * Named rather than written as escapes at the point of use, because `⁦` in
 * source is unreadable and an invisible character that nobody can see is a
 * character that gets deleted by a careless edit.
 */
export const ISOLATE_LTR_START = '⁦'
export const ISOLATE_LTR_END = '⁩'

/** Wraps `text` in an LTR isolation boundary. */
export function isolateLtr(text: string): string {
  return `${ISOLATE_LTR_START}${text}${ISOLATE_LTR_END}`
}

/* ── Numbers ──────────────────────────────────────────────────────────────── */

/**
 * The decimal text of a number, with the forms we refuse made explicit.
 *
 * `String(1e21)` is `"1e+21"` and `String(1e-7)` is `"1e-7"`; both would render as
 * a Persian-digited string containing a Latin `e`, which is not a number to a
 * reader and not a value anyone can act on. `10-testing-strategy.md` §3.4 requires
 * that a formatter "does not throw" on empty and null input and says nothing about
 * exponential notation — so this is a judgement, and the judgement is that a
 * money or count value large enough to reach `1e21` is a defect upstream that
 * should surface at the formatter rather than reach a screen.
 */
function numericString(value: number | bigint): string {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot format ${String(value)} as a number`)
  }
  const text = String(value)
  if (text.includes('e') || text.includes('E')) {
    throw new RangeError(`Cannot format ${text}: exponential notation is not renderable`)
  }
  return text
}

/** Inserts `٬` every three digits, counting from the right. */
function groupThousands(digits: string): string {
  if (digits.length <= 3) {
    return digits
  }
  const parts: string[] = []
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) {
      parts.push(PERSIAN_THOUSANDS_SEPARATOR)
    }
    parts.push(digits.slice(index, index + 1))
  }
  return parts.join('')
}

/**
 * A number as Persian digits, grouped with `٬`.
 *
 * `formatNumber(1234567)` is `۱٬۲۳۴٬۵۶۷`. A `bigint` is accepted because money is
 * one and `10-testing-strategy.md` §3.3 requires that "no float ever appears" —
 * passing a `bigint` through here keeps it a `bigint` until the last step.
 *
 * A fractional part, if there is one, is separated by `٫` (U+066B) — §4.1's
 * decimal separator, which the section notes "should not arise in financial
 * surfaces" because money is an integer in Rial. It arises for a rate or a
 * percentage, which is why it is handled rather than refused.
 *
 * A negative value keeps a Latin `-`. `06-constants.md` §8 forbids storing one —
 * debt is a positive amount with a direction, and a discount is recorded as a
 * discount — so a negative here is a computed difference in a report, and the
 * display primitive isolates the run it sits in.
 */
export function formatNumber(value: number | bigint): string {
  const text = numericString(value)
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [integer = '', fraction] = unsigned.split('.')
  const grouped = groupThousands(integer)
  const body =
    fraction === undefined ? grouped : `${grouped}${PERSIAN_DECIMAL_SEPARATOR}${fraction}`
  return toPersianDigits(negative ? `-${body}` : body)
}

/**
 * A percentage as Persian digits and «٪».
 *
 * The argument is the percentage **itself**: `formatPercent(15)` is `۱۵٪`, not
 * `۰٫۱۵٪`. The alternative convention — a fraction — is the classic source of a
 * value a hundred times wrong, so the choice is stated here, stated in the test,
 * and made obvious by the name of the parameter.
 *
 * No decimal places are forced and none are dropped: `formatNumber` renders
 * exactly what it is given, so a stored `۱۲٫۵` stays `۱۲٫۵` and a stored `۱۲`
 * stays `۱۲`. Rounding a displayed rate is a decision for the surface that knows
 * what the rate means, not for the formatter.
 */
export function formatPercent(value: number): string {
  return `${formatNumber(value)}${PERCENT_LABEL}`
}

/* ── Money ────────────────────────────────────────────────────────────────── */

/** Options for `formatMoney`. */
export interface MoneyFormatOptions {
  /**
   * Append «تومان». Defaults to `true`.
   *
   * `07-localization.md` §8 requires that "a money value should carry its unit",
   * and `06-constants.md` §6's own example is «۵۰۰٬۰۰۰ تومان». A ledger column
   * whose header already reads «مبلغ (تومان)» turns it off rather than repeating
   * the unit in every cell.
   */
  readonly unit?: boolean
}

/**
 * Rial to Toman, rounded half-up, keeping the sign.
 *
 * `10-testing-strategy.md` §3.3 requires that money arithmetic produce "no float"
 * and that the helpers never lose a value. The two obligations meet here: prices
 * are round Toman amounts and divide exactly, but a percentage discount computed
 * against a Rial price does not, and a remainder of Rial would be silently
 * dropped by a plain `/ 10n`.
 *
 * The remainder is at most 9 Rial — under one Toman — so the rounding is a display
 * decision that cannot hide a real amount. The **stored Rial integer stays
 * authoritative**; nothing reads a formatted string back into storage, and
 * `03-data-model.md` §4's balance is always recomputed from the stored rows.
 */
function toToman(amountRial: bigint): bigint {
  const negative = amountRial < 0n
  const magnitude = negative ? -amountRial : amountRial
  const whole = magnitude / RIAL_PER_TOMAN
  const remainder = magnitude % RIAL_PER_TOMAN
  const rounded = remainder * 2n >= RIAL_PER_TOMAN ? whole + 1n : whole
  return negative ? -rounded : rounded
}

/**
 * A Rial amount as Toman, in Persian digits, with `٬`.
 *
 * `formatMoney(5_000_000n)` is `۵۰۰٬۰۰۰ تومان` — the default deposit from
 * `06-constants.md` §5, written the way the specification writes it.
 *
 * The parameter is Rial and the output is Toman, and the name says neither. That
 * is deliberate: the suffix would have to say both (`formatRialAsToman`), and the
 * conversion is the one thing every caller needs — `06-constants.md` §6 stores
 * Rial and displays Toman, so there is no caller who wants Rial shown. The unit in
 * the returned string is what tells a reader which of the two they are looking at.
 */
export function formatMoney(amountRial: bigint, options: MoneyFormatOptions = {}): string {
  const { unit = true } = options
  const amount = formatNumber(toToman(amountRial))
  return unit ? `${amount} ${CURRENCY_TOMAN_LABEL}` : amount
}

/* ── Dates and times ──────────────────────────────────────────────────────── */

/** The three date styles of `07-localization.md` §7.1. */
export type DateStyle = 'short' | 'long' | 'relative'

/**
 * The number of days either side of today that are still spoken of in days, and
 * then in weeks (§6.4's «۳ روز پیش» and «۲ هفته دیگر»).
 *
 * Two weeks is where «۱۳ روز پیش» stops being easier to read than «۲ هفته دیگر»,
 * and six weeks is where a week count stops being one — the point at which the
 * date itself is clearer than a phrase, which is what `relative` falls back to.
 *
 * **The boundaries beyond six weeks are unspecified.** §6.4 fixes these two units
 * and `10-testing-strategy.md` §3.4 tests exactly these forms, so a month count
 * would mean inventing Persian vocabulary the specification does not contain. See
 * the Phase 1 report's open question on relative dates.
 */
const RELATIVE_DAY_LIMIT = 2 * DAYS_IN_WEEK
const RELATIVE_WEEK_LIMIT = 6 * DAYS_IN_WEEK

/** «۱۴۰۵/۰۶/۲۹» — zero-padded, Persian digits, Latin slashes. */
function shortDate(date: LocalDate): string {
  const { year, month, day } = jalaliParts(date)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return toPersianDigits(`${year}/${pad(month)}/${pad(day)}`)
}

/** «۲۹ شهریور ۱۴۰۵» — the day unpadded, then the month name, then the year. */
function longDate(date: LocalDate): string {
  const { year, month, day } = jalaliParts(date)
  return `${toPersianDigits(day)} ${monthName(month)} ${toPersianDigits(year)}`
}

/** «۳ روز پیش» — a count, a unit noun and a direction, in that order. */
function relativePhrase(count: number, unit: string, direction: string): string {
  return `${toPersianDigits(count)} ${unit} ${direction}`
}

/**
 * A relative phrase, or the short date when the phrase stops being useful.
 *
 * The ladder is §6.4's: the three named days, then a day count inside two weeks,
 * then a week count inside six. `Math.round` rather than `Math.floor` on the week
 * count so that fourteen days is «۲ هفته دیگر» — the example §6.4 gives — and not
 * «۲ هفته» from a floor of 1.99.
 */
function relativeDate(date: LocalDate, today: LocalDate): string {
  const difference = diffLocalDays(date, today)
  if (difference === 0) return RELATIVE_LABELS.today
  if (difference === 1) return RELATIVE_LABELS.tomorrow
  if (difference === -1) return RELATIVE_LABELS.yesterday

  const magnitude = Math.abs(difference)
  const direction = difference < 0 ? RELATIVE_LABELS.past : RELATIVE_LABELS.future

  if (magnitude < RELATIVE_DAY_LIMIT) {
    return relativePhrase(magnitude, RELATIVE_LABELS.dayUnit, direction)
  }
  if (magnitude < RELATIVE_WEEK_LIMIT) {
    return relativePhrase(
      Math.round(magnitude / DAYS_IN_WEEK),
      RELATIVE_LABELS.weekUnit,
      direction,
    )
  }
  return shortDate(date)
}

/**
 * A Jalali date as text (`07-localization.md` §7.1).
 *
 * Gregorian is never displayed (`07-localization.md` §6, first line), so there is
 * no style that produces it and no parameter that selects it.
 *
 * **`relative` requires the reference day, and the overloads enforce it.** A
 * phrase like «۳ روز پیش» is meaningless without a "now", and the two ways to
 * supply one are to read the clock here or to take it as an argument.
 * `05-conventions.md` §8 forbids the first — "**No `new Date()` in business
 * logic.** Time comes from an injected clock, so that slot generation and
 * next-due computation are testable at any date" — so this layer reads no clock
 * at all, and `formatDate(date, 'relative')` with no third argument does not
 * compile. `short` and `long` need no reference and keep §7.1's two-argument form.
 */
export function formatDate(date: LocalDate, style: 'short' | 'long'): string
export function formatDate(date: LocalDate, style: 'relative', today: LocalDate): string
export function formatDate(date: LocalDate, style: DateStyle, today?: LocalDate): string {
  switch (style) {
    case 'short':
      return shortDate(date)
    case 'long':
      return longDate(date)
    case 'relative':
      if (today === undefined) {
        // Unreachable through the overloads, and reachable from JavaScript or
        // from a cast — a component rendered the day before a date picker is
        // wired up, say. Throwing names the missing argument; the alternative is
        // a phrase computed against a date nobody supplied, which is a wrong
        // string on a screen rather than an error in a log.
        throw new ValidationError('formatDate(date, "relative") requires the reference day', {
          messageKey: 'validation.relativeDate.missingReference',
        })
      }
      return relativeDate(date, today)
    default:
      return exhaustive(style, 'formatDate')
  }
}

/**
 * A wall-clock time as Persian digits, `HH:mm`.
 *
 * `formatTime('09:30')` is `۰۹:۳۰`. The colon stays a Latin colon — Persian uses
 * `:` — and the zero padding stays, because a time is a tabular value and a
 * right-aligned column of `۹:۳۰` and `۱۰:۱۵` reads as ragged.
 */
export function formatTime(time: LocalTime): string {
  return toPersianDigits(time)
}

/**
 * A date and a time together, separated by a space.
 *
 * The short date, not the long one: the pair appears in a table cell, a list row
 * and a message template — places where «۲۹ شهریور ۱۴۰۵ ساعت ۰۹:۳۰» is longer than
 * the row it sits in. A surface that needs the long form writes it out of
 * `formatDate(date, 'long')` and `formatTime`, which is two calls and one
 * deliberate choice rather than a hidden third style.
 */
export function formatDateTime(date: LocalDate, time: LocalTime): string {
  return `${shortDate(date)} ${formatTime(time)}`
}

/* ── Phone numbers ────────────────────────────────────────────────────────── */

/**
 * A mobile number as Persian digits in an LTR isolation boundary.
 *
 * §7.1 annotates this function "Persian digits, isolated LTR run", and it is the
 * one formatter that carries its own isolation rather than leaving it to a
 * component. §5 explains why the phone number is the case that needs it: "a phone
 * number can render with its leading zero at the wrong end". It is also the value
 * most likely to be rendered outside a component — into an `aria-label`, a `tel:`
 * href, or a message template — where no `<bdi>` exists to wrap it.
 *
 * The input is normalised first, so a stored `09123456789`, a typed
 * `۰۹۱۲۳۴۵۶۷۸۹` and a pasted `+989123456789` all render identically. Validation is
 * not repeated here: the form validates on the way in and the column was written
 * from the normalised value, so a formatter that re-validated would only be able to
 * disagree with the schema.
 */
export function formatPhone(mobile: string): string {
  return isolateLtr(toPersianDigits(normalizeMobile(mobile)))
}
