/**
 * Persian-aware text normalisation.
 *
 * `01-tech-stack.md` §8.4 gives this file its three cases, and each is a `describe`
 * below:
 *
 * | §8.4's case | Where |
 * |---|---|
 * | A user typing `ي` or `ك` must find `ی` and `ک` | "letter folding" |
 * | «سه‌شنبه» and «سه شنبه» are the same word | "whitespace and joiners" |
 * | A user typing `۱۲۳` must find `123` | "digits" |
 *
 * The tests assert the **equivalence classes** rather than the individual folds,
 * because the pairs are what the search depends on: a table with `['ي','ی']`
 * reversed still passes a test that checks each fold in isolation, and still fails
 * every search a Persian speaker makes.
 *
 * `normalizeMobile` is the other half of the file and the reason the fold table is
 * not the whole story: `Customer` is unique on `(tenantId, mobile)`, so the four
 * spellings of one subscriber have to collapse to one stored value or the unique
 * constraint enforces nothing.
 */

import { describe, expect, it } from 'vitest'

import { ZWJ, ZWNJ } from '../digits'
import { isValidMobile, normalizeForSearch, normalizeMobile } from '../normalize'

/** ARABIC TATWEEL — a decorative elongation with no sound. */
const TATWEEL = 'ـ'

/** A single fatha, a harakat mark rather than a letter. */
const FATHA = 'َ'

/* ── Letter folding ───────────────────────────────────────────────────────── */

describe('letter folding', () => {
  it('folds Arabic Yeh and Alef Maksura to the Persian Yeh', () => {
    // §8.4: "A user typing `ي` (Arabic Yeh) or `ك` (Arabic Kaf) must find a record
    // stored with `ی` and `ک`."
    expect(normalizeForSearch('علي')).toBe(normalizeForSearch('علی'))
    expect(normalizeForSearch('على')).toBe(normalizeForSearch('علی'))
    expect(normalizeForSearch('علي')).toBe('علی')
  })

  it('folds Arabic Kaf to the Persian Keheh', () => {
    expect(normalizeForSearch('كتاب')).toBe(normalizeForSearch('کتاب'))
    expect(normalizeForSearch('كتاب')).toBe('کتاب')
  })

  it('folds the alef forms to a bare alef', () => {
    // Someone searching for «احمد» may type any of the four spellings.
    const target = normalizeForSearch('احمد')
    for (const spelling of ['احمد', 'أحمد', 'إحمد', 'ٱحمد', 'آحمد']) {
      expect(normalizeForSearch(spelling)).toBe(target)
    }
  })

  it('folds the heh forms to a bare heh', () => {
    // «خانۀ» and «خانه» are the same word to a reader.
    const target = normalizeForSearch('خانه')
    expect(normalizeForSearch('خانۀ')).toBe(target)
    expect(normalizeForSearch('خانة')).toBe(target)
  })

  it('folds the hamza carriers to their base letters', () => {
    const purpose = normalizeForSearch('مسیول')
    expect(normalizeForSearch('مسئول')).toBe(purpose)
    expect(normalizeForSearch('مسيول')).toBe(purpose)
    expect(normalizeForSearch('مؤسسه')).toBe(normalizeForSearch('موسسه'))
  })

  it('folds ARABIC TATWEEL away entirely', () => {
    // `\p{L}` matches tatweel — its category is `Lm`, not a mark — so the strip in
    // the last step would leave it in place and «مـتن» would not match «متن». It is
    // mapped to nothing in the fold table for that reason.
    expect(normalizeForSearch(`م${TATWEEL}${TATWEEL}${TATWEEL}تن`)).toBe(normalizeForSearch('متن'))
  })

  it('removes the harakat, which are marks and not letters', () => {
    expect(normalizeForSearch(`م${FATHA}تن`)).toBe(normalizeForSearch('متن'))
  })
})

/* ── Whitespace and joiners ───────────────────────────────────────────────── */

describe('whitespace and joiners', () => {
  it('makes the three spellings of سه‌شنبه one string', () => {
    // §8.4's example, and the reason step 5 removes whitespace rather than folding
    // ZWNJ to a space: a single `LIKE '%…%'` cannot match three spellings.
    const joined = normalizeForSearch(`سه${ZWNJ}شنبه`)
    expect(normalizeForSearch('سه شنبه')).toBe(joined)
    expect(normalizeForSearch(`سه${ZWJ}شنبه`)).toBe(joined)
    expect(normalizeForSearch('سه‌شنبه')).toBe(joined)
  })

  it('stores a space-bearing name as one run of letters', () => {
    // «علی رضایی» and «علیرضایی» both store as `علیرضایی`, so a search for «رضایی»
    // finds either.
    expect(normalizeForSearch('علی رضایی')).toBe('علیرضایی')
    expect(normalizeForSearch('علیرضایی')).toBe('علیرضایی')
    expect(normalizeForSearch('  علی   رضایی  ')).toBe('علیرضایی')
  })

  it('keeps a substring search working on the stored form', () => {
    // The contract the query builder relies on: `%…%` against the stored value.
    expect(normalizeForSearch('علیرضایی').includes(normalizeForSearch('رضایی'))).toBe(true)
  })
})

