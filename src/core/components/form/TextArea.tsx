'use client'

import type { ComponentProps } from 'react'

import { cx } from '@/core/lib'

import { useControlWiring } from './field-context'
import { CONTROL_CLASSES, TEXTAREA_CLASSES } from './control-classes'

/**
 * A multi-line text input, styled to §13 and wired to its `Field`.
 *
 * §13: "Textarea | `min-height: 96px`, line-height 1.8". The demo's own rule adds
 * `resize: vertical` (`clinic/assets/css/theme.css` `.textarea`), which is the
 * reason the control is not freely resizable: dragging the corner wider than the
 * column it sits in breaks the form's layout, and dragging it shorter than three
 * lines makes the value it holds unreadable.
 *
 * Everything else — the geometry, the focus treatment, the four wiring attributes,
 * the `ref` pass-through — is the same as `TextInput` and is argued there.
 */
export type TextAreaProps = Omit<ComponentProps<'textarea'>, 'className' | 'id'> & {
  /** Appended last, so a caller's layout wins over the control's own. */
  readonly className?: string
}

export function TextArea({ className, ...textAreaProps }: TextAreaProps) {
  const wiring = useControlWiring('TextArea')

  return (
    <textarea
      {...textAreaProps}
      {...wiring}
      className={cx(CONTROL_CLASSES, TEXTAREA_CLASSES, className)}
    />
  )
}
