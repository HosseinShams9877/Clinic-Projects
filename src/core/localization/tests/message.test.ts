/**
 * The template renderer.
 *
 * `10-testing-strategy.md` §11 puts `src/core/localization/**` at 100% lines and
 * 100% branches, blocking, and this file is where that target is met for
 * `message.ts` rather than merely approached. The two branches that look like
 * defensive boilerplate — the missing value and the `string`-versus-number split —
 * are the two behaviours the module exists for, so covering them is not box-ticking.
 *
 * The tests are grouped by the question a reader would ask of the module: what does
 * it do to a value, what does it refuse, and what is a placeholder at all.
 */

import { describe, expect, it } from 'vitest'

import { ValidationError } from '@/core/types'

import {
  asLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
  toPersianDigits,
} from '../index'
import type { MessageValue } from '../message'
import { renderMessage, templatePlaceholders } from '../message'
import { VALIDATION_MESSAGES } from '../catalog/common'

describe('renderMessage', () => {
  describe('substituting values', () => {
    it('returns a template with no placeholders unchanged', () => {
      // The zero-match case of the underlying `replace`: the text must come back
      // identical, not merely equivalent.
      const template = VALIDATION_MESSAGES['validation.localDate.invalid']

      expect(renderMessage(template, {})).toBe(template)
    })

    it('drops a value the template does not use', () => {
      // A caller may hold one record and render several templates from it, which is
      // what a settings screen does when it previews each template as it is edited.
      // An unused value is not a symptom of anything, so it is ignored rather than
      // reported.
      expect(renderMessage('سلام', { name: 'مریم' })).toBe('سلام')
    })

    it('substitutes a string value as written, converting only its digits', () => {
      expect(renderMessage('{greeting} مریم', { greeting: 'سلام' })).toBe('سلام مریم')
    })

    it('substitutes several placeholders in one template', () => {
      // §7.3's own worked example, with the values a caller would actually hold: a
      // formatted date, a formatted time and a formatted amount.
      const template = '{name} عزیز، موعد جلسه {sessionNumber} شما {date} ساعت {time} است.'
      const rendered = renderMessage(template, {
        name: 'مریم',
        sessionNumber: 3,
        date: formatDate(asLocalDate('1405-06-29'), 'long'),
        time: '09:30',
      })

      expect(rendered).toBe('مریم عزیز، موعد جلسه ۳ شما ۲۹ شهریور ۱۴۰۵ ساعت ۰۹:۳۰ است.')
      // §9: no Latin digit in any rendered surface. Asserted on the sentence rather
      // than trusted, because a value passed as a raw string is exactly how one
      // would arrive.
      expect(rendered).not.toMatch(/[0-9]/)
    })
  })

  describe('the two kinds of value', () => {
    it('renders a number with Persian digits and the ٬ grouping separator', () => {
      // A `number` is a value the product has not yet formatted, so it gets the whole
      // treatment.
      expect(renderMessage('{count} جلسه', { count: 1234567 })).toBe('۱٬۲۳۴٬۵۶۷ جلسه')
    })

    it('renders a bigint the same way, without going through a float', () => {
      // Money is a `bigint` (`06-constants.md` §6), and `06-constants.md` §8 forbids a
      // float anywhere near an amount. "The same way" is the assertion: the `bigint`
      // and the equal `number` render identically, so the only difference between the
      // two is that one of them never became a float.
      //
      // The renderer does **not** convert Rial to Toman — that is `formatMoney`'s job
      // and it needs a unit to be meaningful — so a raw `bigint` of Rial reaches the
      // page as Rial digits. A template that renders an amount therefore substitutes
      // `formatMoney(...)`, which is the string case asserted below.
      expect(renderMessage('{amount}', { amount: 5_000_000n })).toBe('۵٬۰۰۰٬۰۰۰')
      expect(renderMessage('{amount}', { amount: 5_000_000 })).toBe('۵٬۰۰۰٬۰۰۰')
    })

    it('does not regroup a string, so a Jalali year is written as a year', () => {
      // The reason the two cases exist. 1405 as a year is «۱۴۰۵»; 1405 as a count is
      // «۱٬۴۰۵». A renderer with one case would have to guess from the magnitude, and
      // the guess would be wrong for one of them.
      expect(renderMessage('{year}', { year: toPersianDigits(1405) })).toBe('۱۴۰۵')
      expect(renderMessage('{year}', { year: 1405 })).toBe('۱٬۴۰۵')
    })

    it('converts a Latin-digit string, which is how a raw value reaches a screen', () => {
      // §7.3: substitution "also appl[ies] Persian-digit conversion to the substituted
      // values". A caller that passes `'3'` rather than `3` still gets «۳», so the
      // §9 obligation holds even at the call site that got the type wrong.
      expect(renderMessage('{count}', { count: '3' })).toBe('۳')
    })

    it('is idempotent over a value that was already formatted', () => {
      // `toPersianDigits` maps only recognised digit characters, so a formatted value
      // comes back unchanged. This is what makes the unconditional string conversion
      // above safe rather than a second formatting pass.
      const formatted = formatMoney(5_000_000n)
      const twice = renderMessage('{amount}', { amount: formatted })

      expect(twice).toBe(formatted)
      expect(twice).toBe('۵۰۰٬۰۰۰ تومان')
    })

    it('leaves the isolation boundary of a formatted phone number in place', () => {
      // §5's bidi isolation is carried by the value, not by the sentence around it,
      // so a substitution must not disturb it — the isolate characters are not digits
      // and pass through the conversion untouched. The value comes from `formatPhone`
      // rather than from a literal so that the test does not itself depend on two
      // invisible characters surviving a copy-paste.
      const phone = formatPhone('09123456789')

      expect(renderMessage('شماره: {phone}', { phone })).toBe(`شماره: ${phone}`)
    })

    it('renders zero as a value rather than treating it as absent', () => {
      // `0` is falsy and is a perfectly ordinary count, so the absence check has to be
      // against `undefined` and not against truthiness.
      expect(renderMessage('{count} جلسه ثبت نشده', { count: 0 })).toBe('۰ جلسه ثبت نشده')
    })

    it('renders an empty string as a value rather than treating it as absent', () => {
      // The same distinction for the other falsy primitive. An empty string is a
      // value a caller chose to supply; only `undefined` means "not supplied".
      expect(renderMessage('[{note}]', { note: '' })).toBe('[]')
    })
  })

  describe('failures', () => {
    it('throws when a placeholder has no value', () => {
      expect(() => renderMessage('{name} عزیز', {})).toThrow(ValidationError)
    })

    it('names the placeholder in the English message, for the log', () => {
      // The message is never a rendered surface — it goes to the logger — so it is
      // English like every other message in `core/types/errors.ts`. Naming the
      // placeholder is what makes the log entry actionable.
      expect(() => renderMessage('{name} عزیز', {})).toThrow(
        'Message template placeholder {name} has no value',
      )
    })

    it('carries the placeholder as structured detail', () => {
      const error = (() => {
        try {
          renderMessage('{sessionNumber}', {})
          return undefined
        } catch (caught) {
          return caught
        }
      })()

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).detail).toEqual({ placeholder: 'sessionNumber' })
    })

    it('carries the generic catalog sentence, so a user sees an honest apology', () => {
      // `core/types/errors.ts` carries a key rather than a sentence precisely so the
      // Persian copy lives in the catalog; this is the sentence a boundary would
      // render for this defect.
      expect(VALIDATION_MESSAGES['error.missingMessageValue']).toContain('دوباره تلاش کنید')
    })

    it('treats an explicitly undefined value as not supplied', () => {
      // `{ name: undefined }` and `{}` are the same thing to a caller that built the
      // record conditionally, and giving them two behaviours would be a difference
      // nobody could see at the call site. The absence check is therefore against
      // `undefined` rather than against `Object.hasOwn`.
      //
      // The cast is the point of the test rather than a shortcut around it: the
      // declared type already excludes `undefined`, so the only ways to reach this
      // input are JavaScript without types and a cast — and both have to be safe.
      const looselyTyped = { name: undefined } as unknown as Readonly<Record<string, MessageValue>>

      expect(() => renderMessage('{name}', looselyTyped)).toThrow(ValidationError)
    })

    it('throws for the first missing placeholder it reaches', () => {
      // Deterministic: `replace` walks left to right, so the error names the earliest
      // gap rather than an arbitrary one.
      expect(() => renderMessage('{first} {second}', { second: 'b' })).toThrow('{first}')
    })

    it('does not throw for a placeholder that appears twice when it has a value', () => {
      expect(renderMessage('{n} و {n}', { n: 1 })).toBe('۱ و ۱')
    })
  })
})

