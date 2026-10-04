// @vitest-environment jsdom
/**
 * `07-localization.md` §9 and `10-testing-strategy.md` §10 put the component suite
 * under jsdom, and this file opts into it per file rather than switching the whole
 * suite: the localization layer is pure and runs an order of magnitude faster in
 * `node`, so the environment is chosen where it is needed (`vitest.config.ts`).
 *
 * ## What this file is actually checking
 *
 * Not that a Lucide icon renders — Lucide has its own tests. It checks the things
 * the wrapper exists to guarantee, and that a direct Lucide import would silently
 * get wrong. The Lucide defaults are asserted against explicitly, because the whole
 * risk is that they are *nearly* right: `stroke-width: 2` instead of 1.7,
 * `aria-hidden` decided by a heuristic rather than by the call site.
 *
 * Lucide 1.49.0's own behaviour is worth stating, because two of the tests below
 * would otherwise look like they were testing Lucide rather than us. It sets
 * `aria-hidden="true"` **only when no `aria-` prop, `role` or `title` is present**
 * (`hasA11yProp`), and it spreads the caller's attributes last. So the wrapper
 * always supplies one of the two accessibility states and Lucide never supplies
 * one — the outcome is ours, and that is what makes it assertable.
 *
 * The class-name assertions compare against `styles.<key>` imported from the same
 * CSS Module the component imports, never against a literal. Under Vitest's
 * `stable` strategy an unprocessed CSS Module resolves each key to a deterministic
 * generated name, so the comparison holds whether or not CSS is processed — and it
 * keeps the test from being a second place the class name is written down.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon } from '../Icon'
import { ICONS, iconPixels, ICON_SIZES, ICON_STROKE_WIDTH, type IconName, type IconSize } from '../icons'

import styles from '../Icon.module.css'

/** Every registered concept, so a new entry is covered the moment it is added. */
const ICON_NAMES = Object.keys(ICONS) as IconName[]

/**
 * A class name from `Icon.module.css`, or a failure that names the key.
 *
 * `next/types/global.d.ts` declares a CSS Module as `{ readonly [key: string]:
 * string }` — an index signature — so `noUncheckedIndexedAccess` types every
 * lookup as `string | undefined`. That is not a nuisance to work around: it is the
 * accurate type, because the declaration cannot know which classes exist, and a
 * misspelled or renamed class is therefore not a compile error. Reading through one
 * function puts the guard in a single place and turns that mistake into a failure
 * naming the key, instead of a matcher comparing against `undefined`.
 */
function classOf(key: 'icon' | 'mirrored' | 'spinning'): string {
  const name = styles[key]
  if (name === undefined) throw new Error(`Icon.module.css has no class \`${key}\``)
  return name
}

const CLASS = {
  icon: classOf('icon'),
  mirrored: classOf('mirrored'),
  spinning: classOf('spinning'),
} as const

/** A Persian label, so the test proves the wrapper passes one through untouched. */
const LABEL = 'نوبت'

/**
 * The rendered `<svg>`, or a failure that says what went wrong.
 *
 * Throwing rather than asserting non-null keeps the reason in the message: a bare
 * "expected null not to be null" inside a shared helper tells a reader nothing
 * about which assertion broke.
 */
function svgOf(container: HTMLElement): SVGElement {
  const svg = container.querySelector('svg')
  if (svg === null) throw new Error('Icon rendered no <svg> element')
  return svg
}

