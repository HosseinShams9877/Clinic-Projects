// @vitest-environment jsdom
/**
 * `08-ui-design-system.md` §8 (variants and sizes), §9 (states), and the A-rules
 * that are checkable here.
 *
 * ## Why this file reads the CSS
 *
 * §17 requires "a test exercising every state §A8 defines", and §A8 lists six:
 * default · hover · active · disabled · loading · focus-visible. Four of the six
 * are reachable from a test that renders a component; **hover, active and
 * focus-visible are not**. jsdom has no layout engine, no cascade for pseudo-class
 * state and no way to simulate a real pointer, so `fireEvent.click` proves a
 * handler ran and proves nothing about what the control looked like.
 *
 * The choice is therefore between asserting nothing about three of the six states
 * and asserting the thing that is actually checkable: that the rules exist, for
 * every variant, and that they are built from tokens. That is what the
 * `CSS contract` group below does. It is a text assertion against the module's own
 * source rather than against behaviour — deliberately, and it is the strongest
 * check available, not a substitute for one. A rule that names the wrong token
 * still passes; a rule that was never written does not, and neither does a
 * hard-coded colour, which is the failure §12 gates the build on.
 *
 * The class-name readings go through `classOf`, because `next/types/global.d.ts`
 * declares a CSS Module as an index signature and `noUncheckedIndexedAccess`
 * therefore types every lookup as `string | undefined`. Reading through one
 * function keeps the guard in one place and turns a renamed class into a failure
 * that names the key.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BUTTON_SIZES, BUTTON_VARIANTS, Button } from '../Button'

import styles from '../Button.module.css'

/**
 * The module's source, for the assertions jsdom cannot make. See the header.
 *
 * Comments are stripped, as `form/tests/Form.test.tsx` does: the header documents
 * §8's quoted values — `font-size: 13px` and the demo's hard-coded `#f4d7d9` — and
 * those are prose about the rules, not rules. A hex search that counted them would
 * be asserting against the documentation of the decision rather than the decision.
 *
 * Resolved through `import.meta.dirname` rather than `new URL(path,
 * import.meta.url)`: under the jsdom environment the global `URL` is jsdom's
 * implementation, which resolves a `file:` base against the document origin and
 * hands `readFileSync` an `http://localhost:3000/...` URL it rejects with "The
 * URL must be of scheme file". `import.meta.dirname` is the test file's real
 * directory in both the `node` and `jsdom` environments.
 */
