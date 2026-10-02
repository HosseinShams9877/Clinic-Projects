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
 * ## Why the CSS contract group reads the stylesheet
 *
 * For the reason `Button.test.tsx` gives in full: jsdom has no layout engine and no
 * cascade for pseudo-class state, so `:focus`, `:focus-visible`, `::placeholder`
 * and `:disabled` cannot be reached by rendering. Those assertions are text
 * assertions against the module's own source.
 *
 * The source is read with its comments stripped, because the file's header quotes
 * §13's colours in order to explain which token each became — and a hex check that
 * fails on its own documentation teaches nothing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm, useFormContext } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { Field, Form, FormError, SubmitButton, TextArea, TextInput } from '../index'

import styles from '../Form.module.css'
import buttonStyles from '../../button/Button.module.css'

/**
 * The module's rules with its comments removed. See the file header.
 *
 * Resolved through `import.meta.dirname` rather than `new URL(path,
 * import.meta.url)`: under the jsdom environment the global `URL` is jsdom's
 * implementation, which resolves a `file:` base against the document origin and
 * hands `readFileSync` an `http://localhost:3000/...` URL it rejects. See
 * `button/tests/Button.test.tsx` for the full note.
 */
const CSS = readFileSync(join(import.meta.dirname, '../Form.module.css'), 'utf8').replaceAll(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function classOf(key: string): string {
  const name = styles[key]
  if (name === undefined) throw new Error(`Form.module.css has no class \`${key}\``)
  return name
}

/**
 * `SubmitButton` renders a `Button`, so the class on the rendered element is
 * `Button.module.css`'s scoped name — not the literal `primary`, which no CSS
 * Module in this tree produces. Looked up through the module for the same reason
 * `classOf` looks the shell's own classes up: `next/types/global.d.ts` types a
 * lookup as `string | undefined`, and a renamed class should fail by naming itself.
 */
function buttonClassOf(key: string): string {
  const name = buttonStyles[key]
  if (name === undefined) throw new Error(`Button.module.css has no class \`${key}\``)
  return name
}

const CLASS = {
  form: classOf('form'),
  field: classOf('field'),
  label: classOf('label'),
  required: classOf('required'),
  control: classOf('control'),
  textarea: classOf('textarea'),
  hint: classOf('hint'),
  error: classOf('error'),
  formError: classOf('formError'),
} as const

/** The first descendant matching a selector, or a failure that names it. */
function queryOrThrow(root: ParentNode, selector: string): Element {
  const found = root.querySelector(selector)
  if (found === null) throw new Error(`no element matches \`${selector}\``)
  return found
}

/** The rendered `<form>`, found without depending on an implicit ARIA role. */
function formElement(container: HTMLElement): HTMLFormElement {
  const form = queryOrThrow(container, 'form')
  if (!(form instanceof HTMLFormElement)) throw new Error('the form is not a form element')
  return form
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

    expect(formElement(container)).toHaveClass(CLASS.form)
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

    const marker = queryOrThrow(container, `.${CLASS.required}`)

    expect(marker).toHaveTextContent('*')
    expect(marker).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks only the field that is required', () => {
    const { container } = render(<Harness onValid={vi.fn()} />)

    expect(container.querySelectorAll(`.${CLASS.required}`)).toHaveLength(1)
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

    expect(container.querySelector(`.${CLASS.error}`)).toBeNull()
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

    expect(screen.getByLabelText(/شماره موبایل/)).toHaveClass(CLASS.control)
    expect(textarea).toHaveClass(CLASS.control)
    expect(textarea).toHaveClass(CLASS.textarea)
    expect(container.querySelectorAll(`.${CLASS.control}`)).toHaveLength(2)
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

    expect(screen.getByRole('button', { name: SAVE })).toHaveClass(buttonClassOf('primary'))
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

describe('the CSS contract (§A1, §A9, §13)', () => {
  it('hard-codes no colour', () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('names no physical property (§A9)', () => {
    for (const pattern of [
      /(^|[\s;{])(margin|padding|border)-(left|right)\s*:/,
      /(^|[\s;{])(left|right)\s*:/,
      /(^|[\s;{])(width|height)\s*:/,
      /text-align:\s*(left|right)/,
    ]) {
      expect(CSS).not.toMatch(pattern)
    }
  })

  it('states §13’s control geometry and nothing else', () => {
    // The off-scale numbers §13 states, asserted so that the departure from A3 is
    // a written-down decision rather than a silent one. The 16px is `--s-4`, which
    // is on the scale, and is the demo's own spelling of it.
    expect(CSS).toMatch(/\.control\s*\{[^}]*padding: 11px var\(--s-4\)/)
    expect(CSS).toMatch(/\.control\s*\{[^}]*inline-size: 100%/)
    expect(CSS).toMatch(/\.control\s*\{[^}]*border: 1px solid var\(--line-2\)/)
    expect(CSS).toMatch(/\.field\s*\{[^}]*gap: 7px/)
    expect(CSS).toMatch(/\.textarea\s*\{[^}]*min-height: 96px/)
    expect(CSS).toMatch(/\.textarea\s*\{[^}]*line-height: 1\.8/)
  })

  it('takes §13’s colours, radius and type scale from tokens', () => {
    expect(CSS).toMatch(/\.control\s*\{[^}]*background: var\(--surface\)/)
    expect(CSS).toMatch(/\.control\s*\{[^}]*border-radius: var\(--r-sm\)/)
    expect(CSS).toMatch(/\.control\s*\{[^}]*font-size: var\(--fs-sm\)/)
    expect(CSS).toMatch(/\.control::placeholder\s*\{[^}]*color: var\(--ink-3\)/)
    expect(CSS).toMatch(/\.label\s*\{[^}]*color: var\(--ink-2\)/)
    expect(CSS).toMatch(/\.required\s*\{[^}]*color: var\(--danger\)/)
    expect(CSS).toMatch(/\.hint\s*\{[^}]*color: var\(--ink-3\)/)
  })

  it('states §13’s focus treatment', () => {
    expect(CSS).toMatch(/\.control:focus\s*\{[^}]*outline: none/)
    expect(CSS).toMatch(/\.control:focus\s*\{[^}]*border-color: var\(--brand-300\)/)
    expect(CSS).toMatch(/\.control:focus\s*\{[^}]*box-shadow: 0 0 0 3px var\(--brand-50\)/)
  })

  it('restores the product’s own focus ring for keyboard users', () => {
    // §13's `outline: none` cancels `globals.css`'s `:focus-visible` rule, because
    // a class with a pseudo-class outranks a bare pseudo-class. Its ring cannot
    // stand in: `--brand-50` on `--surface` is about 1.1:1, so a keyboard user
    // tabbing through a form would have no indicator meeting WCAG 2.1 SC 1.4.11's
    // 3:1 — on the control they are about to type into. The brand outline is
    // 3.98:1 on white. See the module's header.
    expect(CSS).toMatch(/\.control:focus-visible\s*\{[^}]*outline: 2px solid var\(--brand\)/)
    expect(CSS).toMatch(/\.control:focus-visible\s*\{[^}]*outline-offset: 2px/)
  })

  it('marks an invalid control with the status colour, and not with colour alone', () => {
    // §A13 reserves `--danger` for a status, and this is one. The message below the
    // control is the primary signal, so nothing here depends on a colour being seen.
    expect(CSS).toMatch(/\.control\[aria-invalid='true'\]\s*\{[^}]*border-color: var\(--danger\)/)
    expect(CSS).toMatch(/\.error\s*\{[^}]*color: var\(--danger\)/)
  })

  it('recesses a disabled control and says why it cannot be used', () => {
    expect(CSS).toMatch(/\.control:disabled\s*\{[^}]*background: var\(--surface-sunken\)/)
    expect(CSS).toMatch(/\.control:disabled\s*\{[^}]*cursor: not-allowed/)
  })

  it('takes the control transition from the token globals.css defines', () => {
    expect(CSS).toContain('transition: var(--transition-control)')
  })

  it('uses the spacing scale for every gap §13 does not fix', () => {
    // A3. The only literals in this file are the ones §13 states — `7px`, `11px`,
    // `96px` and the 3px ring — which `Button.module.css` argues at length.
    expect(CSS).toMatch(/\.form\s*\{[^}]*gap: var\(--s-4\)/)
    expect(CSS).toMatch(/\.error\s*\{[^}]*gap: var\(--s-1\)/)
    expect(CSS).toMatch(/\.formError\s*\{[^}]*gap: var\(--s-2\)/)
  })
})
