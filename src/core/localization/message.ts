/**
 * The message-template renderer — `07-localization.md` §7.3.
 *
 * §7.3 defines a message as a template with whole-token placeholders, and states
 * the rule that makes this file small: "a template is never built by concatenating
 * fragments in code; that produces ungrammatical Persian". The section's own
 * example is «{name} عزیز، موعد جلسه {sessionNumber} شما {date} ساعت {time} است.» —
 * note that the values sit *inside* a sentence whose word order, and whose
 * «عزیز،», cannot be assembled from parts. So the template is stored whole and the
 * renderer substitutes into it.
 *
 * ## Two kinds of value, and why the distinction is the API
 *
 * §7.3 requires that substitution "also appl[y] Persian-digit conversion to the
 * substituted values". That is all it requires. A `number` or a `bigint` is a value
 * the product has not yet formatted, so `formatNumber` renders it — Persian digits
 * **and** the `٬` grouping separator. A `string` is a value the caller has already
 * formatted — `formatDate`, `formatMoney`, `formatPhone`, `toPersianDigits` — and
 * only its digits are converted, so grouping is left exactly as the caller wrote it.
 *
 * The distinction earns its keep on the case that would otherwise be wrong: a
 * Jalali year. `number` renders 1405 as «۱٬۴۰۵», which is not how a year is
 * written; `string` renders `toPersianDigits(1405)` as «۱۴۰۵». Without the two
 * cases there would be no way for a caller to say which they meant, and the
 * renderer would have to guess from the magnitude — a guess that is right until it
 * meets a four-digit amount of money.
 *
 * Converting a string's digits is safe to do unconditionally because
 * `toPersianDigits` is idempotent: a value that has already been through
 * `formatDate` comes back unchanged. It is also what §9's "no Latin digits in any
 * rendered surface" needs — a caller who passes a raw `'3'` gets «۳» rather than a
 * Latin digit that reaches the screen and fails the DOM scan in `e2e/`.
 *
 * ## What is a failure, and what is not
 *
 * A placeholder with **no value** throws. §7.3 places the *first* line of defence
 * in settings — "an unknown placeholder fails validation in settings, not at send
 * time" — and this is the second: a caller that hands the renderer the wrong
 * record is a defect, and the alternative to throwing is an empty gap inside a
 * sentence sent to a customer. The throw is a `ValidationError` carrying the
 * generic catalog sentence, so a user whose screen hits this sees an honest apology
 * while the log gets the English message naming the placeholder.
 *
 * A value the template **does not use** is ignored. It is not a symptom of
 * anything: a caller may hold one record of values and render several templates
 * from it, which is exactly what a settings screen does when it previews each
 * template as the operator edits it.
 *
 * ## The shapes this file avoids, and why
 *
 * Both functions are written without an indexed read into a regex match. Under
 * `noUncheckedIndexedAccess` a capture group is `string | undefined`, which would
 * need a `?? fallback` branch — and a fallback for a group that is not optional in
 * the pattern can never be taken, so it can never be covered. With
 * `10-testing-strategy.md` §11's blocking 100% branch target on this directory,
 * that is a permanently failing build rather than a safety net, which is the same
 * constraint `digitIndexOf` in `digits.ts` is shaped by. `String.replace` hands the
 * callback a plain `string`, and `String.split` with a capturing group returns the
 * captures as ordinary array elements, so neither function needs the read.
 */

import { ValidationError } from '@/core/types'

import { toPersianDigits } from './digits'
import { formatNumber } from './format'

/**
 * A placeholder is `{` + a Latin identifier + `}`, and nothing else.
 *
 * The name is restricted to `[A-Za-z0-9_]` on purpose. §7.3's tokens are
 * camelCase keys — `{name}`, `{sessionNumber}`, `{min}`, `{date}` — and an
 * identifier that admitted Persian letters or spaces would make `{ دوست }` and
 * `{دوست}` two different placeholders, one of which would silently never match.
 * A brace group containing anything else is left in the text as written, which is
 * asserted by a test rather than left to be discovered.
 */
const PLACEHOLDER_NAME = '[A-Za-z0-9_]+'

/** A whole string that is one placeholder: `{name}`. Anchored, so no `g` state. */
const PLACEHOLDER_TOKEN_PATTERN = new RegExp(`^\\{${PLACEHOLDER_NAME}\\}$`)

/**
 * A placeholder anywhere in a longer string.
 *
 * Global, and used in exactly one place — `String.replace`, which per spec resets
 * `lastIndex` before it starts. So the shared instance carries no state between
 * calls, and there is no second regex to keep in step with the first.
 */
const PLACEHOLDER_IN_TEXT_PATTERN = new RegExp(`\\{${PLACEHOLDER_NAME}\\}`, 'g')

/**
 * The same pattern with the placeholder captured, for `String.split`.
 *
 * `split` includes a capturing group's matches in its result, which is how the
 * placeholder list is read without indexing a match object. No `g` flag: `split`
 * matches every occurrence regardless, and a `g` here would only invite someone to
 * reuse this instance somewhere that does care.
 */
const PLACEHOLDER_SPLIT_PATTERN = new RegExp(`(\\{${PLACEHOLDER_NAME}\\})`)

/** A value a template can carry. See the header for the two cases. */
export type MessageValue = string | number | bigint

/**
 * Every placeholder in a template, in order of first appearance, once each.
 *
 * Exported because settings validation needs it: §7.3 requires that an unknown
 * placeholder be rejected where the template is written, and that check is a
 * comparison between this list and the placeholders the template type allows. A
 * repeated placeholder is listed once — it is one value, used twice.
 */
export function templatePlaceholders(template: string): readonly string[] {
  const names: string[] = []
  for (const part of template.split(PLACEHOLDER_SPLIT_PATTERN)) {
    if (!PLACEHOLDER_TOKEN_PATTERN.test(part)) continue
    const name = part.slice(1, -1)
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/**
 * A value as the text that goes into the sentence.
 *
 * A `string` is already formatted, so only its digits change; a `number` or
 * `bigint` has not been formatted, so it gets the full treatment. `formatNumber`
 * raises on a non-finite or exponentially-large value, which is deliberate here
 * for the same reason it is in `format.ts`: a value that cannot be rendered as a
 * number is a defect upstream, and a substituted «NaN» inside a sentence sent to a
 * customer is worse than an error in a log.
 */
function formatMessageValue(value: MessageValue): string {
  return typeof value === 'string' ? toPersianDigits(value) : formatNumber(value)
}

/**
 * Fills a template's placeholders.
 *
 * Throws a `ValidationError` naming the placeholder when a value is missing. See
 * the header for why a missing value is an error and an unused one is not.
 */
export function renderMessage(
  template: string,
  values: Readonly<Record<string, MessageValue>>,
): string {
  return template.replace(PLACEHOLDER_IN_TEXT_PATTERN, (token) => {
    const name = token.slice(1, -1)
    const value = values[name]
    if (value === undefined) {
      throw new ValidationError(`Message template placeholder {${name}} has no value`, {
        messageKey: 'error.missingMessageValue',
        detail: { placeholder: name },
      })
    }
    return formatMessageValue(value)
  })
}
