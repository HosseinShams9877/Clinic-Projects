'use client'

import type { ReactNode } from 'react'
import {
  FormProvider,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form'

import { cx } from '@/core/lib'

/**
 * The form element, and the one place RHF's context is provided.
 *
 * `01-tech-stack.md` §8.5 requires a shared Persian form shell whose "field layout,
 * the Persian label, the error slot, and RTL are defined once, and a module's form
 * composes it rather than restating it". This is the top of that shell: it renders
 * the `<form>`, wires submission to RHF's `handleSubmit`, and provides the form to
 * everything inside it.
 *
 * ## `noValidate`
 *
 * The `noValidate` attribute is not a shortcut, it is a requirement. With it
 * absent, the browser runs its own validation on submit and renders its own
 * bubbles — which are **the browser's**, not the product's: the message text comes
 * from the browser's UI language and is English on a machine whose locale is not
 * Persian, and the digits in it are Latin. That is a §9 "no Latin digits in any
 * rendered surface" failure and a §8-of-`07-localization.md` failure in one, and
 * it is invisible on a developer's machine set to `fa-IR`.
 *
 * Turning it off costs nothing, because the same rules are already declared in the
 * module's Zod schema — which §8.5 makes the single definition, shared with the
 * server, where it is re-validated regardless of what the client did.
 *
 * ## Why `onValid` is a prop rather than the module calling `handleSubmit` itself
 *
 * Because the shell owns the `<form>` element, and `handleSubmit` is what connects
 * it. A module that called `handleSubmit` and passed the result here would be
 * able to pass a handler that does not call `preventDefault`, and the page would
 * navigate. `SubmitHandler<TFieldValues>` is typed against the form's own values,
 * so a module that renames a field gets a compile error at its handler.
 *
 * ## The one class
 *
 * The demo spaces fields with `.grid`'s `var(--s-4)`; its `.col`, at `--s-3`, is
 * the tighter gap it uses between *groups* inside a card body. A form is a
 * sequence of fields, so it takes the field gap — which, with `--spacing` at
 * `--s-1`, is what `gap-4` resolves to.
 */
export interface FormProps<TFieldValues extends FieldValues> {
  /** The result of `useForm`, which the module owns — it holds the schema. */
  readonly form: UseFormReturn<TFieldValues>

  /**
   * Called with the validated values — only the values. RHF's `handleSubmit` also
   * forwards the submit event to its callback, and it is dropped here on purpose:
   * the same schema is re-validated on the server, where there is no event, so a
   * handler that reached for one would be a handler that only works on the client.
   */
  readonly onValid: SubmitHandler<TFieldValues>

  readonly children: ReactNode

  /** Appended last, so a caller's layout wins over the shell's own. */
  readonly className?: string
}

export function Form<TFieldValues extends FieldValues>({
  form,
  onValid,
  children,
  className,
}: FormProps<TFieldValues>) {
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => onValid(values))}
      className={cx('flex flex-col gap-4', className)}
    >
      {/* The shell wraps its children in RHF's provider as well as its own, so a
          module can reach `useWatch`, `useFieldArray` or `useController` inside a
          form without the shell having to proxy any of them. */}
      <FormProvider {...form}>{children}</FormProvider>
    </form>
  )
}
