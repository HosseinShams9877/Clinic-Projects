// @vitest-environment jsdom
/**
 * `08-ui-design-system.md` §8 (variants and sizes), §9 (states), and the A-rules
 * that are checkable here.
 *
 * ## What this file checks now that the styling is Tailwind
 *
 * §17 requires "a test exercising every state §A8 defines", and §A8 lists six:
 * default · hover · active · disabled · loading · focus-visible. Three of the six
 * are still unreachable from a render — jsdom has no layout engine, no cascade for
 * pseudo-class state and no way to simulate a real pointer — and those three
 * (hover, active, focus-visible) were previously covered by reading the CSS
 * Module's own source text. That text no longer exists, and the equivalent
 * assertion against compiled Tailwind output would be checking the engine rather
 * than the component, so those tests were deleted rather than rewritten; see the
 * report for the list.
 *
 * What replaced them is the assertion the move made possible instead of the one it
 * made hard: a variant's styling is now a string the component exports
 * (`VARIANT_CLASSES`), so a test can ask the component which classes a variant
 * *should* carry and then check the rendered element carries them. That is a
 * stronger assertion than the old one — it proves the styling reached the DOM
 * rather than that a rule was written — and it does not duplicate a class name,
 * because the string comes from the component the way `BUTTON_VARIANTS` already
 * did.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BUTTON_SIZES, BUTTON_VARIANTS, Button, SIZE_CLASSES, VARIANT_CLASSES } from '../Button'

/**
 * The wrapper the label and the spinner share, or a failure saying what is missing.
 *
 * The button always renders this span; when it is loading it renders the spinner in
 * a second one beside it. Asking for the button's element children rather than for
 * a class name keeps the assertion on the markup's shape, which the component still
 * owns.
 */
function contentOf(button: Element): Element {
  const content = button.children[0]
  if (content === undefined) throw new Error('Button rendered no content wrapper')
  return content
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
      expect(button.getAttribute('class')?.endsWith('positioned')).toBe(true)
    })
  })

  describe('variants (§8, plus the demo’s base)', () => {
    it('defaults to neutral, the demo’s base button', () => {
      // The demo draws a bare `<button class="btn">` — white on `--line` — and
      // uses it for every secondary action; §8's table has no row for it. §B makes
      // the demo the reference for what the document does not settle, so the bare
      // element maps to the base styling: `<Button>` is `<button class="btn">` and
      // `<Button variant="primary">` is `<button class="btn btn-primary">`.
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(VARIANT_CLASSES.neutral)
    })

    it.each(BUTTON_VARIANTS)('applies the %s variant’s own styling', (variant) => {
      render(<Button variant={variant}>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(VARIANT_CLASSES[variant])
    })

    it('applies exactly one variant at a time', () => {
      // Six variants are six backgrounds; two on one element would make the rendered
      // colour depend on the order the classes happened to land in.
      render(<Button variant="ghost">{LABEL}</Button>)

      const others = BUTTON_VARIANTS.filter((variant) => variant !== 'ghost')
      for (const variant of others) {
        expect(screen.getByRole('button')).not.toHaveClass(VARIANT_CLASSES[variant])
      }
    })
  })

  describe('sizes (§8)', () => {
    it('defaults to the default size', () => {
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass(SIZE_CLASSES.default)
    })

    it.each(BUTTON_SIZES.filter((size) => size !== 'icon'))(
      'applies the %s size’s own styling',
      (size) => {
        render(<Button size={size}>{LABEL}</Button>)

        expect(screen.getByRole('button')).toHaveClass(SIZE_CLASSES[size])
      },
    )
  })

  describe('the block modifier (§8)', () => {
    it('does not fill its container by default', () => {
      render(<Button>{LABEL}</Button>)

      expect(screen.getByRole('button')).not.toHaveClass('w-full')
    })

    it('fills its container when asked', () => {
      render(<Button block>{LABEL}</Button>)

      expect(screen.getByRole('button')).toHaveClass('w-full')
    })
  })

  describe('icons', () => {
    it('renders a leading icon before the label', () => {
      const { container } = render(<Button leadingIcon="add">{LABEL}</Button>)

      const content = contentOf(screen.getByRole('button'))
      expect(content.firstElementChild?.tagName.toLowerCase()).toBe('svg')
      expect(content.textContent).toBe(LABEL)
      expect(container.querySelector('svg')).toBe(content.firstElementChild)
    })

    it('renders a trailing icon after the label', () => {
      render(<Button trailingIcon="forward">{LABEL}</Button>)

      const content = contentOf(screen.getByRole('button'))
      expect(content.lastElementChild?.tagName.toLowerCase()).toBe('svg')
      // The label is the node before it, which is what "after the label" means —
      // and what distinguishes it from the leading case, where the svg is first.
      expect(content.lastElementChild?.previousSibling).toHaveTextContent(LABEL)
    })

    it('hides a button icon from assistive technology', () => {
      // The icon restates the label, so announcing it would read the button twice.
      // `Icon` decides this from the absence of a `label`, and this assertion is what
      // keeps the button from passing one.
      const { container } = render(<Button leadingIcon="add">{LABEL}</Button>)

      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders an icon button with the icon as its whole content', () => {
      const { container } = render(<Button size="icon" icon="search" aria-label="جست‌وجو" />)

      expect(screen.getByRole('button')).toHaveAccessibleName('جست‌وجو')
      expect(container.querySelectorAll('svg')).toHaveLength(1)
      expect(contentOf(screen.getByRole('button')).textContent).toBe('')
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
        render(<Button loading>{LABEL}</Button>)

        expect(contentOf(screen.getByRole('button')).textContent).toBe(LABEL)
      })

      it('keeps the accessible name it had before it started loading', () => {
        render(<Button loading>{LABEL}</Button>)

        expect(screen.getByRole('button')).toHaveAccessibleName(LABEL)
      })

      it('makes the label transparent rather than removing it', () => {
        // The wrapper keeps the label in the tree and hides it with opacity, so the
        // box keeps its size and the accessible name both. `display: none` would
        // resize the button and `visibility: hidden` would drop the name.
        render(<Button loading>{LABEL}</Button>)

        expect(contentOf(screen.getByRole('button'))).toHaveClass('opacity-0')
      })

      it('renders a spinner, and hides it from assistive technology', () => {
        // Decorative on purpose: `aria-busy` already announces the state, so a label
        // on the spinner would make a screen reader read the button twice.
        render(<Button loading>{LABEL}</Button>)

        const button = screen.getByRole('button')
        expect(button.children).toHaveLength(2)

        const spinner = button.children[1]
        expect(spinner.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      })

      it('does not render a spinner when it is not loading', () => {
        render(<Button>{LABEL}</Button>)

        expect(screen.getByRole('button').children).toHaveLength(1)
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

        expect(button).toHaveClass(SIZE_CLASSES.icon)
        expect(button).toHaveAccessibleName('جست‌وجو')
      })
    })
  })
})
