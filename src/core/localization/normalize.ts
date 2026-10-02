/**
 * Persian-aware text normalisation, for the places the product compares a string
 * a person typed against a string the product stored.
 *
 * `01-tech-stack.md` §8.4 names this file and states the problem exactly: cmdk's
 * default filter is "a substring match on the raw string, which is wrong for this
 * product in three ways… A user typing `ي` (Arabic Yeh) or `ك` (Arabic Kaf) must
 * find a record stored with `ی` and `ک`… «سهشنبه» and «سه شنبه» are the same word
 * to a reader and different strings to a filter… A user typing `۱۲۳` must find
 * `123`."
 *
 * The same three problems break `searchName` (`03-data-model.md` §5: "`LIKE` with
 * a normalised `searchName` column", the portable stand-in for `tsvector`). The
 * column holds the output of `normalizeForSearch`; the query is put through the
 * same function before it reaches `LIKE`. One function, two consumers, so the
 * stored form and the searched form cannot drift apart.
 */

import {
  MOBILE_COUNTRY_CODE,
  MOBILE_NATIONAL_LENGTH,
  MOBILE_TRUNK_PREFIX,
} from '@/core/constants'

import { normalizeDigits, toLatinDigits } from './digits'
import { MOBILE_PATTERN } from './types'

/* ── Letter folding ───────────────────────────────────────────────────────── */

/**
 * Characters that are *different* to a string comparison and *the same* to a
 * Persian reader.
 *
 * Grouped by the reason each entry exists, because a table like this is otherwise
 * indistinguishable from a table someone added a typo to:
 *
 * - **Yeh and Kaf.** U+064A ARABIC YEH and U+0649 ALEF MAKSURA are what an Arabic
 *   keyboard produces; U+06CC is the Persian letter. U+0643 ARABIC KAF against
 *   U+06A9 KEHEH is the same split. §8.4 calls this case out by name.
 * - **Alef.** The hamza-bearing forms and the madda are one letter to a reader
 *   searching for «احمد» who types «أحمد». Folding them is what makes the search
 *   useful, and it applies to the search form only, so a stored *name* keeps its
 *   own spelling.
 * - **Heh.** U+0629 TEH MARBUTA and U+06C0 HEH WITH YEH ABOVE are written where a
 *   reader looks for U+0647 — «خانۀ» and «خانه» are the same word.
 * - **Hamza carriers.** U+0626 and U+0624 fold to their base letters for the same
 *   reason as the alef forms. This is the most aggressive fold in the table: it
 *   makes «مسئول» and «مسيول» match, which is what someone typing quickly expects,
 *   and it never changes what is stored or displayed.
 * - **Tatweel.** U+0640 is a decorative elongation with no sound — «مـتن» and «متن»
 *   are the same word. It has to be listed explicitly rather than left to the strip
 *   in step 5, because its Unicode category is `Lm` (letter, modifier) and `\p{L}`
 *   therefore matches it. The harakat below it in the block are `Mn` (marks) and are
 *   removed by the strip, which is why they need no entry here.
 */
const LETTER_FOLDS = new Map<string, string>([
  // Yeh and Kaf
  ['ي', 'ی'],
  ['ى', 'ی'],
  ['ك', 'ک'],
  // Alef
  ['آ', 'ا'],
  ['أ', 'ا'],
  ['إ', 'ا'],
  ['ٱ', 'ا'],
  // Heh
  ['ة', 'ه'],
  ['ۀ', 'ه'],
  // Hamza carriers
  ['ئ', 'ی'],
  ['ؤ', 'و'],
  // Tatweel: folded away entirely, so it is mapped to nothing.
  ['ـ', ''],
])

/**
 * Everything that is not a letter or a digit.
 *
 * One rule replaces five: it removes whitespace, ZWNJ, ZWJ, the harakat (which are
 * marks, not letters), and all punctuation. `\p{L}` keeps Persian, Arabic and Latin
 * letters alike, so no script is privileged by the expression itself. ARABIC
 * TATWEEL is `Lm` and survives this strip, which is why it is folded to nothing in
 * the table above instead.
 */
const NON_LETTER_OR_DIGIT = /[^\p{L}\p{N}]/gu

