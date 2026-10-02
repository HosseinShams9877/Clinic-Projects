'use client'

import { createContext, useContext } from 'react'

/**
 * What a `Field` tells the control inside it.
 *
 * `01-tech-stack.md` §8.5 asks the form shell for "field layout, the Persian label,
 * the error slot, and RTL" defined **once**, so that "a module's form composes it
 * rather than restating it". The four things a control cannot work out for itself
 * are the four things here: its `id` (which the label points at), what describes
 * it, whether it is invalid, and whether it is required.
 *
 * The alternative — every call site writing `id`, `htmlFor`, `aria-describedby` and
 * `aria-invalid` by hand — is the arrangement this exists to replace. It is not a
 * style preference: an `id`/`htmlFor` pair that drifts, or an `aria-describedby`
 * that names an element which is not rendered, produces a control whose label or
 * error message is not announced at all, and neither is visible in review. Wiring
 * it once means a module cannot get it wrong, because a module never writes it.
 *
 * ## Why this is not React Hook Form's context
 *
 * RHF's own `useFormContext` is typed as returning a non-null `UseFormReturn` and
 * does not throw when there is no provider — its body is `React.useContext(...)`
 * and the declared return type is an assertion. A control that relied on it
 * outside a provider would fail on the first property access, with a message about
 * `undefined`. This context is a plain `T | null` from `createContext`, so
 * `useFieldContext` can name the component and the missing wrapper instead.
 *
 * The shell still wraps its children in RHF's `FormProvider` — see `Form.tsx` — so
 * a module can reach `useWatch`, `useFieldArray` or `useController` inside a form.
 * This is only about the wiring the shell owns.
 */
export interface FieldContextValue {
  /** The control's `id`. The `Field`'s `<label>` points at it with `htmlFor`. */
  readonly controlId: string

  /** The ids of the hint and the error, space-joined, or `undefined` if neither. */
  readonly describedBy: string | undefined

  /** True when the field has an error message to show. */
  readonly invalid: boolean

  /** True when the field is declared required. */
  readonly required: boolean
}

/**
 * The context itself, exported for `Field` to provide and nothing else.
 *
 * It is deliberately not re-exported from the barrel: a module that could provide
 * or read this could build a control that looks like part of a field without being
 * inside one, which is the one thing the context exists to make impossible.
 */
export const FieldContext = createContext<FieldContextValue | null>(null)

/**
 * The enclosing `Field`'s wiring, or a failure that names what is missing.
 *
 * `component` is the caller's own name, so the message says which control was
 * rendered outside a field rather than which hook was called.
 */
export function useFieldContext(component: string): FieldContextValue {
  const value = useContext(FieldContext)
  if (value === null) {
    throw new Error(
      `<${component}> must be rendered inside a <Field>. A control outside a field has no label, no described-by and no error slot, so it would render without an accessible name.`,
    )
  }
  return value
}

/** The four attributes every control takes from its field, typed for JSX. */
export interface ControlWiring {
  readonly id: string
  readonly 'aria-invalid': true | undefined
  readonly 'aria-required': true | undefined
  readonly 'aria-describedby': string | undefined
}

/**
 * The wiring, as the attributes a control spreads onto its own element.
 *
 * Written once rather than once per control because these four are one contract:
 * a control that gained `aria-describedby` and lost `aria-invalid` would look
 * right, render right, and silently stop telling a screen reader that the value
 * it is reading is the one that failed validation. `TextInput` and `TextArea` are
 * the first two callers; the Jalali date picker and the searchable select are the
 * next two, which is what makes a shared helper rather than a copy worthwhile.
 *
 * `aria-required` rather than the native `required` attribute, deliberately. The
 * native one makes `:invalid` match on an empty required field **before anyone has
 * touched it**, so any `:invalid` styling would paint the whole form red on first
 * paint. The schema is the authority on what is required; this carries the
 * announcement.
 */
export function useControlWiring(component: string): ControlWiring {
  const field = useFieldContext(component)

  return {
    id: field.controlId,
    'aria-invalid': field.invalid ? true : undefined,
    'aria-required': field.required ? true : undefined,
    'aria-describedby': field.describedBy,
  }
}
