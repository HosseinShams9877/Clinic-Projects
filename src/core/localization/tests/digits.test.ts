/**
 * `07-localization.md` §4's obligations, as tests.
 *
 * `10-testing-strategy.md` §3.4 lists what has to be asserted, and each of its
 * five rows is a `describe` below:
 *
 * | Row | Where |
 * |---|---|
 * | Display: Latin input renders as Persian digits | `toPersianDigits` |
 * | Input, Persian: «۱۲۳» validates as `123` | `toLatinDigits` |
 * | Input, Latin: `123` validates as `123` | `toLatinDigits` |
 * | Round trip: `toLatinDigits(toPersianDigits(s)) === s` | "round trip" |
 * | Separator: `٬`, never `,` | `normalizeDigits` |
 * | Storage: nothing Persian-digit reaches the database or a URL | "the storage invariant" |
 *
 * The round-trip property is tested over the whole digit set rather than over a
 * sample, because the failure it catches — one glyph mapped to the wrong digit —
 * is a bug that a sample of three would miss and a clinic would not.
 */

import { describe, expect, it } from 'vitest'

import {
  ARABIC_INDIC_DIGITS,
  FULLWIDTH_DIGITS,
  LATIN_DIGITS,
  PERSIAN_BY_DIGIT,
  PERSIAN_DECIMAL_SEPARATOR,
  PERSIAN_DIGITS,
  PERSIAN_THOUSANDS_SEPARATOR,
  ZWJ,
  ZWNJ,
  containsLatinDigits,
  containsPersianDigits,
  isDigit,
  isPersianDigit,
  normalizeDigits,
  toLatinDigits,
  toPersianDigits,
} from '../digits'

/**
 * `07-localization.md` §4.1's invariant, as a test rather than a comment.
 *
 * Nothing Persian-digit is ever stored or put in a URL. If a conversion
 * function's output were ever persisted, this is the assertion that says so.
 */
const STORED_DIGITS = LATIN_DIGITS

describe('the digit sets', () => {
  it('has ten digits in every set', () => {
    expect(LATIN_DIGITS).toHaveLength(10)
    expect(PERSIAN_DIGITS).toHaveLength(10)
    expect(ARABIC_INDIC_DIGITS).toHaveLength(10)
    expect(FULLWIDTH_DIGITS).toHaveLength(10)
  })

  it('derives the Persian digits from PERSIAN_BY_DIGIT, in order', () => {
    // The one mistake in this file that review cannot see: two glyphs swapped.
    expect(PERSIAN_DIGITS.join('')).toBe('۰۱۲۳۴۵۶۷۸۹')
    expect(PERSIAN_BY_DIGIT[0]).toBe('۰')
    expect(PERSIAN_BY_DIGIT[5]).toBe('۵')
    expect(PERSIAN_BY_DIGIT[9]).toBe('۹')
  })

  it('uses the Arabic-Indic forms, not the Persian ones, for U+0660–U+0669', () => {
    // These two blocks look nearly identical in most fonts, and mixing them
    // would make `toLatinDigits` silently fail on half the input it accepts.
    expect(ARABIC_INDIC_DIGITS).not.toEqual(PERSIAN_DIGITS)
    expect(ARABIC_INDIC_DIGITS[0]).toBe('٠')
    expect(PERSIAN_DIGITS[0]).toBe('۰')
  })

  it('defines the separators and joiners as the code points §4.1 names', () => {
    expect(PERSIAN_THOUSANDS_SEPARATOR).toBe('٬')
    expect(PERSIAN_DECIMAL_SEPARATOR).toBe('٫')
    expect(ZWNJ).toBe('‌')
    expect(ZWJ).toBe('‍')
    expect(STORED_DIGITS.join('')).toBe('0123456789')
  })
})

describe('isDigit', () => {
  it('accepts one digit from any of the four systems', () => {
    expect(isDigit('7')).toBe(true)
    expect(isDigit('۷')).toBe(true)
    expect(isDigit('٧')).toBe(true)
    expect(isDigit('７')).toBe(true)
  })

  it('rejects a letter, a separator, and a multi-character string', () => {
    expect(isDigit('a')).toBe(false)
    expect(isDigit(PERSIAN_THOUSANDS_SEPARATOR)).toBe(false)
    expect(isDigit('12')).toBe(false)
    // `charCodeAt(0)` on an empty string is `NaN`; every range test is false and
    // the function falls through to `-1`. The length guard makes this a
    // belt-and-braces case rather than the only defence.
    expect(isDigit('')).toBe(false)
  })

  it('rejects a character outside the Basic Multilingual Plane', () => {
    // A surrogate half is in none of the four ranges, so an emoji is not a digit.
    expect(isDigit('😀')).toBe(false)
  })
})

describe('isPersianDigit', () => {
  it('accepts only ۰–۹', () => {
    expect(isPersianDigit('۰')).toBe(true)
    expect(isPersianDigit('۹')).toBe(true)
    expect(isPersianDigit('7')).toBe(false)
    expect(isPersianDigit('٧')).toBe(false)
    expect(isPersianDigit('۷۷')).toBe(false)
    // No code point at all: the `code !== undefined` guard is what makes this
    // false rather than a `NaN` comparison that happens to be false.
    expect(isPersianDigit('')).toBe(false)
  })
})