/**
 * Reduces a string to the form the product searches with.
 *
 * The order of the five steps is the algorithm, and each step depends on the one
 * before it:
 *
 * 1. **NFKC.** Folds compatibility forms — the Arabic presentation forms a
 *    copy-paste out of a PDF carries (`ﻻ`), and full-width Latin. It does not touch
 *    ۰-۹ or ٠-٩, which step 3 handles.
 * 2. **Letter folding**, from the table above.
 * 3. **Digits to Latin.** §8.4's third case.
 * 4. **Lower-case**, for the Latin runs inside a mixed name.
 * 5. **Strip to letters and digits.**
 *
 * **Why step 5 removes whitespace too.** §8.4's example is «سهشنبه» against «سه
 * شنبه». Folding ZWNJ to a space leaves three unequal spellings — the ZWNJ form,
 * the spaced form, and the run-together form — and a single `LIKE '%…%'` cannot
 * match all three. Removing whitespace leaves one, so all three collapse to the
 * same string, and any substring of a name finds it: «علی رضایی» and «علیرضایی»
 * both store as `علیرضایی`, and a search for «رضایی» finds either.
 *
 * **The cost, stated plainly.** Whitespace carries no meaning in the search form,
 * so a multi-word query that is not a substring — searching «رضایی علی» for «علی
 * رضایی» — does not match, because `%رضاییعلی%` is not in `علیرضایی`. Token-wise
 * `AND` searching fixes that and belongs to the query builder in the module that
 * searches, not here: this function's contract is a single canonical form, and one
 * that returned a list of tokens could not also be the stored value.
 *
 * The result is **not** a display value and must never be rendered. It is
 * lower-case, unpunctuated and space-free by construction.
 */
export function normalizeForSearch(text: string): string {
  let folded = ''
  for (const char of text.normalize('NFKC')) {
    folded += LETTER_FOLDS.get(char) ?? char
  }
  return toLatinDigits(folded).toLowerCase().replace(NON_LETTER_OR_DIGIT, '')
}

/* ── Mobile ───────────────────────────────────────────────────────────────── */

/** Everything that is not a Latin digit. Applied after `normalizeDigits`. */
const NON_DIGIT = /\D/g

/**
 * The mobile normaliser — the one place a mobile becomes its stored shape.
 *
 * `03-data-model.md` §2.1: "`mobile` (normalised, digits only, stored
 * `09xxxxxxxxx`)". `Customer` is unique on `(tenantId, mobile)`, and a unique
 * constraint over a column written in several shapes enforces nothing: `+98912…`,
 * `0098912…`, `0912…` and `912…` are one subscriber and four rows. So every writer
 * goes through here.
 *
 * It folds the four forms a person or a form actually produces — `09123456789`,
 * `9123456789`, `+989123456789`, `00989123456789` — and any separators typed along
 * the way, in Persian or Latin digits.
 *
 * **The three values have to stay distinct**, and they are the reason the
 * constants are named separately rather than reused:
 *
 * | Value | Example | Length |
 * |---|---|---|
 * | the stored form | `09123456789` | 11 — `MOBILE_DIGIT_LENGTH` |
 * | the national (significant) number | `9123456789` | 10 — `MOBILE_NATIONAL_LENGTH` |
 * | the international form | `989123456789` | 12 — `MOBILE_COUNTRY_CODE` + national |
 *
 * Stripping `0` from `09123456789` leaves the **national number**, so putting the
 * stored form back is `MOBILE_TRUNK_PREFIX + national`, not `MOBILE_PREFIX +`
 * national — `09` is already the first two digits of the national number's
 * *prefixed* form and prepending it again yields a twelve-digit number that no
 * `MOBILE_PATTERN` matches.
 *
 * **It does not validate, and it does not throw.** Its contract is to return the
 * best canonical form it can from whatever it was handed, so that a caller's Zod
 * schema rejects the *result* with a Persian sentence («شماره موبایل باید ۱۱ رقم
 * باشد») rather than the request failing with an exception. `isValidMobile` is the
 * predicate that schema uses. Keeping them apart is what makes a bad mobile a
 * validation error — something the user can fix — instead of a defect.
 */
export function normalizeMobile(input: string): string {
  const digits = normalizeDigits(input).replace(NON_DIGIT, '')

  let national = digits
  if (national.startsWith(`00${MOBILE_COUNTRY_CODE}`)) {
    national = national.slice(2 + MOBILE_COUNTRY_CODE.length)
  } else if (
    national.startsWith(MOBILE_COUNTRY_CODE) &&
    national.length === MOBILE_COUNTRY_CODE.length + MOBILE_NATIONAL_LENGTH
  ) {
    national = national.slice(MOBILE_COUNTRY_CODE.length)
  } else if (national.startsWith(MOBILE_TRUNK_PREFIX)) {
    national = national.slice(MOBILE_TRUNK_PREFIX.length)
  }

  if (national.length === MOBILE_NATIONAL_LENGTH) {
    return `${MOBILE_TRUNK_PREFIX}${national}`
  }

  // Not a mobile. Returned as it was typed — digits only, but unshaped — so that
  // `isValidMobile` rejects it and the message names the fix, rather than this
  // function inventing a number the user did not type.
  return digits
}

/**
 * `true` when `value` is a mobile in the stored shape.
 *
 * Test this against the output of `normalizeMobile`, never against raw user input.
 * `0912 345 6789` is a valid number typed in an invalid shape, and rejecting it
 * over the spaces is the defect `07-localization.md` §4.1 warns about: "A form that
 * rejects Persian-digit input is a defect — it is the natural way a Persian
 * speaker types a number."
 */
export function isValidMobile(value: string): boolean {
  return MOBILE_PATTERN.test(value)
}
