// @vitest-environment jsdom
/**
 * The form shell — `01-tech-stack.md` §8.5, `08-ui-design-system.md` §13, and the
 * A-rules that are checkable here.
 *
 * ## What these tests are protecting
 *
 * A form is the one surface where an accessibility defect is invisible in review
 * and expensive in use: a label associated with nothing, an error message rendered
 * but never announced, an `aria-describedby` naming an element that is not on the
 * page when the message is absent. All three render correctly and all three are
 * silent. So most of what is asserted below is the **wiring** — which attribute
 * names which id — rather than what the markup looks like.
 *
 * The form is composed the way a module composes it: `useForm` with a Zod resolver,
 * `register` on the control, and the three things §8.5 leaves to the module — the
 * label, the field name, the message. That is deliberate. A test that handed the
 * shell hand-made props would not be exercising the composition the shell exists
 * for.
 *
 * ## What this file no longer checks
 *
 * The CSS-contract group that read `Form.module.css` is gone with the file. Its
 * subject was the stylesheet's own text — token spellings, the `11px` and `96px`
 * literals §13 states, the focus treatment — and the equivalent reading of compiled
 * Tailwind output would be testing the engine rather than the shell. Two things
 * survived the move and are asserted differently: the §13 styling is now an exported
 * string (`CONTROL_CLASSES`), so the test asks the component what a control should
 * carry instead of grepping a file; and the required marker is found by the fact
 * that it is the hidden span inside the label rather than by a class name. See the
 * report for the full list of what was deleted.
 */

import type { ReactNode } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm, useFormContext } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { VARIANT_CLASSES } from '../../button/Button'
import { Field, Form, FormError, SubmitButton, TextArea, TextInput } from '../index'
import { CONTROL_CLASSES, TEXTAREA_CLASSES } from '../control-classes'

/** The rendered `<form>`, found without depending on an implicit ARIA role. */
function formElement(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form')
  if (form === null) throw new Error('the shell rendered no form element')
  if (!(form instanceof HTMLFormElement)) throw new Error('the form is not a form element')
  return form
}

/**
 * The required marker, or a failure saying where it should have been.
 *
 * It is the one child of the label that is hidden from assistive technology, which
 * is how the shell marks it and therefore how this test finds it — the class it
 * happens to carry is not the contract, the `aria-hidden` and the `*` are.
 */
function markerIn(container: HTMLElement): Element {
  const marker = container.querySelector('label span[aria-hidden="true"]')
  if (marker === null) throw new Error('no required marker inside the label')
  return marker
}

/**
 * Submits and lets the resolver settle, returning the event that was dispatched.
 *
 * The event is dispatched rather than fired through `fireEvent.submit` so the test
 * can read `defaultPrevented` afterwards: RHF's handler always cancels the
 * browser's own submission, and a form that reloads the page on a validation
 * failure loses everything the user typed.
 */
async function submit(form: HTMLFormElement): Promise<Event> {
  const event = new Event('submit', { bubbles: true, cancelable: true })
  await act(async () => {
    form.dispatchEvent(event)
  })
  return event
}

/**
 * Renders something that is expected to fail, and returns the failure's text.
 *
 * React 19 reports an uncaught render error through the root's `onUncaughtError`
 * rather than throwing it out of `render`, so `expect(() => render(...)).toThrow()`
 * is no longer a portable assertion. Whether the error arrives as a throw — React
 * 18, and React 19 where the renderer rethrows — or as a reported error, the
 * message is what the test is about, so this takes whichever arrives.
 */
function failureOf(node: ReactNode): string {
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(node)
  } catch (error) {
    report.mockRestore()
    return error instanceof Error ? error.message : String(error)
  }
  const calls: readonly unknown[][] = report.mock.calls
  const seen = calls.flat().map(String).join(' ')
  report.mockRestore()
  return seen
}

/* ── The harnesses ────────────────────────────────────────────────────────── */

/** The module's schema — the single definition §8.5 says the server shares. */
const schema = z.object({
  mobile: z.string().min(11, 'شماره موبایل باید ۱۱ رقم باشد'),
  note: z.string(),
})

type Values = z.infer<typeof schema>

const LABEL = 'شماره موبایل'
const NOTE_LABEL = 'یادداشت'
const HINT = 'بدون صفر ابتدایی هم پذیرفته می‌شود'
const SAVE = 'ذخیره'
const MOBILE = '09123456789'
const EMPTY: Values = { mobile: '', note: '' }

/**
 * A form composed exactly as a module composes one.
 *
 * `loading` is read from `formState` here rather than inside `SubmitButton`;
 * `SubmitButton.tsx` argues why that is the only place it can be read correctly.
 */
function Harness({ onValid }: { readonly onValid: (values: Values) => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY },
  })

  return (
    <Form form={form} onValid={onValid}>
      <Field label={LABEL} required hint={HINT} error={form.formState.errors.mobile?.message}>
        <TextInput {...form.register('mobile')} inputMode="tel" />
      </Field>

      <Field label={NOTE_LABEL}>
        <TextArea {...form.register('note')} />
      </Field>

      <FormError error={form.formState.errors.root?.server?.message} />

      <SubmitButton loading={form.formState.isSubmitting}>{SAVE}</SubmitButton>
    </Form>
  )
}