describe('Icon', () => {
  describe('the design system’s icon language (§42, rule A7)', () => {
    it('renders an outline icon at stroke width 1.7, not Lucide’s default of 2', () => {
      const { container } = render(<Icon name="appointment" />)

      expect(svgOf(container)).toHaveAttribute('stroke-width', '1.7')
      expect(ICON_STROKE_WIDTH).toBe(1.7)
    })

    it('sets the caps, the joins and the absent fill', () => {
      const svg = svgOf(render(<Icon name="appointment" />).container)

      expect(svg).toHaveAttribute('stroke-linecap', 'round')
      expect(svg).toHaveAttribute('stroke-linejoin', 'round')
      expect(svg).toHaveAttribute('fill', 'none')
    })

    it('takes its colour from currentColor, so no caller can set one', () => {
      // §8.2's table: "Single colour via `currentColor` — Lucide's default; the
      // wrapper adds no colour." §42 excludes filled, 3D and multicolour icons, and
      // `IconProps` has no `fill` or colour prop, so this attribute is the entire
      // colour mechanism the component has.
      const svg = svgOf(render(<Icon name="appointment" />).container)

      expect(svg).toHaveAttribute('stroke', 'currentColor')
    })

    it('draws on the 24-unit Lucide grid and scales by width and height', () => {
      // The icon is scaled, not redrawn: a `viewBox` that changed with `size`
      // would mean the wrapper was doing arithmetic on the path data.
      const svg = svgOf(render(<Icon name="appointment" size="compact" />).container)

      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
      expect(svg).toHaveAttribute('width', '14')
      expect(svg).toHaveAttribute('height', '14')
    })

    it('defaults to the control size, 17px, from the §42 scale', () => {
      const svg = svgOf(render(<Icon name="appointment" />).container)

      expect(svg).toHaveAttribute('width', String(ICON_SIZES.control))
      expect(svg).toHaveAttribute('height', String(ICON_SIZES.control))
      expect(ICON_SIZES.control).toBe(17)
    })

    it.each(Object.keys(ICON_SIZES) as IconSize[])('accepts the %s size', (size) => {
      // A size is a *name* — `compact`, `nav` — and the pixel value is what the name
      // stands for, looked up by the wrapper. Handing the name in and reading the
      // pixel out is the whole contract, and it is what keeps a caller on the scale.
      const svg = svgOf(render(<Icon name="appointment" size={size} />).container)

      expect(svg).toHaveAttribute('width', String(iconPixels(size)))
      expect(svg).toHaveAttribute('height', String(iconPixels(size)))
    })

    it('keeps every size on the scale §42 defines', () => {
      // The five exact values of §42's table. The document's preamble forbids
      // deriving a dimension it does not state, so the set is closed and this is
      // the assertion that keeps it closed.
      expect(Object.values(ICON_SIZES).sort((left, right) => left - right)).toEqual([
        14, 16, 17, 19, 20,
      ])
    })
  })

  describe('the accessibility tree (§17, the Phase 1 axe obligation)', () => {
    it('is hidden from assistive technology when given no label', () => {
      const svg = svgOf(render(<Icon name="search" />).container)

      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).not.toHaveAttribute('role')
      expect(svg).not.toHaveAttribute('aria-label')
    })

    it('is announced as an image with its label when given one', () => {
      const svg = svgOf(render(<Icon name="search" label={LABEL} />).container)

      expect(svg).toHaveAttribute('role', 'img')
      expect(svg).toHaveAccessibleName(LABEL)
      // The two states are exclusive. An element that is both `role="img"` and
      // `aria-hidden` is announced by nothing, which is the bug this pair guards.
      expect(svg).not.toHaveAttribute('aria-hidden')
    })

    it('passes a Persian label through unchanged', () => {
      const svg = svgOf(render(<Icon name="search" label={LABEL} />).container)

      expect(svg.getAttribute('aria-label')).toBe(LABEL)
    })

    it('hides an icon whose meaning the text beside it already carries', () => {
      // The common case, and the one that must not be labelled: an `add` icon
      // inside a button that already reads «افزودن» would be announced twice.
      const svg = svgOf(render(<Icon name="add" />).container)

      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).not.toHaveAttribute('role')
    })
  })

  describe('direction-aware mirroring (§42)', () => {
    it.each(['back', 'forward', 'chevronStart', 'chevronEnd'] satisfies IconName[])(
      'mirrors %s, which points in the reading direction',
      (name) => {
        expect(svgOf(render(<Icon name={name} />).container)).toHaveClass(CLASS.mirrored)
      },
    )

    it.each(['clock', 'phone', 'appointment', 'view'] satisfies IconName[])(
      'never mirrors %s, which encodes a real-world object',
      (name) => {
        expect(svgOf(render(<Icon name={name} />).container)).not.toHaveClass(CLASS.mirrored)
      },
    )

    it('never mirrors a vertical chevron', () => {
      // The case that proves the flag is data rather than a family check: §42
      // names chevrons as direction icons, and flipping one that opens downward
      // would point it upward.
      expect(svgOf(render(<Icon name="chevronDown" />).container)).not.toHaveClass(CLASS.mirrored)
    })

    it('mirrors exactly the four concepts that point in the reading direction', () => {
      const mirrored = ICON_NAMES.filter((name) => ICONS[name].mirrorsInRtl)

      expect([...mirrored].sort()).toEqual(['back', 'chevronEnd', 'chevronStart', 'forward'])
    })
  })

  describe('the §9 loading state', () => {
    it('does not rotate unless asked', () => {
      expect(svgOf(render(<Icon name="spinner" />).container)).not.toHaveClass(CLASS.spinning)
    })

    it('rotates when asked', () => {
      expect(svgOf(render(<Icon name="spinner" spin />).container)).toHaveClass(CLASS.spinning)
    })

    it('keeps the base class while rotating', () => {
      // The reason `Icon.module.css` mirrors with the individual `scale` property
      // instead of `transform`: a `rotate()` keyframe and `transform: scaleX(-1)`
      // on one element overwrite each other, and whichever lost would vanish.
      const svg = svgOf(render(<Icon name="retry" spin />).container)

      expect(svg).toHaveClass(CLASS.icon)
      expect(svg).toHaveClass(CLASS.spinning)
    })
  })

  describe('composition', () => {
    it('appends the caller’s class last, after the wrapper’s own', () => {
      const svg = svgOf(render(<Icon name="search" className="positioned" />).container)

      expect(svg).toHaveClass('positioned')
      expect(svg).toHaveClass(CLASS.icon)
      expect(svg.getAttribute('class')?.endsWith('positioned')).toBe(true)
    })
  })

  describe('the registry', () => {
    it('registers every category §42 lists, except the brand marks it cannot', () => {
      // §42's categories, less Instagram and Telegram: Lucide 1.49.0 ships no brand
      // icons, so those two are inline SVG owned by the module that renders them.
      // See the header of `icons.ts`.
      expect(ICON_NAMES.length).toBeGreaterThanOrEqual(40)
    })

    it.each(ICON_NAMES)('renders %s as an inline svg', (name) => {
      const svg = svgOf(render(<Icon name={name} />).container)

      // §42: inline SVG, never an icon font. An icon font renders a glyph of text
      // and would produce no `<svg>` at all.
      expect(svg.tagName.toLowerCase()).toBe('svg')
      expect(svg.children.length).toBeGreaterThan(0)
    })

    it('carries a boolean mirror flag on every entry', () => {
      for (const name of ICON_NAMES) {
        expect(typeof ICONS[name].mirrorsInRtl).toBe('boolean')
      }
    })

    it('registers a glyph for every entry', () => {
      for (const name of ICON_NAMES) {
        expect(ICONS[name].glyph).toBeTypeOf('object')
      }
    })
  })
})
