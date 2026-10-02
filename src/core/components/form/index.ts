/**
 * `src/core/components/form` — the shared Persian form shell, and its public
 * surface.
 *
 * `01-tech-stack.md` §8.5: "The shared Persian form shell (`src/core/components/form`)
 * wraps both: field layout, the Persian label, the error slot, and RTL are defined
 * once, and a module's form composes it rather than restating it."
 *
 * ## How a module uses it
 *
 * ```tsx
 * const form = useForm({ resolver: zodResolver(schema), defaultValues })
 *
 * <Form form={form} onValid={submit}>
 *   <Field label={catalog.mobile} required error={form.formState.errors.mobile?.message}>
 *     <TextInput {...form.register('mobile')} inputMode="tel" />
 *   </Field>
 *   <FormError error={form.formState.errors.root?.server?.message} />
 *   <SubmitButton loading={form.formState.isSubmitting}>{catalog.save}</SubmitButton>
 * </Form>
 * ```
 *
 * The module contributes three things and the shell contributes the rest. It
 * contributes the **labels** (from its catalog — never a literal, per §14), the
 * **field names** (through `register`, which is the only place RHF can check that a
 * name is a field of this form), and the **error messages** (formatted by the
 * module's Zod schema in its `validation/`).
 *
 * The shell contributes the `<form>` element and its `noValidate`, the field
 * layout, the label and its `htmlFor`, the required marker, the hint slot, the
 * error slot with its `role="alert"`, and the four wiring attributes — `id`,
 * `aria-invalid`, `aria-required`, `aria-describedby` — that a module cannot write
 * correctly by hand at every call site and cannot see when it gets wrong.
 *
 * ## What is exported, and why `useControlWiring` is
 *
 * The six components and their prop types. `useControlWiring` and `ControlWiring`
 * are exported as well, and they are the only internal of the shell that is: a
 * **control** that is not one of the two text controls — the Jalali date picker in
 * `src/core/components/date-picker`, the searchable select in
 * `src/core/components/combobox` — has to join the same contract, and the contract
 * is these four attributes. Exporting them means the third and fourth controls add
 * no wiring of their own, which is the only way the guarantee stays true as the
 * count grows.
 *
 * `FieldContext` itself is not exported. Providing or reading it directly would
 * let something look like a control inside a field without being one, and the
 * point of the context is that a control rendered outside a field fails loudly.
 */

export { Form } from './Form'
export type { FormProps } from './Form'

export { Field } from './Field'
export type { FieldProps } from './Field'

export { TextInput } from './TextInput'
export type { TextInputProps } from './TextInput'

export { TextArea } from './TextArea'
export type { TextAreaProps } from './TextArea'

export { SubmitButton } from './SubmitButton'
export type { SubmitButtonProps } from './SubmitButton'

export { FormError } from './FormError'
export type { FormErrorProps } from './FormError'

export { useControlWiring } from './field-context'
export type { ControlWiring } from './field-context'