describe('templatePlaceholders', () => {
  it('returns the placeholders in order of first appearance', () => {
    expect(templatePlaceholders('{b} سپس {a}')).toEqual(['b', 'a'])
  })

  it('lists a repeated placeholder once', () => {
    // It is one value used twice, and settings validation compares this list against
    // the placeholders a template type allows — a duplicate would read as a second,
    // unknown placeholder.
    expect(templatePlaceholders('{n} و {n} و {n}')).toEqual(['n'])
  })

  it('returns an empty list for a template with no placeholders', () => {
    expect(templatePlaceholders('سلام')).toEqual([])
  })

  it('returns an empty list for an empty template', () => {
    expect(templatePlaceholders('')).toEqual([])
  })

  it('reads the placeholders of the catalog templates this layer raises', () => {
    // The one template in the catalog that carries placeholders, checked here so the
    // renderer and the copy are known to agree.
    expect(templatePlaceholders(VALIDATION_MESSAGES['validation.localDate.outOfRange'])).toEqual([
      'min',
      'max',
    ])
  })

  it('accepts the characters §7.3 uses in a placeholder name', () => {
    // Camel case with a digit: `{sessionNumber2}`.
    expect(templatePlaceholders('{sessionNumber2}')).toEqual(['sessionNumber2'])
  })

  it('ignores a brace group that is not a placeholder', () => {
    // A Persian word, a space, an empty pair and a hyphen are all left as written, so
    // a template may contain braces for their own sake without them being read as
    // substitution points. Each of these would otherwise be a silently unfilled gap.
    for (const template of ['{نام}', '{ }', '{}', '{a-b}', '{a b}']) {
      expect(templatePlaceholders(template)).toEqual([])
    }
  })

  it('agrees with what renderMessage substitutes', () => {
    // The two functions share the pattern, and this is the assertion that keeps them
    // from drifting: everything listed is replaced, and nothing else is.
    const template = 'بین {min} و {max} — و نه {نام}'
    const values = Object.fromEntries(templatePlaceholders(template).map((name) => [name, 'x']))

    expect(renderMessage(template, values)).toBe('بین x و x — و نه {نام}')
  })
})
