'use client'

import type { ComponentProps } from 'react'

import { cx } from '@/core/lib'
import { formatNumber, toLatinDigits, toPersianDigits } from '@/core/localization'

import { useControlWiring } from './field-context'
import { CONTROL_CLASSES } from './control-classes'

/**
 * A single-line money input, formatted in groups of three as the user types.
 *
 * `06-constants.md` §6: money is stored in Rial and shown in Toman, and the digits in
 * the UI are Persian with the `٬` thousands separator. A `TextInput` with `inputMode`
 * set is a text field that a person types digits into and reads back as a run of
 * unbroken digits; a money input is a field a person reads as a grouped amount, which
 * is what the formatted value is for.
 *
 * ## What the input stores and what it shows
 *
 * The value on the wire is the plain Latin digit string (`"1234567"`), not the
 * formatted one: the Server Action reads `amount: "1234567"` and `BigInt`s it. The
 * value on screen is the formatted Persian one (`"۱٬۲۳۴٬۵۶۷"`). The two are one
 * fact in two places, and the conversion is the localization layer's own
 * (`formatNumber` and `normalizeDigits`), not a second implementation here.
 *
 * ## Why the input never rejects a keystroke
 *
 * A field that refused a paste or a stray character is a field a person fights. The
 * input accepts anything, converts the digits it recognises, strips the separators
 * and the ZWNJ, and renders what is left in groups of three. A letter that survives
 * the strip is not part of the amount and does not become part of the wire value —
 * the caller's `onChange` receives the digits, and validation is the schema's.
 *
 * ## The four attributes a caller does not write
 *
 * `id`, `aria-invalid`, `aria-required` and `aria-describedby` come from the enclosing
 * `Field` — same contract as `TextInput`, same reason. The `value` and `onChange` are
 * the caller's and the caller's alone: the input is a *controlled* control, because
 * the formatted string it shows is derived from the digit string it stores.
 */

/** The value the input carries, as the two facts the caller needs. */
export interface MoneyInputValue {
  /** The digit string the action takes, without separators or non-digit characters. */
  readonly digits: string
  /** The formatted string the input shows, with `٬` and Persian digits. */
  readonly display: string
}

/** The input's own props, beyond the wiring the enclosing `Field` supplies. */
export interface MoneyInputProps
  extends Omit<ComponentProps<'input'>, 'className' | 'id' | 'value' | 'onChange' | 'type'> {
  /** The digit string the input carries. `''` is the empty state. */
  readonly value: string
  /** Called with the new digit string each time the formatted value changes. */
  readonly onChange: (digits: string) => void
  readonly className?: string
}

/** The digits a formatted or typed string actually carries. */
function digitsOf(text: string): string {
  return toLatinDigits(text).replace(/[^\d]/g, '')
}

/** The formatted display of a digit string, or the empty string. */
function displayOf(digits: string): string {
  if (digits === '') return ''
  return formatNumber(BigInt(digits))
}

export function MoneyInput({ value, onChange, className, ...inputProps }: MoneyInputProps) {
  const wiring = useControlWiring('MoneyInput')

  // The caller owns the digit string; the display is derived from it, so a paste of a
  // formatted amount and a keystroke of a digit both end up in the same place — the
  // digits — and the input re-renders with the formatted form.
  const display = displayOf(value)

  return (
    <input
      {...inputProps}
      {...wiring}
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={display}
      onChange={(event) => onChange(digitsOf(event.target.value))}
      className={cx(CONTROL_CLASSES, 'text-start tabular-nums', className)}
    />
  )
}

/**
 * The formatted display of a digit string, exposed for a caller that renders the
 * amount beside the field — the live "remaining after" figure, for example, whose
 * own formatting is the same `formatNumber` this input's display is.
 *
 * The function is not the input's internals; it is the one fact the input and a
 * caller that formats the same amount share, and naming it here keeps the two from
 * being two implementations.
 */
export function formatMoneyInputDigits(digits: string): string {
  return toPersianDigits(displayOf(digits))
}