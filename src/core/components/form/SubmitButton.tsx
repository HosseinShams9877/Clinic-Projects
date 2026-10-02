'use client'

import type { ReactNode } from 'react'

import { Button, type ButtonVariant } from '@/core/components/button'
import type { IconName } from '@/core/components/icons'

/**
 * The form's submit control.
 *
 * ## What it owns
 *
 * `Button` defaults its `type` to `button`, and deliberately: a `<button>` with no
 * `type` inside a `<form>` submits it, so the unmarked default is the one that
 * fires a submission when someone meant to open a dropdown. That default means the
 * opposite mistake is available — a button that looks like a submit button, is
 * labelled like one, and does nothing at all — and it is silent, because a button
 * that does not submit produces no error, no console warning and no visual
 * difference. This component removes the possibility by setting `type="submit"`
 * itself; the caller cannot pass a `type`, because there is no such prop.
 *
 * It also fixes the default variant to `primary`, which is the one place in the
 * product where §8's table is the right default rather than the demo's base
 * button: a form has exactly one primary action, and it is this one.
 *
 * ## Why `loading` is a prop and not read from the form
 *
 * The obvious next step is for this component to read `isSubmitting` itself, so a
 * caller has nothing to remember at all. It is not done, and the reason is
 * concrete rather than stylistic.
 *
 * RHF's `formState` is a proxy that subscribes the component whose **render read
 * it**, so the state cannot be read here through the `form` object a module holds —
 * it has to come from `useFormState({ control })`, which needs `control`. Passing
 * `control` down through a context means storing `Control<TFieldValues>` in a
 * non-generic slot, and `Control<{ mobile: string }>` is not assignable to
 * `Control<FieldValues>`: `UseFormRegister`'s parameter is contravariant, and
 * widening the field names to `string` would let a form register a field it does
 * not have. The alternatives are a cast — which gives up the compile-time check
 * that a field name is real, the single most valuable thing RHF's types do — or a
 * `useFormState` call inside `Form`, which subscribes the whole subtree to every
 * field change including every keystroke.
 *
 * So the wiring stays explicit at the call site:
 *
 * ```tsx
 * <SubmitButton loading={form.formState.isSubmitting}>{catalog.save}</SubmitButton>
 * ```
 *
 * which reads `formState` in the component that called `useForm` — where it is
 * correct — and re-renders only that component.
 */
export interface SubmitButtonProps {
  readonly children: ReactNode

  /** True while the submission is in flight. Usually `formState.isSubmitting`. */
  readonly loading?: boolean

  /**
   * Defaults to `primary`. Overridable because §8's table is a set of choices and
   * the one place a non-primary submit is right is a form whose primary action
   * lives outside it — a filter panel above a list, say.
   */
  readonly variant?: ButtonVariant

  readonly leadingIcon?: IconName

  readonly disabled?: boolean

  /** §8's block modifier: the button fills its container. */
  readonly block?: boolean

  readonly className?: string
}

export function SubmitButton({
  children,
  loading = false,
  variant = 'primary',
  leadingIcon,
  disabled = false,
  block = false,
  className,
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      variant={variant}
      loading={loading}
      leadingIcon={leadingIcon}
      disabled={disabled}
      block={block}
      className={className}
    >
      {children}
    </Button>
  )
}
