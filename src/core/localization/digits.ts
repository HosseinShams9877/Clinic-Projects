/**
 * `docs/knowledge/07-localization.md` §4 — Persian digits.
 *
 * §4: "Every number a user reads is rendered with Persian digits
 * (۰۱۲۳۴۵۶۷۸۹). There is no surface where Latin digits are acceptable, and no
 * 'technical' screen exempt from the rule."
 *
 * Three functions, three jobs:
 *
 * | Function | Direction | Used by |
 * |---|---|---|
 * | `toPersianDigits` | Latin → Persian | the display primitive, at the render boundary |
 * | `toLatinDigits` | any digit form → Latin | parsing and comparison |
 * | `normalizeDigits` | a typed numeric field → Latin and parseable | form inputs, before validation |
 *
 * §4.1's invariant is the whole design: **values are stored and computed in
 * Latin digits and converted at the render boundary**. A Persian digit in the
 * database is a defect — it breaks sorting, comparison and every parse.
 */

/** U+0030–U+0039. */
export const LATIN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * A digit's value, 0–9.
 *
 * The return type of `digitIndexOf` is this union rather than `number`, and that
 * is what makes the Persian lookup below total: `PERSIAN_BY_DIGIT[index]` is a
 * `string` with no `undefined` in its type, so there is no `?? fallback` branch to
 * write — and a fallback branch that cannot be taken is a branch no test can cover,
 * which under `10-testing-strategy.md` §11's blocking 100% branch target is a
 * permanently failing build rather than a safety net.
 */
type DigitIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** U+06F0–U+06F9 — Persian (Extended Arabic-Indic). The product's digits. */
export const PERSIAN_BY_DIGIT: Readonly<Record<DigitIndex, string>> = {
  0: '۰',
  1: '۱',
  2: '۲',
  3: '۳',
  4: '۴',
  5: '۵',
  6: '۶',
  7: '۷',
  8: '۸',
  9: '۹',
}

/**
 * The Persian digits in order, derived from `PERSIAN_BY_DIGIT`.
 *
 * Derived rather than written twice, so the record and the array cannot disagree
 * about which glyph is which digit — the one mistake in this file that would be
 * invisible in review and wrong in every number the product renders.
 */
export const PERSIAN_DIGITS = [
  PERSIAN_BY_DIGIT[0],
  PERSIAN_BY_DIGIT[1],
  PERSIAN_BY_DIGIT[2],
  PERSIAN_BY_DIGIT[3],
  PERSIAN_BY_DIGIT[4],
  PERSIAN_BY_DIGIT[5],
  PERSIAN_BY_DIGIT[6],
  PERSIAN_BY_DIGIT[7],
  PERSIAN_BY_DIGIT[8],
  PERSIAN_BY_DIGIT[9],
] as const

/** U+0660–U+0669 — Arabic-Indic. Accepted on input, never produced. */
export const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const

/** U+FF10–U+FF19 — full-width. Accepted on input, never produced. */
export const FULLWIDTH_DIGITS = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'] as const

/** U+066C ARABIC THOUSANDS SEPARATOR — the separator §4.1 mandates. */
export const PERSIAN_THOUSANDS_SEPARATOR = '٬'

/** U+066B ARABIC DECIMAL SEPARATOR. */
export const PERSIAN_DECIMAL_SEPARATOR = '٫'

/** U+200C ZERO WIDTH NON-JOINER — meaningful in Persian, noise in a number. */
export const ZWNJ = '‌'

/** U+200D ZERO WIDTH JOINER. */
export const ZWJ = '‍'

/**
 * A character's value in any of the four digit systems, or `-1`.
 *
 * `charCodeAt(0)` rather than `codePointAt(0)`: a digit is always in the Basic
 * Multilingual Plane, and the four ranges below are tested with `>=`/`<=` against
 * a number. `charCodeAt` returns `NaN` for an empty string, every comparison
 * against `NaN` is false, and the function falls through to `-1` — so there is no
 * "empty input" branch to write and none to leave uncovered. An astral character
 * yields a surrogate half, which is in none of the ranges, so it is `-1` too.
 */
function digitIndexOf(char: string): DigitIndex | -1 {
  const code = char.charCodeAt(0)
  if (code >= 0x30 && code <= 0x39) return (code - 0x30) as DigitIndex // 0-9
  if (code >= 0x6f0 && code <= 0x6f9) return (code - 0x6f0) as DigitIndex // ۰-۹
  if (code >= 0x660 && code <= 0x669) return (code - 0x660) as DigitIndex // ٠-٩
  if (code >= 0xff10 && code <= 0xff19) return (code - 0xff10) as DigitIndex // ０-９
  return -1
}

