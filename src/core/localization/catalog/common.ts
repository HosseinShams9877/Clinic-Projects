/**
 * Labels shared by every surface that shows a date, a weekday, or money.
 *
 * `07-localization.md` §7.2 calls the catalog "a plain object, not a runtime
 * lookup with a fallback chain — there is no fallback language to fall back to."
 * That is the whole design. There is no `t()` function, no locale negotiation and
 * no missing-key branch, because the product has exactly one language: a missing
 * label cannot be recovered at runtime, so it is made impossible at compile time
 * instead. `MONTH_NAMES` is a `Record<JalaliMonth, string>`, which means a month
 * without a name does not compile.
 *
 * This file holds the vocabulary that is genuinely **shared** — the twelve month
 * names, the seven weekday names, the relative-date words and the currency unit.
 * Everything else belongs to a module: `06-constants.md` §4's role, permission,
 * appointment-status and cycle-status labels are named by the module that owns
 * the concept, in `src/modules/<module>/`, so that a module's vocabulary changes
 * with the module.
 *
 * The Persian literals live here and nowhere else. `05-conventions.md` §14 makes a
 * Persian string literal in a component a finding, and the same rule applied
 * loosely would mean a month name spelled two ways on two screens.
 */

import { ZWNJ } from '../digits'
import type { JalaliMonth, WeekdayIndex } from '../types'
import { JALALI_MONTHS, WEEKDAY_INDEXES } from '../types'

/* ── Months ───────────────────────────────────────────────────────────────── */

/**
 * The twelve Jalali months, `07-localization.md` §6.4.
 *
 * Keyed by the month number rather than held in an array, so the type carries the
 * completeness requirement: the record cannot be one entry short, and it cannot
 * be indexed by a month that does not exist. `noUncheckedIndexedAccess` is not
 * needed to make the lookup safe, because there is no lookup — the key space is
 * the type.
 */
export const MONTH_NAMES: Readonly<Record<JalaliMonth, string>> = {
  1: 'فروردین',
  2: 'اردیبهشت',
  3: 'خرداد',
  4: 'تیر',
  5: 'مرداد',
  6: 'شهریور',
  7: 'مهر',
  8: 'آبان',
  9: 'آذر',
  10: 'دی',
  11: 'بهمن',
  12: 'اسفند',
}

/**
 * The twelve month names in order, for a month picker that walks them.
 *
 * Derived from `MONTH_NAMES` rather than written out a second time, so the two
 * cannot disagree.
 */
export const MONTH_NAMES_IN_ORDER: readonly string[] = JALALI_MONTHS.map(
  (month) => MONTH_NAMES[month],
)

/**
 * The name of a Jalali month, 1–12.
 *
 * Takes a `number` because the month arrives from arithmetic — `jalaliMonthOf`, a
 * query parameter, a settings field — and narrowing at every call site would be
 * noise. An out-of-range month is a defect upstream and throws rather than
 * rendering a blank, which is the same rule `05-conventions.md` §7 applies to
 * every other boundary: fail loudly, never return a value that looks like data.
 */
export function monthName(month: number): string {
  const name = MONTH_NAMES[month as JalaliMonth] as string | undefined
  if (name === undefined) {
    throw new RangeError(`Jalali month ${String(month)} has no name; expected 1–12`)
  }
  return name
}

/* ── Weekdays ─────────────────────────────────────────────────────────────── */

/**
 * The seven weekday names, شنبه first — `07-localization.md` §6.4.
 *
 * Keyed by `WeekdayIndex`, which is **0 for شنبه**, not for Sunday. The two
 * conventions are never mixed: `jalaliWeekday` in `jalali.ts` is the only
 * conversion, and this record is indexed by its result.
 *
 * Every name after شنبه carries a **ZWNJ** (U+200C) before شنبه, and that is not
 * decoration. `01-tech-stack.md` §8.4 uses exactly these words as its example of
 * why normalisation exists — «سه‌شنبه» and «سه شنبه» are the same word to a reader
 * and different strings to a search index — and the product writes the joined
 * form. A lost ZWNJ would leave the run-together spelling, which reads as a
 * spacing error and, worse, would make this file's output disagree with the
 * normaliser that exists to reconcile the two.
 *
 * Written as `${ZWNJ}` rather than as the literal character, deliberately. U+200C
 * is **invisible**: it survives review, a copy-paste through a terminal and a
 * formatter with nobody noticing its absence, and the string left behind looks
 * correct in every font. Spelling it out means the character cannot be dropped by
 * accident, and `tests/catalog.test.ts` asserts it is present so that it cannot be
 * dropped deliberately either.
 */