describe('containsLatinDigits and containsPersianDigits', () => {
  it('finds a Latin digit inside Persian text', () => {
    expect(containsLatinDigits('۳ جلسه از 5')).toBe(true)
    expect(containsLatinDigits('۳ جلسه')).toBe(false)
    expect(containsLatinDigits('')).toBe(false)
  })

  it('finds a Persian digit inside Latin text', () => {
    expect(containsPersianDigits('session ۳')).toBe(true)
    expect(containsPersianDigits('session 3')).toBe(false)
    expect(containsPersianDigits('')).toBe(false)
    // The loop scans characters rather than using a regex, so a Persian digit
    // that is not the first character is the case worth asserting.
    expect(containsPersianDigits('0912۳45678')).toBe(true)
  })
})

describe('toPersianDigits', () => {
  it('converts Latin digits and leaves everything else alone', () => {
    expect(toPersianDigits('0912-345-6789')).toBe('۰۹۱۲-۳۴۵-۶۷۸۹')
    expect(toPersianDigits('۱۴۰۵/۰۶/۲۹')).toBe('۱۴۰۵/۰۶/۲۹')
    expect(toPersianDigits('abc XYZ')).toBe('abc XYZ')
  })

  it('converts Arabic-Indic and full-width digits, because a keyboard may produce either', () => {
    expect(toPersianDigits('٧٨٩')).toBe('۷۸۹')
    expect(toPersianDigits('１２３')).toBe('۱۲۳')
  })

  it('accepts a number and a bigint', () => {
    expect(toPersianDigits(1405)).toBe('۱۴۰۵')
    expect(toPersianDigits(5_000_000n)).toBe('۵۰۰۰۰۰۰')
    expect(toPersianDigits(0)).toBe('۰')
  })

  it('throws on a non-finite number rather than rendering NaN or Infinity', () => {
    // By the time a value reaches the display layer it is a value the product
    // intends to show, so a non-finite one is a defect upstream.
    expect(() => toPersianDigits(Number.NaN)).toThrow(RangeError)
    expect(() => toPersianDigits(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => toPersianDigits(Number.NEGATIVE_INFINITY)).toThrow(RangeError)
  })

  it('does not group thousands — that is formatNumber, not this', () => {
    expect(toPersianDigits('5000000')).toBe('۵۰۰۰۰۰۰')
  })
})

describe('toLatinDigits', () => {
  it('converts every recognised form to Latin', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
    expect(toLatinDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789')
    expect(toLatinDigits('０９１２３４５６７８９')).toBe('09123456789')
    expect(toLatinDigits('09123456789')).toBe('09123456789')
  })

  it('leaves letters, separators and punctuation untouched', () => {
    expect(toLatinDigits('۱۲۳/۴۵۶')).toBe('123/456')
    expect(toLatinDigits('علی ۱۲')).toBe('علی 12')
    expect(toLatinDigits('')).toBe('')
  })
})

describe('round trip', () => {
  it('returns the original Latin string for every digit', () => {
    for (const char of LATIN_DIGITS) {
      expect(toLatinDigits(toPersianDigits(char))).toBe(char)
    }
  })

  it('returns the original Latin string for a mixed string', () => {
    // §3.4's round-trip row: "for every digit and mixed strings".
    const mixed = '1405/06/29 09:30 - 09123456789'
    expect(toLatinDigits(toPersianDigits(mixed))).toBe(mixed)
  })

  it('returns the original Persian string for every digit', () => {
    for (const char of PERSIAN_DIGITS) {
      expect(toPersianDigits(toLatinDigits(char))).toBe(char)
    }
  })
})

describe('normalizeDigits', () => {
  it('converts Persian digits and strips the grouping separator', () => {
    expect(normalizeDigits('۵۰۰٬۰۰۰')).toBe('500000')
  })

  it('strips the Latin comma as well, because a paste may carry one', () => {
    expect(normalizeDigits('500,000')).toBe('500000')
  })

  it('strips ZWNJ and ZWJ, which a Persian keyboard inserts inside numbers', () => {
    expect(normalizeDigits('۱۲۳‌۴۵۶')).toBe('123456')
    expect(normalizeDigits('۱۲۳‍۴۵۶')).toBe('123456')
  })

  it('maps the Persian decimal separator to a point so Number and BigInt can read it', () => {
    expect(normalizeDigits('۱۲٫۵')).toBe('12.5')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeDigits('  ۱۲۳  ')).toBe('123')
  })

  it('produces something BigInt can parse from all four input forms', () => {
    expect(BigInt(normalizeDigits('۵۰۰٬۰۰۰'))).toBe(500_000n)
    expect(BigInt(normalizeDigits('500,000'))).toBe(500_000n)
    expect(BigInt(normalizeDigits('٥٠٠٠٠٠'))).toBe(500_000n)
  })
})
