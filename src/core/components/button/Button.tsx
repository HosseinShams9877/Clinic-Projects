import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { Icon, type IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'

import styles from './Button.module.css'

/**
 * The product's only button.
 *
 * `08-ui-design-system.md` §8 defines five variants and four sizes; §9 requires
 * all six states on every one of them. Both sections are implemented in
 * `Button.module.css`, which is also where the one place this file's styling
 * departs from rule A3 is written down and argued.
 *
 * ## Six variants, not five
 *
 * §8's table names five — Primary, Soft, Ghost, Outline, Danger — and the "Base"
 * line above the table gives geometry only, with **no colour**. The demo that
 * section describes has a sixth appearance the table does not capture: a bare
 * `<button class="btn">`, which is white with a `--line` border and which the demo
 * uses for essentially every secondary action. `clinic/assets/css/theme.css` draws
 * it in `.btn` itself, so all five §8 rows are modifiers on it, and no §8 variant
 * reproduces it — Ghost and Outline both have a transparent background and neither
 * has `--ink` text.
 *
 * `08-ui-design-system.md` §B settles which source wins when they disagree:
 *
 * > The source demo files under `clinic/` remain in the repository as the reference
 * > artifact for any visual question this document does not settle.
 *
 * So the base appearance is a variant here. It is named `neutral` — the document's
 * own word for that family, used in §10 for "default neutral background" — and it
 * is **the default**, because the bare element maps to the bare class:
 * `<Button>` is `<button class="btn">`, and `<Button variant="primary">` is
 * `<button class="btn btn-primary">`. Mapping them the other way round would make
 * every secondary action in the product brand-red, which is both a divergence from
 * the demo and a reading of §8's table as an exhaustive list of ordinary buttons
 * that its own `.btn` contradicts.
 *
 * The two variants §8 summarises in one column and the demo renders in two
 * declarations — Ghost's hover also darkens the text, Outline's also completes the
 * border — take the demo's version, for the same reason.
 *
 * ## Why the props are a union rather than one interface
 *
 * §9 and the Phase 1 axe obligation meet at the icon-only button: an `icon`-sized
 * button has no text, so its accessible name has to come from somewhere, and an
 * unnamed one is an axe **critical** violation — which the Phase 1 rules make a
 * page-level failure, not a warning. So the two shapes are two types:
 *
 * - a **labelled** button, whose name is its text and which may carry an icon on
 *   either side;
 * - an **icon** button, which must name its icon and must carry an `aria-label`
 *   and may not carry text.
 *
 * The type is what makes "an icon button without a name" unrepresentable, in the
 * same spirit as `IconProps` making a colour override unrepresentable. A runtime
 * warning would have to be noticed; a compile error cannot be missed.
 *
 * ## Icons are named, not imported
 *
 * `leadingIcon` and `trailingIcon` take an `IconName` — a product concept — not a
 * component. So no call site imports Lucide, every button icon goes through the
 * wrapper that sets stroke 1.7 and applies RTL mirroring, and `01-tech-stack.md`
 * §8.2's "a Lucide icon imported directly into a component is a finding" cannot
 * be tripped by a button.
 *
 * ## The default `type` is `button`
 *
 * A `<button>` with no `type` inside a `<form>` submits it. That default is
 * almost never what a caller means, and it presents as a form that submits when
 * someone opens a dropdown. So the default here is `button` and a submit button
 * asks for it — which is what `SubmitButton` in `src/core/components/form` does.
 */

/**
 * The demo's base button, then §8's five variants in the order the section lists
 * them.
 *
 * `neutral` comes first because it is the default — the appearance of a bare
 * `<button class="btn">` — and a list whose first member is the default is a list a
 * reader can check the default against. The five after it are §8's rows, in §8's
 * order, so the array reads against the table.
 *
 * A `const` array rather than a bare union so the set exists at runtime as well
 * as in the type system: the test iterates it to prove the CSS Module styles
 * every variant, which is an assertion a union alone cannot support.
 */
export const BUTTON_VARIANTS = ['neutral', 'primary', 'soft', 'ghost', 'outline', 'danger'] as const

/** The demo's base button, and §8's five variants. */
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]

