'use client'

import type { ReactNode } from 'react'
import { useId } from 'react'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { FieldContext } from './field-context'

import styles from './Form.module.css'

/**
 * One field of a form: the label, the control, and the two message slots.
 *
 * `08-ui-design-system.md` §13 fixes the layout — "Field | vertical layout,
 * `gap: 7px`" — and `01-tech-stack.md` §8.5 gives the shell the job of defining it
 * once. What the module contributes is three words: the label text, whether the
 * field is required, and the message when the value is not accepted. Everything
 * else here is wiring, and the wiring is the reason this component exists.
 *
 * ## The four things a call site writes by hand, and gets wrong
 *
 * A control needs an `id`, and the label needs an `htmlFor` that matches it. It
 * needs `aria-describedby` when there is a hint or an error, `aria-invalid` when
 * the value failed, and `aria-required` when it is required. Written at each call
 * site, the failure modes are all silent:
 *
 * - an `htmlFor` that does not match any `id` leaves the control with no accessible
 *   name — an axe violation, and a control a screen reader reads as "edit text";
 * - an `aria-describedby` that names an element which is **not rendered** is worse
 *   than no description: the attribute is present, so the form looks correct, and
 *   the message the user needs is never announced;
 * - an `aria-invalid` that is set once and never cleared keeps telling a screen
 *   reader that a value the user has since fixed is wrong.
 *
 * None of the three is visible in review and none of them fails a render. So the
 * field generates the ids, builds `describedby` from the slots it is actually
 * rendering, and hands the control all four through `FieldContext`.
 *
 * ## Why the label is a real `<label>`
 *
 * The demo's markup is `<span class="label">نام و نام خانوادگی <span class="req">*</span></span>`
 * — a span, associated with nothing. `htmlFor` is what supplies the accessible
 * name axe requires, and it also makes the label a click target for the control on
 * a phone, which is a target-size win for free.
 *
 * ## The marker
 *
 * §13 gives the required marker a colour (`#C25B62` → `--danger`) and no glyph; the
 * demo's glyph is `*`, so that is the glyph used. It carries `aria-hidden`, because
 * the announcement comes from `aria-required` on the control and a marker read
 * aloud as "star" would be noise on top of it.
 *
 * ## Why the hint is rendered before the error
 *
 * Both are children of the same 7px stack. If the error were first, a failing
 * submission would push the hint down and shift the field's whole lower edge; with
 * the hint first, the error is appended below it and nothing above moves. The same
 * order is used in `aria-describedby`, so the reading order matches the visual one.
 *
 * ## Why `aria-required` and not `required`
 *
 * The native attribute makes `:invalid` match on an empty required field **before
 * anyone has touched it**, so any `:invalid` styling would paint the whole form red
 * on first paint and the form would look broken before it was used. The schema is
 * the authority on what is required; this carries the announcement.
 */
export interface FieldProps {
  /**
   * The label text, from the module's catalog. A string and not a `ReactNode`:
   * the label is what names the control, and a label that is not text has no
   * accessible name to give.
   */
  readonly label: string

  /** The control, which reads its wiring from this field's context. */
  readonly children: ReactNode

  /** A short explanation under the control, shown whenever the field is. */
  readonly hint?: string

  /**
   * The message when the value is not accepted, or `undefined` when it is. The
   * module formats it — usually the message from the same Zod schema the server
   * validates against, so the user reads the server's own wording.
   */
  readonly error?: string

  /** Adds the marker and announces the control as required. */
  readonly required?: boolean

  readonly className?: string
}

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  className,
}: FieldProps) {
  // `useId` rather than a counter or a random string: it is stable across renders
  // and across server and client, which is what keeps an `htmlFor` from pointing at
  // an id that only exists on one of them.
  const id = useId()
  const controlId = `${id}-control`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  // Built with `if` rather than by filtering a list of candidates, so that every
  // branch here is one a test can reach: a described-by that always names both ids
  // would point at an element that is not rendered for every field without an
  // error, which is the failure this whole component is about.
  const describedBy: string[] = []
  if (hint !== undefined) describedBy.push(hintId)
  if (error !== undefined) describedBy.push(errorId)

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            {'*'}
          </span>
        ) : null}
      </label>

      <FieldContext.Provider
        value={{
          controlId,
          describedBy: describedBy.length === 0 ? undefined : describedBy.join(' '),
          invalid: error !== undefined,
          required,
        }}
      >
        {children}
      </FieldContext.Provider>

      {hint === undefined ? null : (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}

      {error === undefined ? null : (
        <p className={styles.error} id={errorId} role="alert">
          {/* Decorative: the sentence beside it already says what is wrong, so
              announcing the icon too would read the field's failure twice. */}
          <Icon name="error" size="compact" />
          {error}
        </p>
      )}
    </div>
  )
}