/**
 * Every recognised digit character mapped to its Persian form.
 *
 * Built once rather than matched per character: `toPersianDigits` runs on every
 * rendered number, and a regex with four alternations is measurably slower than
 * a `Map` lookup on a code point already in hand.
 */
const TO_PERSIAN = new Map<string, string>(
  [...ARABIC_INDIC_DIGITS, ...FULLWIDTH_DIGITS, ...LATIN_DIGITS].map((char) => [
    char,
    // The cast is sound by construction: every character in the three sets above
    // came from `digitIndexOf`'s own ranges, so the result is never `-1`.
    PERSIAN_BY_DIGIT[digitIndexOf(char) as DigitIndex],
  ]),
)

/** `true` when `value` is a digit in any of the four recognised forms. */
export function isDigit(value: string): boolean {
  return value.length === 1 && digitIndexOf(value) !== -1
}

/** `true` when `value` is one of ۰۱۲۳۴۵۶۷۸۹. */
export function isPersianDigit(value: string): boolean {
  const code = value.codePointAt(0)
  return value.length === 1 && code !== undefined && code >= 0x6f0 && code <= 0x6f9
}

/** Matches a single Latin digit. Exported for the i18n check and for tests. */
export const LATIN_DIGIT_PATTERN = /[0-9]/

/** Matches a run of one or more Latin digits. */
export const LATIN_DIGIT_RUN_PATTERN = /[0-9]+/

/**
 * `true` when the string contains a Latin digit.
 *
 * This is the assertion behind `07-localization.md` §9's "no Latin digits in any
 * rendered surface": the test scans rendered output and fails on a match. It
 * lives here, beside the conversion, so the check and the fix cannot drift.
 */
export function containsLatinDigits(value: string): boolean {
  return LATIN_DIGIT_PATTERN.test(value)
}

/** `true` when the string contains a Persian digit. */
export function containsPersianDigits(value: string): boolean {
  for (const char of value) {
    if (isPersianDigit(char)) return true
  }
  return false
}

/**
 * Converts every recognised digit — Latin, Persian, Arabic-Indic or full-width —
 * to its **Persian** form. Nothing else in the string is touched: letters,
 * separators, signs and punctuation pass through unchanged.
 *
 * This is a character mapping, not a formatter. It does **not** insert the `٬`
 * thousands separator and it does not localise a decimal point — that is
 * `formatNumber` in `format.ts`, which composes this function. Keeping the two
 * separate is what lets `toPersianDigits` be used on a value that must stay
 * machine-shaped while displaying in Persian digits, such as a phone number.
 *
 * A non-finite `number` throws rather than rendering «NaN» to a user: by the time
 * a value reaches here it is a value the product intends to display, so a
 * non-finite one is a defect upstream and must be found there.
 */
export function toPersianDigits(value: string | number | bigint): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError(`Cannot render ${String(value)} in Persian digits`)
  }
  const source = typeof value === 'string' ? value : value.toString()
  let result = ''
  for (const char of source) {
    result += TO_PERSIAN.get(char) ?? char
  }
  return result
}

/**
 * Converts every recognised digit to its **Latin** form.
 *
 * §4.1: "for input parsing, never for display". Use this to compare or parse a
 * value a person typed; use `toPersianDigits` to show one.
 */
export function toLatinDigits(value: string): string {
  let result = ''
  for (const char of value) {
    const index = digitIndexOf(char)
    result += index === -1 ? char : String(index)
  }
  return result
}

/**
 * The input normaliser for a numeric field (`07-localization.md` §4.1).
 *
 * "A user may type Persian or Latin digits; the input normaliser converts to
 * Latin before validation, so a value typed as «۱۲۳» and a value typed as `123`
 * are the same value. A form that rejects Persian-digit input is a defect — it
 * is the natural way a Persian speaker types a number."
 *
 * On top of the digit conversion it removes what a person typing an amount
 * naturally includes and a parser cannot read:
 *
 * - the grouping separators `٬` and `,`, which carry no value;
 * - ZWNJ and ZWJ, which some Persian keyboards insert and which would otherwise
 *   make `«۱۲ ۳»` and `«۱۲۳»` different values;
 * - the decimal separator `٫`, mapped to `.` so `Number`/`BigInt` can read it.
 *
 * The result is a string `BigInt` or `Number` can parse directly. It is **not**
 * a display value — passing it to `toPersianDigits` is what renders it.
 */
export function normalizeDigits(value: string): string {
  return toLatinDigits(value)
    .replaceAll(PERSIAN_THOUSANDS_SEPARATOR, '')
    .replaceAll(',', '')
    .replaceAll(ZWNJ, '')
    .replaceAll(ZWJ, '')
    .replaceAll(PERSIAN_DECIMAL_SEPARATOR, '.')
    .trim()
}