/** §8's four sizes. `icon` is a different shape, not a smaller one. */
export const BUTTON_SIZES = ['default', 'large', 'small', 'icon'] as const

/** §8's four sizes. */
export type ButtonSize = (typeof BUTTON_SIZES)[number]

/**
 * What every button has, whichever shape it is.
 *
 * `className` replaces the inherited one rather than adding to it, so `cx` is
 * given it last — the same order `Icon` uses, and the order a stylesheet's
 * specificity expects.
 */
interface BaseButtonProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children' | 'aria-label'> {
  /**
   * Defaults to `neutral` — the demo's base button, so that a bare `<Button>` is a
   * bare `<button class="btn">`. See the header for why the default is not one of
   * §8's five rows.
   */
  readonly variant?: ButtonVariant

  /** §8's `block` modifier: the button fills its container. */
  readonly block?: boolean

  /**
   * §9's loading state.
   *
   * Disables the button as well as showing the spinner, so a second click cannot
   * start a second submission. The trade-off is deliberate and is the reason the
   * form shell moves focus to the first invalid field when a submission fails:
   * a control that becomes disabled while focused drops focus to the document.
   */
  readonly loading?: boolean

  readonly className?: string
}

/** A button with a visible label. */
export interface LabelledButtonProps extends BaseButtonProps {
  /** `icon` is excluded: a labelled button names itself with its text. */
  readonly size?: Exclude<ButtonSize, 'icon'>

  /** An icon before the label, in the reading direction. */
  readonly leadingIcon?: IconName

  /** An icon after the label. */
  readonly trailingIcon?: IconName

  /** Not available here — see `IconButtonProps`. */
  readonly icon?: never

  readonly children: ReactNode

  readonly 'aria-label'?: string
}

/**
 * A square button whose whole content is one icon.
 *
 * `aria-label` is required and `children` is forbidden, which together are the
 * two halves of the same rule: the icon is the entire content, so the name must
 * be supplied, and there is no text to supply it with.
 */
export interface IconButtonProps extends BaseButtonProps {
  readonly size: 'icon'

  /** The icon that is the button's content. */
  readonly icon: IconName

  /** Not available here: an icon button holds exactly one icon. */
  readonly leadingIcon?: never
  readonly trailingIcon?: never

  /** Not available here: text would make this a labelled button. */
  readonly children?: never

  /** The accessible name. Required — the icon cannot supply one. */
  readonly 'aria-label': string
}

export type ButtonProps = LabelledButtonProps | IconButtonProps

export function Button(props: ButtonProps) {
  const {
    variant = 'neutral',
    size = 'default',
    block = false,
    loading = false,
    className,
    icon,
    leadingIcon,
    trailingIcon,
    children,
    'aria-label': ariaLabel,
    disabled = false,
    type = 'button',
    ...buttonProps
  } = props

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      aria-label={ariaLabel}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        block && styles.block,
        loading && styles['is-loading'],
        className,
      )}
    >
      {/* One wrapper for both shapes, so the spinner can be centred over it without
          knowing which shape it is centred over. */}
      <span className={styles.content}>
        {icon === undefined ? (
          <>
            {leadingIcon === undefined ? null : <Icon name={leadingIcon} />}
            {children}
            {trailingIcon === undefined ? null : <Icon name={trailingIcon} />}
          </>
        ) : (
          <Icon name={icon} />
        )}
      </span>

      {/* Decorative: it restates what `aria-busy` already announces, and a label
          here would make a screen reader read the button twice. */}
      {loading ? (
        <span className={styles.spinner}>
          <Icon name="spinner" spin />
        </span>
      ) : null}
    </button>
  )
}
