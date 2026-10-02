'use client'

import type { ComponentProps } from 'react'

import { cx } from '@/core/lib'

import { useControlWiring } from './field-context'

import styles from './Form.module.css'

/**
 * A single-line text input, styled to §13 and wired to its `Field`.
 *
 * `08-ui-design-system.md` §13: "Input / select / textarea | width 100%,
 * `padding: 11px 16px`, white bg, border `#E3D5D0`, radius 10px, font 13px", with
 * placeholder `#817169` and a focus treatment of border `#D9A7A7` plus
 * `box-shadow: 0 0 0 3px #FBF1EE`. All of it is in `Form.module.css`; none of it is
 * a prop here, which is the point — a module cannot restyle a control into
 * something that is no longer the design system.
 *
 * ## The four attributes a caller does not write
 *
 * `id`, `aria-invalid`, `aria-required` and `aria-describedby` come from the
 * enclosing `Field` — see `useControlWiring`. They are spread **after** the
 * caller's props, so a caller cannot override them; `id` is additionally removed
 * from the accepted props entirely, because a caller-supplied `id` is the one way
 * to break the label association without the type system noticing.
 *
 * `ref` is left to the caller and passed through, which is what makes RHF work:
 * `register('mobile')` returns `{ name, onChange, onBlur, ref }`, and the `ref` is
 * what RHF focuses when a submission fails. React 19 passes `ref` as an ordinary
 * prop to a function component, so no `forwardRef` is needed to accept it.
 *
 * ## No `type` default
 *
 * `type` is not defaulted to `text`, because leaving it off already means `text`
 * and a default would only be a second place for the same fact. A caller that
 * wants a number or a telephone keypad says so — and one that wants to say
 * "mobile number" reaches for `inputMode`, which changes the keyboard without
 * changing what the value is.
 */
export type TextInputProps = Omit<ComponentProps<'input'>, 'className' | 'id'> & {
  /** Appended last, so a caller's layout wins over the control's own. */
  readonly className?: string
}

export function TextInput({ className, ...inputProps }: TextInputProps) {
  const wiring = useControlWiring('TextInput')

  return (
    <input
      {...inputProps}
      {...wiring}
      className={cx(styles.control, className)}
    />
  )
}