/** A bare shell around arbitrary children, for testing the shell itself. */
function Shell({
  children,
  defaults = EMPTY,
}: {
  readonly children: ReactNode
  readonly defaults?: Values
}) {
  const form = useForm<Values>({ defaultValues: { ...defaults } })
  return (
    <Form form={form} onValid={vi.fn()}>
      {children}
    </Form>
  )
}

describe('Form', () => {
  it('renders a real form element', () => {
    const { container } = render(<Harness onValid={vi.fn()} />)

    expect(formElement(container)).toBeInstanceOf(HTMLFormElement)
  })

  it('turns off the browser’s own validation', () => {
    // The UA's validation bubbles are localised by the browser, not by the
    // product, so they are English with Latin digits on a machine that is not set
    // to Persian — a §9 "no Latin digits" failure that is invisible on a
    // developer's `fa-IR` machine.
    const { container } = render(<Harness onValid={vi.fn()} />)

    expect(formElement(container)).toHaveAttribute('novalidate')
  })

  it('provides the form to everything inside it', () => {
    // §8.5's shell wraps RHF as well as its own wiring, so a module can reach
    // `useWatch`, `useFieldArray` or `useController` inside a form. Without
    // `FormProvider` this throws on `getValues` — which is the failure being
    // asserted against, since RHF's own `useFormContext` is typed as non-null and
    // does not throw on its own.
    function Probe() {
      const form = useFormContext<Values>()
      return <p data-testid="probe">{form.getValues('mobile')}</p>
    }

    render(
      <Shell defaults={{ mobile: MOBILE, note: '' }}>
        <Probe />
      </Shell>,
    )

    expect(screen.getByTestId('probe')).toHaveTextContent(MOBILE)
  })

  it('hands the validated values to the module', async () => {
    const onValid = vi.fn()
    const { container } = render(<Harness onValid={onValid} />)

    fireEvent.change(screen.getByLabelText(/شماره موبایل/), { target: { value: MOBILE } })
    await submit(formElement(container))

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledExactlyOnceWith({ mobile: MOBILE, note: '' })
    })
  })

  it('does not hand anything to the module when the schema rejects the values', async () => {
    // An empty mobile fails `min(11)`. The module's handler must not run, and the
    // browser must not be allowed to navigate away from a form the user filled in.
    const onValid = vi.fn()
    const { container } = render(<Harness onValid={onValid} />)

    const event = await submit(formElement(container))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(onValid).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('Field', () => {
  it('associates its label with the control', () => {
    // The failure this replaces is the demo's `<span class="label">`, which is
    // associated with nothing: the control has no accessible name, which is an axe
    // violation and a control a screen reader cannot identify.
    render(<Harness onValid={vi.fn()} />)

    expect(screen.getByLabelText(/شماره موبایل/)).toBeInTheDocument()
  })

  it('marks a required field, and hides the marker from assistive technology', () => {
    // §13 gives the marker a colour and no glyph; the demo's glyph is `*`. The
    // announcement comes from `aria-required` on the control, so a marker read
    // aloud as "star" would be noise on top of it.
    const { container } = render(<Harness onValid={vi.fn()} />)

    const marker = markerIn(container)

    expect(marker).toHaveTextContent('*')
    expect(marker).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks only the field that is required', () => {
    const { container } = render(<Harness onValid={vi.fn()} />)

    expect(container.querySelectorAll('label span[aria-hidden="true"]')).toHaveLength(1)
    expect(screen.getByLabelText(/یادداشت/)).not.toHaveAttribute('aria-required')
  })

  it('puts the required state on the control, not only on the marker', () => {
    render(<Harness onValid={vi.fn()} />)

    expect(screen.getByLabelText(/شماره موبایل/)).toHaveAttribute('aria-required', 'true')
  })

  it('renders the hint and describes the control with it', () => {
    render(<Harness onValid={vi.fn()} />)

    const hint = screen.getByText(HINT)

    expect(screen.getByLabelText(/شماره موبایل/)).toHaveAttribute('aria-describedby', hint.id)
  })

  it('renders no error slot until there is an error', () => {
    // An empty `role="alert"` announces nothing, and a slot that appears later
    // moves everything below it.
    const { container } = render(<Harness onValid={vi.fn()} />)

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('renders the error as an alert and describes the control with it', async () => {
    const { container } = render(<Harness onValid={vi.fn()} />)

    await submit(formElement(container))

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('شماره موبایل باید ۱۱ رقم باشد')
    expect(screen.getByLabelText(/شماره موبایل/)).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(alert.id),
    )
  })

  it('marks the control invalid only while it has an error', async () => {
    const { container } = render(<Harness onValid={vi.fn()} />)

    expect(screen.getByLabelText(/شماره موبایل/)).not.toHaveAttribute('aria-invalid')

    await submit(formElement(container))

    await waitFor(() => {
      expect(screen.getByLabelText(/شماره موبایل/)).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('describes the control with the hint first and the error after it', async () => {
    // The two slots share one attribute, so the order is the reading order: the
    // hint was there first, and the message is what changed.
    const { container } = render(<Harness onValid={vi.fn()} />)

    await submit(formElement(container))

    const alert = await screen.findByRole('alert')
    const hint = screen.getByText(HINT)

    expect(screen.getByLabelText(/شماره موبایل/)).toHaveAttribute(
      'aria-describedby',
      `${hint.id} ${alert.id}`,
    )
  })
})

describe('TextInput and TextArea', () => {
  it('renders both control types and styles them to §13', () => {
    const { container } = render(<Harness onValid={vi.fn()} />)

    const textarea = screen.getByLabelText(/یادداشت/)
    const input = screen.getByLabelText(/شماره موبایل/)

    // `CONTROL_CLASSES` is the §13 contract the shell exports, so asking it which
    // classes a control carries and checking the rendered element has them is the
    // assertion the move to Tailwind made possible: it proves the styling reached
    // the DOM rather than that a rule was written somewhere.
    expect(input).toHaveClass(CONTROL_CLASSES)
    expect(textarea).toHaveClass(CONTROL_CLASSES)
    expect(textarea).toHaveClass(TEXTAREA_CLASSES)
    expect(container.querySelectorAll('input, textarea')).toHaveLength(2)
  })

  it('forwards the props its caller passes', () => {
    render(<Harness onValid={vi.fn()} />)

    const input = screen.getByLabelText(/شماره موبایل/)

    expect(input).toHaveAttribute('inputmode', 'tel')
    expect(input).toHaveAttribute('name', 'mobile')
  })

  it('appends the caller’s class last', () => {
    render(
      <Shell>
        <Field label={LABEL}>
          <TextInput className="span-2" />
        </Field>
      </Shell>,
    )

    const input = screen.getByLabelText(/شماره موبایل/)

    expect(input).toHaveClass('span-2')
    expect(input.getAttribute('class')?.endsWith('span-2')).toBe(true)
  })

  it('refuses to render an input outside a Field', () => {
    // A control with no field has no label, nothing to describe it and no error
    // slot, so it renders without an accessible name. Making that loud is cheaper
    // than a form that quietly fails an audit.
    expect(failureOf(<TextInput />)).toMatch(/<TextInput> must be rendered inside a <Field>/)
  })

  it('refuses to render a textarea outside a Field too', () => {
    expect(failureOf(<TextArea />)).toMatch(/<TextArea> must be rendered inside a <Field>/)
  })
})

describe('SubmitButton', () => {
  it('submits, which is the default it exists to invert', () => {
    // `Button` defaults `type` to `button`, so that a stray button inside a form
    // cannot submit it. A submit button needs the opposite default, and the
    // mistake it prevents — a button that looks like the form's action and does
    // nothing — produces no error and no visual difference.
    render(<Harness onValid={vi.fn()} />)

    expect(screen.getByRole('button', { name: SAVE })).toHaveAttribute('type', 'submit')
  })

  it('is the primary action of the form', () => {
    render(<Harness onValid={vi.fn()} />)

    expect(screen.getByRole('button', { name: SAVE })).toHaveClass(VARIANT_CLASSES.primary)
  })

  it('carries the loading state through to the button', () => {
    render(
      <Shell>
        <SubmitButton loading>{SAVE}</SubmitButton>
      </Shell>,
    )

    const button = screen.getByRole('button', { name: SAVE })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('can be disabled', () => {
    render(
      <Shell>
        <SubmitButton disabled>{SAVE}</SubmitButton>
      </Shell>,
    )

    expect(screen.getByRole('button', { name: SAVE })).toBeDisabled()
  })
})

describe('FormError', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<FormError />)

    expect(container).toBeEmptyDOMElement()
  })

  it('announces a form-level failure', () => {
    render(<FormError error="ذخیره نشد. دوباره تلاش کنید." />)

    expect(screen.getByRole('alert')).toHaveTextContent('ذخیره نشد. دوباره تلاش کنید.')
  })

  it('shows a server error that belongs to the form rather than to a field', async () => {
    // The composition a module uses: `form.setError('root.server', …)`, whose key
    // is not a field name and which therefore has no control to describe.
    function ServerErrorForm() {
      const form = useForm<Values>({ defaultValues: EMPTY })
      return (
        <Form form={form} onValid={vi.fn()}>
          <Field label={LABEL}>
            <TextInput {...form.register('mobile')} />
          </Field>
          <FormError error={form.formState.errors.root?.server?.message} />
          <button
            type="button"
            onClick={() => {
              form.setError('root.server', { message: 'اتصال قطع شد' })
            }}
          >
            trigger
          </button>
        </Form>
      )
    }

    render(<ServerErrorForm />)

    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('اتصال قطع شد')
  })
})