export const WEEKDAY_NAMES: Readonly<Record<WeekdayIndex, string>> = {
  0: 'شنبه',
  1: `یک${ZWNJ}شنبه`,
  2: `دو${ZWNJ}شنبه`,
  3: `سه${ZWNJ}شنبه`,
  4: `چهار${ZWNJ}شنبه`,
  5: `پنج${ZWNJ}شنبه`,
  6: 'جمعه',
}

/** The seven weekday names in display order, شنبه first. */
export const WEEKDAY_NAMES_IN_ORDER: readonly string[] = WEEKDAY_INDEXES.map(
  (index) => WEEKDAY_NAMES[index],
)

/** The name of a weekday, شنبه = 0. */
export function weekdayName(index: WeekdayIndex): string {
  return WEEKDAY_NAMES[index]
}

/* ── Relative dates ───────────────────────────────────────────────────────── */

/**
 * The words `formatDate(date, 'relative')` is built from — §6.4's
 * «امروز · فردا · دیروز · ۳ روز پیش · ۲ هفته دیگر».
 *
 * Held as separate words rather than as whole phrases because Persian puts the
 * count **between** them: the phrase is `<count> <unit> <direction>`, so
 * «۲ هفته دیگر» is assembled, not chosen from a table of pre-built sentences.
 * This is §7.3's rule about placeholders — "a template is never built by
 * concatenating fragments in code; that produces ungrammatical Persian" — applied
 * to the one case where concatenation *is* the grammar: a numeral, a unit noun and
 * a direction adverb, in that order, with no agreement and no case to get wrong.
 *
 * The three fixed days are not built this way. «دیروز» and «فردا» are words, not
 * «۱ روز پیش» and «۱ روز دیگر», which is why they are entries of their own.
 */
export const RELATIVE_LABELS = {
  today: 'امروز',
  tomorrow: 'فردا',
  yesterday: 'دیروز',
  dayUnit: 'روز',
  weekUnit: 'هفته',
  past: 'پیش',
  future: 'دیگر',
} as const

/** The type of a relative-date word, so a caller can pass one through. */
export type RelativeLabel = (typeof RELATIVE_LABELS)[keyof typeof RELATIVE_LABELS]

/* ── Currency ─────────────────────────────────────────────────────────────── */

/**
 * The currency unit, «تومان».
 *
 * A label, and it lives in the catalog for that reason: `06-constants.md` §6 fixes
 * the currency as "Iranian **Toman** in the UI, stored in **Rial**", and
 * `07-localization.md` §8 requires that "a money value should carry its unit".
 * `formatMoney` appends it by default, and a surface that carries the unit in its
 * column header turns it off.
 */
export const CURRENCY_TOMAN_LABEL = 'تومان'

/** The percent sign, «٪». A label, so it is here and not in `format.ts`. */
export const PERCENT_LABEL = '٪'

/* ── Messages raised by this layer ───────────────────────────────────────── */

/**
 * Every catalog key this layer can raise. The record below is typed against it,
 * so dropping a key is a compile error rather than an empty sentence at runtime.
 *
 * `error.unhandledCase` is here rather than in `core/types/errors.ts` because it is
 * raised by `exhaustive()`, which is shared — and `05-conventions.md` §14 makes a
 * Persian literal outside the catalog a finding, so the sentence has to live in a
 * catalog even though the key is raised from outside this layer. It sits in
 * `common` for that reason: it is the one message that belongs to no module.
 */
