import { cx } from '@/core/lib'

import { ICONS, iconPixels, ICON_STROKE_WIDTH, type IconName, type IconSize } from './icons'

/**
 * The one way an icon is rendered in this product.
 *
 * `01-tech-stack.md` §8.2: "Every icon is therefore rendered through a single
 * wrapper in `src/core/components/icons` that sets `strokeWidth={1.7}`,
 * `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`, and a size
 * from the design system's size scale."
 *
 * Five attributes, all of them set unconditionally and none of them a prop. That
 * is the design: Lucide's own defaults are `stroke-width: 2`, rounded caps, rounded
 * joins, no fill — so a direct Lucide import *looks* correct and is 18 % too heavy,
 * which is exactly the class of defect §8.2 calls "visible but easy to miss in
 * review". Setting them here rather than inheriting them makes the stroke width an
 * assertion the test can read off the DOM instead of an assumption about a
 * dependency's defaults.
 *
 * There is no `fill` prop and no colour prop. §8.2 lists "no filled, 3D, or
 * multicolour icons" as a design-system requirement, and the way to satisfy a
 * requirement is to make it unrepresentable: an icon takes its colour from
 * `currentColor`, so its colour is whatever the text around it is, and a caller
 * who wants a red icon writes red text. §8.2 also notes the wrapper "exposes no
 * `fill` or colour override" as the mechanism by which that is enforced.
 */

/** The five sizes of §42, the concepts of `icons.ts`, and nothing else. */
export interface IconProps {
  /** A product concept — `appointment`, `payment` — never a Lucide name. */
  readonly name: IconName

  /**
   * A role from `ICON_SIZES`. Defaults to `control` (17px).
   *
   * 17px is §42's size for "form, search, date icons", which is the context most
   * icons in this product appear in — a button, a field, a table row. The other
   * contexts are the exceptions and they name their size: a sidebar or topbar icon
   * passes `nav` (§26, §28), a card action passes `card` (§12).
   *
   * The default is documented rather than silent because a wrong default is
   * invisible: an icon 2px off the scale still renders, still looks like an icon,
   * and is only wrong beside a correctly sized one.
   */
  readonly size?: IconSize

  /**
   * The accessible name. **Omit it when the icon is decorative.**
   *
   * This is a two-state prop and the states are genuinely different components:
   *
   * - **With a label**, the icon is an image — `role="img"` and `aria-label` — and
   *   a screen reader announces it. Use it when the icon is the only thing
   *   carrying the meaning: an icon-only button, a status badge's icon.
   * - **Without one**, the icon is `aria-hidden="true"` and contributes nothing to
   *   the accessibility tree. Use it when the text beside it already says what it
   *   means — every icon inside a button that has a label.
   *
   * The failure this prevents is the common one: an icon-only close button with an
   * unlabelled `X` is a button a screen-reader user cannot identify, and it is an
   * axe **critical** violation, which the Phase 1 rules make a page-level failure.
   * Making the label a prop rather than a default is what forces the decision at
   * each call site instead of leaving it to whoever reviews the page.
   *
   * The label itself comes from the catalog. §14 makes a Persian string literal in
   * a component a finding, and an `aria-label` is user-visible text.
   */
  readonly label?: string

  /**
   * Rotates the icon, for the §9 loading state.
   *
   * Only `spinner` is meaningfully rotatable, but the prop is not restricted to it:
   * a rotating `retry` is a legitimate second use, and a type-level restriction
   * would be a rule with one exception already.
   *
   * The rotation honours `prefers-reduced-motion` — the reduced-motion query in
   * `globals.css` collapses every animation to 0.01ms, which a spinner survives
   * only because `aria-busy` on the calling control is what actually announces
   * the state; the rotation is the visual, not the signal.
   */
  readonly spin?: boolean

  /** Appended last, so a caller's positioning wins over the base class. */
  readonly className?: string
}

/**
 * An icon.
 *
 * Renders a Lucide glyph with the design system's stroke, at one of the design
 * system's sizes, mirrored if the concept is a direction icon, and either
 * announced or hidden depending on whether it was given a label.
 */
export function Icon({ name, size = 'control', label, spin = false, className }: IconProps) {
  const { glyph: Glyph, mirrorsInRtl } = ICONS[name]
  const decorative = label === undefined

  return (
    <Glyph
      size={iconPixels(size)}
      className={cx('block shrink-0', mirrorsInRtl && '-scale-x-100', spin && 'animate-spin', className)}
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      role={decorative ? undefined : 'img'}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
    />
  )
}