/* ── Digits and Latin ─────────────────────────────────────────────────────── */

describe('digits and Latin text', () => {
  it('converts Persian, Arabic-Indic and full-width digits to Latin', () => {
    expect(normalizeForSearch('۱۲۳')).toBe('123')
    expect(normalizeForSearch('١٢٣')).toBe('123')
    expect(normalizeForSearch('１２３')).toBe('123')
  })

  it('lower-cases a Latin run so a search is case-insensitive', () => {
    expect(normalizeForSearch('Ali Rezaei')).toBe(normalizeForSearch('ali rezaei'))
    expect(normalizeForSearch('Ali Rezaei')).toBe('alirezaei')
  })

  it('strips punctuation and separators', () => {
    expect(normalizeForSearch('0912-345-6789')).toBe('09123456789')
    expect(normalizeForSearch('a.b, c')).toBe('abc')
    expect(normalizeForSearch('نام (توضیح)')).toBe(normalizeForSearch('نام توضیح'))
  })

  it('keeps Latin and Persian letters in a mixed string', () => {
    // `\p{L}` privileges no script, which matters for a clinic whose records carry
    // both.
    expect(normalizeForSearch('Dr. علی 2')).toBe('drعلی2')
  })

  it('returns an empty string for input with no letters or digits', () => {
    expect(normalizeForSearch('')).toBe('')
    expect(normalizeForSearch('   ')).toBe('')
    expect(normalizeForSearch('---')).toBe('')
  })

  it('is idempotent', () => {
    // The query and the stored column are put through the same function, so a
    // second pass over an already-normalised value must change nothing.
    for (const value of ['علي رضایی', 'سه‌شنبه', 'A.B ۱۲۳', 'متن']) {
      const once = normalizeForSearch(value)
      expect(normalizeForSearch(once)).toBe(once)
    }
  })
})

/* ── Mobile ───────────────────────────────────────────────────────────────── */

describe('normalizeMobile', () => {
  it('collapses the four spellings of one subscriber to the stored shape', () => {
    // `03-data-model.md` §2.1: "`mobile` (normalised, digits only, stored
    // `09xxxxxxxxx`)". Without this, the unique constraint over `(tenantId, mobile)`
    // permits four rows for one person.
    const stored = '09123456789'
    for (const input of [
      '09123456789',
      '۰۹۱۲۳۴۵۶۷۸۹',
      '9123456789',
      '+989123456789',
      '989123456789',
      '00989123456789',
    ]) {
      expect(normalizeMobile(input)).toBe(stored)
    }
  })

  it('strips the separators a person types or a form accepts', () => {
    const stored = '09123456789'
    for (const input of [
      '0912 345 6789',
      '0912-345-6789',
      '0912.345.6789',
      '۰۹۱۲ ۳۴۵ ۶۷۸۹',
      '  09123456789  ',
      '0098 912 345 6789',
    ]) {
      expect(normalizeMobile(input)).toBe(stored)
    }
  })

  it('returns an eleven-digit value, never twelve', () => {
    // The bug this guards against: rebuilding the stored form by prepending `09`
    // instead of the trunk prefix `0`, which yields `099123456789` — a number no
    // `MOBILE_PATTERN` matches, so every stored mobile would be invalid.
    const stored = normalizeMobile('9123456789')
    expect(stored).toHaveLength(11)
    expect(stored.startsWith('09')).toBe(true)
    expect(isValidMobile(stored)).toBe(true)
  })

  it('returns an unrecognisable value unshaped rather than inventing a number', () => {
    // It does not validate and it does not throw. The schema rejects the *result*
    // with a Persian sentence, which is something the user can fix, instead of the
    // request failing with an exception, which is not.
    expect(normalizeMobile('12345')).toBe('12345')
    expect(normalizeMobile('')).toBe('')
    expect(normalizeMobile('not a number')).toBe('')
    expect(normalizeMobile('0812345678')).toBe('0812345678')
  })

  it('leaves a too-long international number unshaped rather than truncating it', () => {
    // A number with the country code and an extra digit is not this country's, and
    // cutting it to ten would turn someone else's number into a plausible local one.
    expect(normalizeMobile('009891234567890')).toBe('009891234567890')
  })

  it('feeds isValidMobile, which accepts only the stored shape', () => {
    expect(isValidMobile('09123456789')).toBe(true)
    expect(isValidMobile('9123456789')).toBe(false)
    expect(isValidMobile('0912345678')).toBe(false)
    expect(isValidMobile('08123456789')).toBe(false)
    expect(isValidMobile('091234567890')).toBe(false)
    expect(isValidMobile('')).toBe(false)
  })
})
