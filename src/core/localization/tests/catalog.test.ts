/**
 * The shared labels.
 *
 * `07-localization.md` §7.2 makes the catalog "a plain object, not a runtime lookup
 * with a fallback chain". There is therefore nothing to test about *how* a label is
 * found — a missing one does not compile — so this file tests the two things that
 * can still be wrong when it does compile:
 *
 * 1. **The text itself.** A month name misspelled, or two month names swapped, is a
 *    compile-clean change that renders wrong on every screen in the product.
 * 2. **The invisible characters.** «سه‌شنبه» carries a ZWNJ, and a ZWNJ that goes
 *    missing takes the spelling with it while leaving the file looking correct in
 *    every editor and every diff. This is the one defect in this directory that
 *    review cannot catch, which is why the assertions below are written with
 *    explicit `‌` escapes rather than with the character itself: a test that
 *    depends on an invisible character surviving a copy-paste is a test that can
 *    itself be silently broken by the fix it is meant to protect.
 *
 * The escape is not decoration either. `ZWNJ` is spelled through the constant in
 * `common.ts` so the source says which character is meant, and the assertion here
 * checks the constant against the code point so that a wrong character in
 * `digits.ts` — the other way this can break — fails in one place instead of
 * quietly in every string built from it.
 */

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLES } from '@/core/constants'

import {
  CURRENCY_TOMAN_LABEL,
  MONTH_NAMES,
  MONTH_NAMES_IN_ORDER,
  PERCENT_LABEL,
  PERMISSION_LABELS,
  RELATIVE_LABELS,
  ROLE_LABELS,
  VALIDATION_MESSAGES,
  WEEKDAY_NAMES,
  WEEKDAY_NAMES_IN_ORDER,
  ZWNJ,
  type CoreMessageKey,
  type JalaliMonth,
  type WeekdayIndex,
  monthName,
  weekdayName,
} from '../index'
import { JALALI_MONTHS, WEEKDAY_INDEXES } from '../types'

/* ── Months ───────────────────────────────────────────────────────────────── */

