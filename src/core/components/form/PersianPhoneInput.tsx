'use client'

import { useState } from 'react'
import type { ChangeEvent, ComponentProps } from 'react'

import { cx } from '@/core/lib'
import { toLatinDigits, toPersianDigits } from '@/core/localization'

import { useControlWiring } from './field-context'
import { CONTROL_CLASSES } from './control-classes'

/**
 * A phone-number input that shows Persian digits and submits Latin ones.
 *
 * `07-localization.md` §4: "Every number a user reads is rendered with Persian
 * digits." A phone number is one a user reads, so it is displayed as
 * `۰۲۱۱۲۳۴۵۶۷۸`. But the column stores it as `02112345678`, because Persian
 * digits in a database break every comparison and every parse.
 *
 * ## How the two representations travel
 *
 * The input is controlled: the visible value is state, and it is always the
 * Persian form. A second, hidden input carries the Latin form under the same
 * `name`, so the form that submits reads Latin digits and the screen that shows
 * them reads Persian. The visible input carries no `name`, so it is not
 * submitted and the hidden one is the single value the action receives.
 *
 * The conversion is the localization layer's own (`toPersianDigits` on the way
 * out, `toLatinDigits` on the way in). Nothing here does a second conversion.
 */
export interface PersianPhoneInputProps
  extends Omit<ComponentProps<'input'>, 'className' | 'id' | 'name' | 'value' | 'onChange'> {
  readonly name: string
  readonly defaultValue?: string
  readonly className?: string
}

export function PersianPhoneInput({
  name,
  defaultValue = '',
  className,
  ...inputProps
}: PersianPhoneInputProps) {
  const wiring = useControlWiring('PersianPhoneInput')

  // The Persian form the person sees, and the Latin form the action reads. Both
  // are one value in two scripts.
  const [persian, setPersian] = useState<string>(() => toPersianDigits(toLatinDigits(defaultValue)))

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    // A phone number is digits and a leading `+`; everything else is stripped so a
    // space a person typed does not become a value the column stores.
    const latin = toLatinDigits(event.currentTarget.value).replace(/[^\d+]/g, '')
    setPersian(toPersianDigits(latin))
  }

  return (
    <>
      <input
        {...inputProps}
        {...wiring}
        type="tel"
        inputMode="tel"
        dir="ltr"
        value={persian}
        onChange={handleChange}
        className={cx(CONTROL_CLASSES, 'text-start tabular-nums', className)}
      />
      <input
        type="hidden"
        name={name}
        value={toLatinDigits(persian).replace(/[^\d+]/g, '')}
      />
    </>
  )
}