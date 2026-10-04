'use client'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import styles from './Form.module.css'

/**
 * The form-level error slot.
 *
 * A submission can fail for a reason that belongs to no field: the server refused
 * it, the network dropped, a row was changed by someone else between the read and
 * the write. RHF gives that a home — `form.setError('root.server', { message })`
 * puts it in `errors.root`, which is the one key that is not a field name — and
 * this is where it is rendered.
 *
 * ## Why it is separate from `Field`'s error
 *
 * A field's error is announced by that field's `aria-describedby`, so a screen
 * reader reads it when the control is focused. A form-level error has no control
 * to attach to: it would have to be attached to all of them, or to none. It gets
 * `role="alert"` instead, which announces it when it appears, and it is rendered
 * above the submit button because that is where the user's attention is when a
 * submission fails.
 *
 * ## Why there is no banner
 *
 * §13 gives form controls a table of geometry and no error row at all, so the
 * treatment here is the smallest one the requirements allow: the semantic danger
 * colour, the icon `Icon` already maps to `error`, and the small type size the
 * demo uses for its `.hint`. Inventing a background, a border and a padding for it
 * would be inventing a design-system component that §8.5 did not ask for, and the
 * phase's rule is to introduce a new component only when the product requirement
 * genuinely needs one.
 *
 * `color: var(--danger)` is a status colour used for a status, which is what §A13
 * requires of it.
 */
export interface FormErrorProps {
  /**
   * The message, or `undefined` when there is nothing to say. The component
   * renders nothing in that case rather than an empty alert region, because an
   * empty `role="alert"` announces nothing and occupies space.
   */
  readonly error?: string

  readonly className?: string
}

export function FormError({ error, className }: FormErrorProps) {
  if (error === undefined) return null

  return (
    <p className={cx(styles.formError, className)} role="alert">
      {/* Decorative: the sentence beside it already says what happened, so
          announcing the icon as well would read the message twice. */}
      <Icon name="alert" size="control" />
      {error}
    </p>
  )
}