describe('MONTH_NAMES', () => {
  it('names all twelve months, in order, from فروردین', () => {
    // Written out in full rather than derived: this is the assertion that catches a
    // swapped pair, and a list derived from the record under test could not.
    const expected = [
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
    for (const [index, name] of expected.entries()) {
      expect(MONTH_NAMES[(index + 1) as JalaliMonth]).toBe(name)
    }
  })

  it('has exactly twelve entries and no key outside 1–12', () => {
    const keys = Object.keys(MONTH_NAMES).map(Number)
    expect(keys).toHaveLength(12)
    expect([...keys].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('contains no ZWNJ, because no month name is a compound', () => {
    // The counterpart to the weekday assertion below: a ZWNJ added here by a
    // find-and-replace over Persian text would be just as invisible and just as
    // wrong, so the absence is asserted rather than assumed.
    for (const month of JALALI_MONTHS) {
      expect(MONTH_NAMES[month]).not.toContain('‌')
    }
  })

  it('names each month distinctly', () => {
    // A duplicate would mean two months share a name, which is how a copy-paste
    // error in this block presents — and it would still satisfy every per-key check.
    expect(new Set(MONTH_NAMES_IN_ORDER).size).toBe(12)
  })
})

describe('MONTH_NAMES_IN_ORDER', () => {
  it('walks the months in calendar order', () => {
    expect(MONTH_NAMES_IN_ORDER).toEqual(JALALI_MONTHS.map((month) => MONTH_NAMES[month]))
    expect(MONTH_NAMES_IN_ORDER[0]).toBe('فروردین')
    expect(MONTH_NAMES_IN_ORDER[11]).toBe('اسفند')
  })
})

describe('monthName', () => {
  it('returns the name for a month in range', () => {
    expect(monthName(1)).toBe('فروردین')
    expect(monthName(6)).toBe('شهریور')
    expect(monthName(12)).toBe('اسفند')
  })

  it('agrees with the record it reads from', () => {
    for (const month of JALALI_MONTHS) {
      expect(monthName(month)).toBe(MONTH_NAMES[month])
    }
  })

  it('throws for a month that does not exist rather than rendering a blank', () => {
    // The month arrives from arithmetic — `jalaliMonthOf`, a query parameter, a
    // settings field — so an out-of-range value is a defect upstream. §7 of
    // `05-conventions.md` applies: fail loudly, never return a value that looks
    // like data. A silent empty string would render as a missing month on a report.
    for (const month of [0, 13, -1, 1.5, Number.NaN]) {
      expect(() => monthName(month)).toThrow(RangeError)
    }
  })
})

/* ── Weekdays ─────────────────────────────────────────────────────────────── */

describe('WEEKDAY_NAMES', () => {
  it('places شنبه at index 0, not Sunday', () => {
    // `07-localization.md` §6.4: "The week starting on Saturday is a behavioural
    // requirement, not a formatting one." Index 0 is شنبه for the whole product, and
    // this assertion is where that convention is pinned down.
    expect(WEEKDAY_NAMES[0]).toBe('شنبه')
    expect(WEEKDAY_NAMES[6]).toBe('جمعه')
  })

  it('names all seven days in order', () => {
    const expected = [
      'شنبه',
      'یک‌شنبه',
      'دو‌شنبه',
      'سه‌شنبه',
      'چهار‌شنبه',
      'پنج‌شنبه',
      'جمعه',
    ]
    for (const [index, name] of expected.entries()) {
      expect(WEEKDAY_NAMES[index as WeekdayIndex]).toBe(name)
    }
  })

  it('carries a real ZWNJ (U+200C) in every compound name', () => {
    // The assertion this file exists for. `01-tech-stack.md` §8.4 uses «سه‌شنبه» as
    // its worked example of why normalisation exists, so the product writes the
    // joined spelling — and a ZWNJ that goes missing leaves «سهشنبه», which reads as
    // a spacing error and is a *different string* from the one the normaliser and the
    // search index agree on.
    //
    // Checked by code point rather than by comparing against a literal, so the test
    // cannot be defeated by the same invisible-character loss it is guarding.
    for (const index of [1, 2, 3, 4, 5] as const) {
      const name = WEEKDAY_NAMES[index]
      expect(name.includes('‌')).toBe(true)
      expect([...name].map((char) => char.codePointAt(0))).toContain(0x200c)
    }
    // And the two names §8.4 names, spelled out character by character.
    expect(WEEKDAY_NAMES[3]).toBe('سه‌شنبه')
    expect(WEEKDAY_NAMES[5]).toBe('پنج‌شنبه')
  })

  it('carries no ZWNJ in the two names that are single words', () => {
    expect(WEEKDAY_NAMES[0]).toBe('شنبه')
    expect(WEEKDAY_NAMES[0]).not.toContain('‌')
    expect(WEEKDAY_NAMES[6]).toBe('جمعه')
    expect(WEEKDAY_NAMES[6]).not.toContain('‌')
  })

  it('reads ZWNJ as U+200C, so the interpolations in common.ts build the right string', () => {
    // `common.ts` writes `سه${ZWNJ}شنبه` rather than the literal character. That is
    // only correct if the constant is the character it claims to be, and this is the
    // one assertion that checks the constant against the code point rather than
    // against itself.
    expect(ZWNJ).toBe('‌')
    expect(ZWNJ).toHaveLength(1)
    expect(ZWNJ.codePointAt(0)).toBe(0x200c)
  })

  it('has exactly seven entries and no key outside 0–6', () => {
    const keys = Object.keys(WEEKDAY_NAMES).map(Number)
    expect(keys).toHaveLength(7)
    expect([...keys].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('names each day distinctly', () => {
    expect(new Set(WEEKDAY_NAMES_IN_ORDER).size).toBe(7)
  })
})

describe('WEEKDAY_NAMES_IN_ORDER', () => {
  it('walks the week from شنبه to جمعه', () => {
    expect(WEEKDAY_NAMES_IN_ORDER).toEqual(WEEKDAY_INDEXES.map((index) => WEEKDAY_NAMES[index]))
    expect(WEEKDAY_NAMES_IN_ORDER[0]).toBe('شنبه')
    expect(WEEKDAY_NAMES_IN_ORDER[6]).toBe('جمعه')
    expect(WEEKDAY_NAMES_IN_ORDER).toHaveLength(7)
  })
})

describe('weekdayName', () => {
  it('returns the name for an index', () => {
    expect(weekdayName(0)).toBe('شنبه')
    expect(weekdayName(3)).toBe('سه‌شنبه')
    expect(weekdayName(6)).toBe('جمعه')
  })

  it('agrees with the record it reads from', () => {
    for (const index of WEEKDAY_INDEXES) {
      expect(weekdayName(index)).toBe(WEEKDAY_NAMES[index])
    }
  })
})

/* ── Relative dates ───────────────────────────────────────────────────────── */

describe('RELATIVE_LABELS', () => {
  it('holds the words §6.4 builds its phrases from', () => {
    // §6.4's own example set: «امروز · فردا · دیروز · ۳ روز پیش · ۲ هفته دیگر». The
    // words are separate because Persian puts the count between them, so
    // «۲ هفته دیگر» is assembled from `weekUnit` and `future` rather than stored.
    expect(RELATIVE_LABELS.today).toBe('امروز')
    expect(RELATIVE_LABELS.tomorrow).toBe('فردا')
    expect(RELATIVE_LABELS.yesterday).toBe('دیروز')
    expect(RELATIVE_LABELS.dayUnit).toBe('روز')
    expect(RELATIVE_LABELS.weekUnit).toBe('هفته')
    expect(RELATIVE_LABELS.past).toBe('پیش')
    expect(RELATIVE_LABELS.future).toBe('دیگر')
  })

  it('uses seven distinct words', () => {
    // «پیش» and «دیگر» are the pair that is easiest to paste over, and swapping them
    // would turn every past date into a future one while passing every key check.
    const words = Object.values(RELATIVE_LABELS)
    expect(words).toHaveLength(7)
    expect(new Set(words).size).toBe(7)
    expect(RELATIVE_LABELS.past).not.toBe(RELATIVE_LABELS.future)
  })

  it('carries no ZWNJ and no Latin digit', () => {
    for (const word of Object.values(RELATIVE_LABELS)) {
      expect(word).not.toContain('‌')
      expect(word).not.toMatch(/[0-9]/)
    }
  })
})

/* ── Currency and percent ─────────────────────────────────────────────────── */

describe('CURRENCY_TOMAN_LABEL and PERCENT_LABEL', () => {
  it('names the Toman, which is what §6 displays against a stored Rial value', () => {
    expect(CURRENCY_TOMAN_LABEL).toBe('تومان')
  })

  it('uses the Persian percent sign, U+066A, not the Latin one', () => {
    // `formatPercent` appends this. A Latin `%` in a Persian sentence is the kind of
    // thing that looks almost right and is corrected by every reader who notices.
    expect(PERCENT_LABEL).toBe('٪')
    expect(PERCENT_LABEL).not.toBe('%')
  })
})

/* ── Messages ─────────────────────────────────────────────────────────────── */

describe('VALIDATION_MESSAGES', () => {
  it('has a sentence for every key the layer can raise', () => {
    // The record is typed `Record<CoreMessageKey, string>`, so a *missing* key does
    // not compile. What this catches is the other direction: a key retired from the
    // union but left in the record, which would be dead copy nobody can find.
    const keys: CoreMessageKey[] = [
      'validation.localDate.invalid',
      'validation.localDate.outOfRange',
      'validation.localTime.invalid',
      'validation.relativeDate.missingReference',
      'error.unhandledCase',
      'error.missingMessageValue',
      'error.malformedPermissionOverrides',
    ]
    for (const key of keys) {
      const message = VALIDATION_MESSAGES[key]
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
    }
    expect(Object.keys(VALIDATION_MESSAGES)).toHaveLength(keys.length)
  })

  it('names the fix rather than the fault', () => {
    // `07-localization.md` §8: a message names what to do. None of these may be a bare
    // «خطا» or an English word, and none may carry a sentence-ending full stop that a
    // form field would render mid-sentence. The full stop is reserved for the two
    // whole-line errors, which are shown as a line of their own rather than appended
    // to a field — so the exception is a set, and a new key has to be added to it
    // deliberately rather than inheriting the exemption by accident.
    //
    // Placeholders are stripped before the Latin check. A placeholder is `{` + a
    // Latin identifier + `}` (`message.ts`), so `{min}` and `{max}` are template
    // syntax the renderer replaces — they are never shown to the user, and a ban
    // that counted them would have to permit Latin text by calling it a placeholder.
    // What the ban is after is a word the user *reads*.
    const wholeLineKeys: readonly string[] = [
      'error.unhandledCase',
      'error.missingMessageValue',
      'error.malformedPermissionOverrides',
    ]
    for (const [key, message] of Object.entries(VALIDATION_MESSAGES)) {
      const rendered = message.replace(/\{[^}]*\}/g, '')
      expect(rendered).not.toMatch(/[A-Za-z]/)
      expect(message).not.toBe('خطا')
      if (!wholeLineKeys.includes(key)) {
        expect(message.endsWith('.')).toBe(false)
      }
    }
    // And the set is exhaustive in the other direction: every key that ends in a full
    // stop is one of the three, so the list above cannot go stale.
    for (const [key, message] of Object.entries(VALIDATION_MESSAGES)) {
      if (message.endsWith('.')) expect(wholeLineKeys).toContain(key)
    }
  })

  it('carries a real ZWNJ in the two whole-line error sentences', () => {
    // «غیرمنتظرهای» is the one word in this record that is a compound, and it was
    // authored run together — the shape `docs/knowledge/` uses throughout, since a
    // search for U+200C across the whole specification returns nothing. The product
    // restores standard orthography, as `PERMISSION_LABELS` does for «جابهجایی» and
    // «ماندهحساب», and this is the assertion that says so on purpose.
    //
    // Checked by code point, not by comparing against a literal: a test that depends
    // on an invisible character surviving a copy-paste can itself be broken by the
    // fix it guards, which is the point `WEEKDAY_NAMES` makes.
    for (const key of ['error.unhandledCase', 'error.missingMessageValue'] as const) {
      const message = VALIDATION_MESSAGES[key]
      expect([...message].map((char) => char.codePointAt(0))).toContain(0x200c)
    }
  })

  it('writes every number in its messages in Persian digits', () => {
    // §4: "There is no surface where Latin digits are acceptable." A message is a
    // surface. The out-of-range sentence carries `{min}` and `{max}` placeholders,
    // which the template renderer fills with Persian digits.
    for (const message of Object.values(VALIDATION_MESSAGES)) {
      expect(message).not.toMatch(/[0-9]/)
    }
    expect(VALIDATION_MESSAGES['validation.localTime.invalid']).toContain('۰۹:۳۰')
  })

  it('uses whole-token placeholders in braces, never concatenation', () => {
    // §7.3: a template is never built by joining fragments in code. The placeholders
    // are whole tokens with a name inside, which is what lets the renderer also
    // convert the substituted value to Persian digits.
    const outOfRange = VALIDATION_MESSAGES['validation.localDate.outOfRange']
    expect(outOfRange).toContain('{min}')
    expect(outOfRange).toContain('{max}')
    const placeholders = outOfRange.match(/\{[^}]*\}/g) ?? []
    expect(placeholders).toEqual(['{min}', '{max}'])
  })
})

/* ── The closed sets of 06-constants.md §4 ────────────────────────────────── */

describe('ROLE_LABELS', () => {
  it('names the three roles, as §4.1 writes them', () => {
    expect(ROLE_LABELS.MANAGER).toBe('مدیر')
    expect(ROLE_LABELS.DOCTOR).toBe('پزشک')
    expect(ROLE_LABELS.SECRETARY).toBe('منشی')
  })

  it('has exactly one label per member of ROLES, and no extras', () => {
    // The keys are the stored values — `'MANAGER'`, not a symbol — which is what the
    // database column holds and what `scripts/check-i18n.mjs` reads this file's text
    // to verify. A computed key would be invisible to that check.
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort())
    expect(Object.keys(ROLE_LABELS)).toHaveLength(3)
  })
})

describe('PERMISSION_LABELS', () => {
  it('covers the sixteen permissions in the documented order', () => {
    // §4.2's list, verbatim except for the two ZWNJ restorations the file documents.
    // The order is asserted because `PERMISSIONS` carries it and the settings screen
    // renders the matrix in it — a reorder here would move a row on a screen that
    // decides what staff may do.
    const expected = [
      'دیدن برنامه روز خودش',
      'دیدن برنامه همه پزشکان',
      `ثبت و جابه‌جایی نوبت`,
      'ثبت نتیجه نوبت',
      'دیدن پرونده مراجعین خودش',
      'دیدن پرونده همه مشتریان',
      `دیدن مانده‌حساب`,
      'ثبت دریافت وجه',
      'پیگیری بدهی',
      'دیدن چرخه درمان خودش',
      'اقدام روی چرخه درمان',
      'کارتابل لید',
      'ساخت و اجرای کمپین',
      'تعریف خدمت و قیمت',
      'تغییر تنظیمات کلینیک',
      'مدیریت کاربران و دسترسی',
    ]
    expect(PERMISSIONS.map((permission) => PERMISSION_LABELS[permission])).toEqual(expected)
  })

  it('has exactly one label per member of PERMISSIONS, and no extras', () => {
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...PERMISSIONS].sort())
    expect(Object.keys(PERMISSION_LABELS)).toHaveLength(16)
  })

  it('keys every label by the slug the database stores', () => {
    // The lookup at runtime is `PERMISSION_LABELS[row.permission]`, so the key has to
    // be the stored `String` and not a camel-cased restatement. Asserted against the
    // pattern the slugs follow rather than against a list, so a new permission added
    // with the wrong key shape fails here.
    for (const key of Object.keys(PERMISSION_LABELS)) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(PERMISSIONS).toContain(key)
    }
  })

  it('restores the ZWNJ in the two compound labels §4.2 joins without one', () => {
    // The finding `catalog/enums.ts` documents: a search for U+200C across all of
    // `docs/knowledge/` returns nothing, so «جابهجایی» and «ماندهحساب» arrive from
    // the specification run together. The product renders standard orthography, and
    // this is the assertion that says so on purpose rather than by accident.
    expect(PERMISSION_LABELS.manage_appointments).toBe(`ثبت و جابه‌جایی نوبت`)
    expect(PERMISSION_LABELS.view_debts).toBe(`دیدن مانده‌حساب`)
    expect(PERMISSION_LABELS.manage_appointments.includes('‌')).toBe(true)
    expect(PERMISSION_LABELS.view_debts.includes('‌')).toBe(true)
  })

  it('names each permission distinctly and none of them is the slug', () => {
    // A label that is the slug restated in Latin is the failure this whole layer
    // exists to prevent, and it would render as an English word in a Persian list.
    const labels = Object.values(PERMISSION_LABELS)
    expect(new Set(labels).size).toBe(16)
    for (const label of labels) {
      expect(label).not.toMatch(/[A-Za-z]/)
      expect(label).not.toMatch(/[0-9]/)
    }
  })
})