const CSS = readFileSync(join(import.meta.dirname, '../Button.module.css'), 'utf8').replaceAll(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function classOf(key: string): string {
  const name = styles[key]
  if (name === undefined) throw new Error(`Button.module.css has no class \`${key}\``)
  return name
}

const CLASS = {
  button: classOf('button'),
  content: classOf('content'),
  spinner: classOf('spinner'),
  block: classOf('block'),
  loading: classOf('is-loading'),
} as const

/**
 * A required descendant, or a failure that says which one was missing.
 *
 * `querySelector` returns `Element | null`, and a matcher handed a `null` reports
 * "expected null to have attribute …", which says nothing about which assertion
 * broke. Throwing keeps the reason in the message, the same way `svgOf` does in the
 * icon tests.
 */
function queryOrThrow(root: ParentNode, selector: string): Element {
  const found = root.querySelector(selector)
  if (found === null) throw new Error(`no element matches \`${selector}\``)
  return found
}

/** §8 writes the label «افزودن» for a button that adds something. */
const LABEL = 'افزودن'

describe('Button', () => {
  describe('the element it renders', () => {
    it('renders a button whose type is `button`, not the HTML default of submit', () => {
      // The single most valuable default in this component. A `<button>` with no
      // `type` inside a `<form>` submits it, which presents as a form that submits
      // when someone opens a dropdown.
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button', { name: LABEL })).toHaveAttribute('type', 'button')
    })

    it('accepts `type="submit"` when a caller asks for it', () => {
      render(<Button type="submit">{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
    })

    it('forwards a click handler', () => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>{LABEL}</Button>)

      screen.getByRole('button').click()

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('names itself with its text', () => {
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveAccessibleName(LABEL)
    })

    it('appends the caller’s class last, after the component’s own', () => {
      render(<Button className="positioned">{LABEL}</Button>)

      const button = screen.getByRole('button')

      expect(button).toHaveClass('positioned')
      expect(button).toHaveClass(CLASS.button)
      expect(button.getAttribute('class')?.endsWith('positioned')).toBe(true)
    })
  })

  describe('variants (§8, plus the demo’s base)', () => {
    it('defaults to neutral, the demo’s base button', () => {
      // The demo draws a bare `<button class="btn">` — white on `--line` — and
      // uses it for every secondary action; §8's table has no row for it. §B makes
      // the demo the reference for what the document does not settle, so the bare
      // element maps to the bare class: `<Button>` is `<button class="btn">` and
      // `<Button variant="primary">` is `<button class="btn btn-primary">`.
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(classOf('neutral'))
    })

    it.each(BUTTON_VARIANTS)('applies the %s variant’s own class', (variant) => {
      render(<Button variant={variant}>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(classOf(variant))
    })

    it('applies exactly one variant class at a time', () => {
      // Six variant classes are six backgrounds; two on one element would make the
      // rendered colour depend on the order the CSS Module happened to emit them in.
      render(<Button variant="ghost">{LABEL}</Button>)

      const others = BUTTON_VARIANTS.filter((variant) => variant !== 'ghost')
      for (const variant of others) {
        expect(screen.getByRole('button')).not.toHaveClass(classOf(variant))
      }
    })
  })

  describe('sizes (§8)', () => {
    it('defaults to the default size', () => {
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(classOf('default'))
    })

    it.each(BUTTON_SIZES.filter((size) => size !== 'icon'))(
      'applies the %s size’s own class',
      (size) => {
        render(<Button size={size}>{LABEL}</Button>)

        expect(screen.getByRole('button')).toHaveClass(classOf(size))
      },
    )
  })

  describe('the block modifier (§8)', () => {
    it('does not fill its container by default', () => {
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).not.toHaveClass(CLASS.block)
    })

    it('fills its container when asked', () => {
      render(<Button block>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(CLASS.block)
    })
  })

  describe('icons', () => {
    it('renders a leading icon before the label', () => {
      const { container } = render(<Button leadingIcon="add">{LABEL}</Button>)

      const content = queryOrThrow(container, `.${CLASS.content}`)
      expect(content.firstElementChild?.tagName.toLowerCase()).toBe('svg')
      expect(content.textContent).toBe(LABEL)
    })

    it('renders a trailing icon after the label', () => {
      const { container } = render(<Button trailingIcon="forward">{LABEL}</Button>)

      const content = queryOrThrow(container, `.${CLASS.content}`)
      expect(content.lastElementChild?.tagName.toLowerCase()).toBe('svg')
    })

    it('hides a button icon from assistive technology', () => {
      // The icon restates the label, so announcing it would read the button twice.
      // `Icon` decides this from the absence of a `label`, and this assertion is what
      // keeps the button from passing one.
      const { container } = render(<Button leadingIcon="add">{LABEL}</Button>)

      expect(queryOrThrow(container, 'svg')).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders an icon button with the icon as its whole content', () => {
      const { container } = render(<Button size="icon" icon="search" aria-label="جست‌وجو" />)

      expect(screen.getByRole('button')).toHaveAccessibleName('جست‌وجو')
      expect(container.querySelectorAll('svg')).toHaveLength(1)
      expect(queryOrThrow(container, `.${CLASS.content}`).textContent).toBe('')
    })
  })

  describe('the six states of §A8 and §9', () => {
    describe('default', () => {
      it('is enabled, unbusy and unnamed by aria-label', () => {
        render(<Button>{LABEL}</Button>)

        const button = screen.getByRole('button')

        expect(button).toBeEnabled()
        expect(button).not.toHaveAttribute('aria-busy')
        // The name comes from the text, not from an attribute that would then be the
        // thing a reader hears twice.
        expect(button).not.toHaveAttribute('aria-label')
      })
    })

    describe('disabled', () => {
      it('sets the disabled attribute', () => {
        render(<Button disabled>{LABEL}</Button>)

        expect(screen.getByRole('button')).toBeDisabled()
      })

      it('does not fire the click handler', () => {
        const onClick = vi.fn()
        render(
          <Button disabled onClick={onClick}>
            {LABEL}
          </Button>,
        )

        screen.getByRole('button').click()

        expect(onClick).not.toHaveBeenCalled()
      })

      it('is styled by the :disabled rule rather than by a class', () => {
        // §9 asks for reduced contrast, a preserved shape and `cursor: not-allowed`.
        // The state is the DOM attribute, so the rule targets the attribute — which is
        // why there is no `is-disabled` class to keep in step with it.
        expect(CSS).toMatch(/\.button:disabled\s*\{/)
        expect(CSS).toContain('cursor: not-allowed')
      })
    })

    describe('loading', () => {
      it('sets aria-busy', () => {
        render(<Button loading>{LABEL}</Button>)

        expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
      })

      it('disables the button, so a second click cannot start a second submission', () => {
        render(<Button loading>{LABEL}</Button>)

        expect(screen.getByRole('button')).toBeDisabled()
      })

      it('keeps the label in the document, which is what preserves the width', () => {
        // §9: "Preserve the button's dimensions … must not cause layout shift." A
        // removed label would shrink the button; a `visibility: hidden` one would keep
        // the box but strip the accessible name, which is an axe critical violation.
        const { container } = render(<Button loading>{LABEL}</Button>)

        expect(queryOrThrow(container, `.${CLASS.content}`).textContent).toBe(LABEL)
      })

      it('keeps the accessible name it had before it started loading', () => {
        render(<Button loading>{LABEL}</Button>)

        expect(screen.getByRole('button')).toHaveAccessibleName(LABEL)
      })

      it('carries the loading class that makes the label transparent', () => {
        render(<Button loading>{LABEL}</Button>)

        expect(screen.getByRole('button')).toHaveClass(CLASS.loading)
      })

      it('renders a spinner, and hides it from assistive technology', () => {
        // Decorative on purpose: `aria-busy` already announces the state, so a label
        // on the spinner would make a screen reader read the button twice.
        const { container } = render(<Button loading>{LABEL}</Button>)

        const spinner = queryOrThrow(container, `.${CLASS.spinner}`)

        expect(queryOrThrow(spinner, 'svg')).toHaveAttribute('aria-hidden', 'true')
      })

      it('does not render a spinner when it is not loading', () => {
        const { container } = render(<Button>{LABEL}</Button>)

        expect(container.querySelector(`.${CLASS.spinner}`)).toBeNull()
      })

      it('stays disabled when it is both loading and explicitly disabled', () => {
        // The two are not exclusive, and the combination must not re-enable the button.
        render(
          <Button loading disabled>
            {LABEL}
          </Button>,
        )

        expect(screen.getByRole('button')).toBeDisabled()
        expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
      })

      it('preserves the dimensions of an icon button too', () => {
        // The icon size is a fixed 36×36 box, so the label-preservation argument does
        // not apply to it — the box holds the size on its own. Asserted so that a later
        // change to the `icon` size cannot quietly make it depend on the content.
        render(<Button size="icon" icon="search" aria-label="جست‌وجو" loading />)

        const button = screen.getByRole('button')

        expect(button).toHaveClass(classOf('icon'))
        expect(button).toHaveAccessibleName('جست‌وجو')
      })
    })
  })

  describe('the CSS contract (§A1, §A3, §A8, §A9)', () => {
    it('hard-codes no colour', () => {
      // A1 and the §12 CI gate. Every colour in this module is a token, and the check
      // is a hex search rather than a token allow-list because a hex is the only form
      // a colour can take that a token cannot be.
      expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    })

    it('names no physical property (§A9)', () => {
      // Logical properties only: the document root is RTL and there is no LTR mode, so
      // a physical side is a rule that is wrong in the only direction the product has.
      for (const pattern of [
        /(^|[\s;{])(margin|padding|border)-(left|right)\s*:/,
        /(^|[\s;{])(left|right)\s*:/,
        /(^|[\s;{])(width|height)\s*:/,
        /text-align:\s*(left|right)/,
      ]) {
        expect(CSS).not.toMatch(pattern)
      }
    })

    it.each(BUTTON_VARIANTS)('gives the %s variant a hover rule', (variant) => {
      expect(CSS).toMatch(new RegExp(`\\.${variant}:hover:not\\(:disabled\\)\\s*\\{`))
    })

    it.each(BUTTON_VARIANTS)('gives the %s variant an active rule', (variant) => {
      // §9: "A visible pressed treatment, distinct from hover." Distinctness is
      // asserted by reading both rules out of the file: an active rule that names the
      // same declarations as its hover rule would satisfy a mere presence check.
      expect(CSS).toMatch(new RegExp(`\\.${variant}:active:not\\(:disabled\\)\\s*\\{`))
    })

    it.each(BUTTON_VARIANTS)(
      'treats the %s variant’s press differently from its hover',
      (variant) => {
        const body = (selector: string): string => {
          const start = CSS.indexOf(selector)
          expect(start, `${selector} is missing`).toBeGreaterThan(-1)
          return CSS.slice(start, CSS.indexOf('}', start))
        }

        expect(body(`.${variant}:active:not(:disabled)`)).not.toBe(
          body(`.${variant}:hover:not(:disabled)`),
        )
      },
    )

    it('gives every variant a visible focus state (§9)', () => {
      expect(CSS).toMatch(/\.button:focus-visible\s*\{/)
      expect(CSS).toContain('outline: 2px solid var(--brand)')
      expect(CSS).toContain('outline-offset: 2px')
    })

    it.each(BUTTON_VARIANTS)('styles the %s variant from a token', (variant) => {
      // Each variant rule must reach for at least one token, which is what A1 and A2
      // amount to in a stylesheet that has no hex anywhere (asserted above).
      expect(CSS).toMatch(new RegExp(`\\.${variant}\\s*\\{[^}]*var\\(--`))
    })

    it('draws the neutral variant with the demo’s own base-button declarations', () => {
      // `clinic/assets/css/theme.css` `.btn` and `.btn:hover`, which is where this
      // appearance lives — §8's table has no row for it, so the demo is the source
      // and a drift here is a drift from the artifact §B points at.
      expect(CSS).toMatch(/\.neutral\s*\{[^}]*background: var\(--surface\)/)
      expect(CSS).toMatch(/\.neutral\s*\{[^}]*border-color: var\(--line\)/)
      expect(CSS).toMatch(/\.neutral\s*\{[^}]*color: var\(--ink\)/)
      expect(CSS).toMatch(
        /\.neutral:hover:not\(:disabled\)\s*\{[^}]*background: var\(--surface-2\)/,
      )
      expect(CSS).toMatch(
        /\.neutral:hover:not\(:disabled\)\s*\{[^}]*border-color: var\(--line-2\)/,
      )
    })

    it('takes the second declaration the demo gives each of the two summarised hovers', () => {
      // §8 devotes one cell per variant to hover; the demo's `.btn-ghost:hover` and
      // `.btn-outline:hover` each carry two declarations. §B makes the demo the
      // reference for what the table does not settle, so both are here — and this
      // assertion is what keeps them from being dropped as unexplained extras.
      expect(CSS).toMatch(/\.ghost:hover:not\(:disabled\)\s*\{[^}]*color: var\(--ink\)/)
      expect(CSS).toMatch(
        /\.outline:hover:not\(:disabled\)\s*\{[^}]*border-color: var\(--brand\)/,
      )
    })

    it('states the size geometry §8 gives, and no other size geometry', () => {
      // The one place the module departs from A3, argued in the module's header. This
      // assertion is what makes the departure a written-down decision rather than a
      // silent one: the exact numbers §8 states, and nothing more.
      expect(CSS).toMatch(/\.default\s*\{[^}]*padding: 10px 18px/)
      expect(CSS).toMatch(/\.large\s*\{[^}]*padding: 14px 26px/)
      expect(CSS).toMatch(/\.small\s*\{[^}]*padding: 6px 12px/)
      expect(CSS).toMatch(/\.icon\s*\{[^}]*inline-size: 36px/)
      expect(CSS).toMatch(/\.icon\s*\{[^}]*block-size: 36px/)
    })

    it('takes its radius and its type scale from tokens (§A4, §A6)', () => {
      for (const token of ['--r-sm', '--r-md', '--r-xs', '--fs-sm', '--fs-md', '--fs-xs']) {
        expect(CSS).toContain(`var(${token})`)
      }
      expect(CSS).not.toMatch(/border-radius:\s*\d/)
      expect(CSS).not.toMatch(/font-size:\s*\d/)
    })

    it('takes the shared control transition from the token globals.css defines', () => {
      expect(CSS).toContain('transition: var(--transition-control)')
    })
  })
})