export type CoreMessageKey =
  | 'validation.localDate.invalid'
  | 'validation.localDate.outOfRange'
  | 'validation.localTime.invalid'
  | 'validation.relativeDate.missingReference'
  | 'error.unhandledCase'
  | 'error.missingMessageValue'
  | 'error.malformedPermissionOverrides'

/**
 * The Persian sentence for every `messageKey` `core/localization` attaches to an
 * error.
 *
 * `core/types/errors.ts` carries a catalog key rather than a message precisely so
 * that the Persian copy lives here — "a Persian string in this file would be a
 * second place Persian copy lives, and `07-localization.md` §7.2 puts it in the
 * catalog". This record is the other half of that arrangement: the errors raise
 * keys, and these are the sentences.
 *
 * Placeholders are whole tokens in braces (`{value}`, `{min}`, `{max}`) per §7.3,
 * substituted by the template renderer, which also converts the substituted values
 * to Persian digits. The wording follows §8: «شماره موبایل باید ۱۱ رقم باشد» — it
 * names the **fix**, never the fault, and there is no «خطا» on its own.
 */
/**
 * The one sentence a user is shown when something went wrong that they cannot fix.
 *
 * Two keys share it — `error.unhandledCase` and `error.missingMessageValue` — and
 * they stay separate keys because the *log* distinguishes them: one is a union
 * member that reached a `switch` with no arm for it, the other a message template
 * whose caller supplied no value for a placeholder. The user is told the same true
 * thing either way, and holding the sentence once means the two cannot drift into
 * two different apologies for one product.
 *
 * «غیرمنتظرهای» carries a ZWNJ, written through the constant rather than as the
 * literal character, for the reason `WEEKDAY_NAMES` gives: U+200C is invisible,
 * survives review and a formatter, and its absence reads as a spacing error. An
 * earlier draft of this file spelled the word run together — the shape
 * `docs/knowledge/` uses throughout, since a search for U+200C across the whole
 * specification returns nothing. The product restores standard orthography, as it
 * does for «جابهجایی» and «ماندهحساب» in `catalog/enums.ts`, and
 * `tests/catalog.test.ts` asserts the character is present so it cannot be dropped
 * again by accident.
 */
const UNEXPECTED_ERROR_MESSAGE = `خطای غیر${ZWNJ}منتظرهای رخ داد. لطفاً دوباره تلاش کنید.`

/**
 * The sentence for a membership row whose permission overrides cannot be read.
 *
 * Raised by `core/tenant`, not by this layer — and it is here for the reason
 * `error.unhandledCase` is here: `05-conventions.md` §14 makes a Persian literal
 * outside a catalog a finding, so a key raised from a second core module still
 * needs a catalog to live in, and `common` is the catalog for messages that belong
 * to no domain module.
 *
 * It is a different sentence from `UNEXPECTED_ERROR_MESSAGE` because the two tell
 * the user different things and point at different fixes. «دوباره تلاش کنید» is
 * wrong advice here: retrying re-reads the same broken row, and the fix is a
 * person — the clinic's manager — rather than another attempt. `07-localization.md`
 * §8 requires the message to name the fix, and this names the only one available.
 */
const MALFORMED_OVERRIDES_MESSAGE = 'دسترسی‌های این حساب خوانده نشد. با مدیر کلینیک تماس بگیرید.'

export const VALIDATION_MESSAGES: Readonly<Record<CoreMessageKey, string>> = {
  'validation.localDate.invalid': 'تاریخ را به شکل ۱۴۰۵/۰۶/۲۹ وارد کنید',
  'validation.localDate.outOfRange': 'سال تاریخ باید بین {min} و {max} باشد',
  'validation.localTime.invalid': 'ساعت را به شکل ۰۹:۳۰ وارد کنید',
  'validation.relativeDate.missingReference': 'برای نمایش نسبی تاریخ، تاریخ مرجع تعیین نشده است',
  'error.unhandledCase': UNEXPECTED_ERROR_MESSAGE,
  'error.missingMessageValue': UNEXPECTED_ERROR_MESSAGE,
  'error.malformedPermissionOverrides': MALFORMED_OVERRIDES_MESSAGE,
}
