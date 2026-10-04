import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { Icon, type IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'

/**
 * The product's only button.
 *
 * `08-ui-design-system.md` §8 defines five variants and four sizes; §9 requires
 * all six states on every one of them. Both sections are implemented in the class
 * tables below, which is also where the one place this component's styling
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
 * ## Why the styling lives in class strings
 *
 * Each variant is a plain string of Tailwind utilities in `VARIANT_CLASSES` below.
 * Every colour, radius and shadow in them names a theme value (`bg-brand-btn`, not
 * `bg-[var(--brand-btn)]` and not a hex), so the `:root` token block is still the
 * only place a colour is written and A1 holds. The strings are also the reason a
 * utility can never quietly introduce a value the token block does not define: it
 * would have to be written as an arbitrary value here, which is visible in review
 * in a way a CSS declaration nested in a module file was not.
 *
 * The one exception is the transition, written as the arbitrary property
 * `[transition:var(--transition-control)]`. §9 fixes the control transition as
 * `.18s ease` and `globals.css` already holds it as `--transition-control` for
 * exactly this pair of sections, so the utility reads the token rather than
 * restating a curve Tailwind's own `--ease-*` namespace has no entry for.
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
 * as in the type system: the test iterates it to prove every variant is styled,
 * which is an assertion a union alone cannot support.
 */
export const BUTTON_VARIANTS = ['neutral', 'primary', 'soft', 'ghost', 'outline', 'danger'] as const

/** The demo's base button, and §8's five variants. */
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]

/** §8's four sizes. `icon` is a different shape, not a smaller one. */
export const BUTTON_SIZES = ['default', 'large', 'small', 'icon'] as const

/** §8's four sizes. */
export type ButtonSize = (typeof BUTTON_SIZES)[number]

/**
 * §8's five variants plus the demo's base, as Tailwind utilities.
 *
 * Each row is the variant's full state set — default, `hover:not(:disabled)` and
 * `active:not(:disabled)` — because §9 requires all three on every variant and a
 * row that declared only the default would be a variant with no states. The
 * `:not(:disabled)` guards are what keep the hover and press treatments off a
 * control §9 draws as reduced-contrast instead.
 *
 * Every row states its own `border-*` colour in every state, and the base string
 * below states none. That is deliberate: Tailwind resolves two utilities on the
 * same element by the order they appear in the generated stylesheet, not the order
 * they appear in the `class` attribute, so a base `border-transparent` would be a
 * race with a variant's `border-line` whose winner is decided elsewhere. A variant
 * carrying its own colour in every state has nothing to race against.
 *
 * The active state is a `scale-[0.97]` on every variant, which is §9's "distinct
 * from hover" where the variant's own ramp has nowhere darker to go: `--brand-300`
 * behind `--brand-700` text is 3.6:1 and fails AA, and `--dark-danger` behind
 * `--danger` is worse, so the variants contract instead of darkening. A transform
 * does not affect layout, so §9's "must not cause layout shift" still holds.
 */
export const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  /* The demo's `.btn` and `.btn:hover`, with the two hard-coded colours it contains
     replaced by their tokens — `--line` and `--line-2` are already tokens there,
     and the demo's own `.btn` needs no substitution at all. The press continues
     down the surface ramp to `--surface-sunken`, the token whose name says it is
     recessed. */
  neutral:
    'border-line bg-surface text-ink hover:not-disabled:bg-surface-2 hover:not-disabled:border-line-2 active:not-disabled:bg-surface-sunken active:not-disabled:scale-[0.97]',
  /* §8's table puts the brand shadow on the hover row, so it is not on the default
     state — which is where the demo has it (`box-shadow` sits on `.btn-primary`
     itself). The table settles this one, so the table wins. */
  primary:
    'border-brand-btn bg-brand-btn text-ink-inverse hover:not-disabled:bg-brand-600 hover:not-disabled:border-brand-600 hover:not-disabled:shadow-brand active:not-disabled:bg-brand-700 active:not-disabled:border-brand-700 active:not-disabled:scale-[0.97]',
  soft:
    'border-transparent bg-brand-50 text-brand-700 hover:not-disabled:bg-brand-100 active:not-disabled:bg-brand-100 active:not-disabled:scale-[0.97]',
  /* §8's hover column gives the background alone; the demo's `.btn-ghost:hover` also
     promotes the text to `--ink`. Two declarations where the table has one column,
     so the demo supplies the second. */
  ghost:
    'border-transparent bg-transparent text-ink-2 hover:not-disabled:bg-surface-sunken hover:not-disabled:text-ink active:not-disabled:bg-neutral-bg active:not-disabled:scale-[0.97]',
  /* As with Ghost: §8 gives the background, the demo's `.btn-outline:hover` also
     completes the border from `--brand-300` to the full `--brand`. */
  outline:
    'border-brand-300 bg-transparent text-brand-700 hover:not-disabled:bg-brand-50 hover:not-disabled:border-brand active:not-disabled:bg-brand-100 active:not-disabled:scale-[0.97]',
  /* §8: "slightly darker danger bg". The demo draws it as a hard-coded `#f4d7d9`
     (`.btn-danger:hover`), which A1 forbids and §46 does not carry; the closest
     token is `--dark-danger-bg`, the darker of the two danger backgrounds. The two
     are within a few percent of each other in lightness and the token is the one
     that survives a review with the rule intact. */
  danger:
    'border-transparent bg-danger-bg text-danger hover:not-disabled:bg-dark-danger-bg active:not-disabled:bg-dark-danger-bg active:not-disabled:scale-[0.97]',
}

/**
 * §8's sizes, each carrying its own radius and font size as well as its padding —
 * §8 gives all three per size, so a size changes the corner and the type as well as
 * the box.
 *
 * The padding values are the control's own geometry and are the one place this
 * component departs from A3's "every spacing value comes from the `--s-*` scale":
 *
 *   default  10px 18px      large  14px 26px      small  6px 12px
 *
 * None of 10, 18, 26 and 6 is a step of the scale (4 · 8 · 12 · 16 · 20 · 24 · 32
 * · 40 · 56 · 72). The reading taken here — and in `Form`'s control — is that A3
 * governs the space *between* things while a control's own geometry belongs to the
 * section that states it. The demo's stylesheet is the evidence, and it does
 * exactly this split: `.btn { padding: 10px 18px }` and `.input { padding: 11px
 * var(--s-4) }` — the 16px horizontal padding *is* the token, because 16 is on the
 * scale, and the 11px beside it is a literal, because it is not. Snapping instead
 * would silently resize every control in the product away from the demo it is
 * meant to reproduce.
 *
 * The literals are written as arbitrary values (`p-[10px_18px]`) rather than
 * snapped to `p-2`/`p-5`, which is the mechanism that keeps them exact: `p-10`
 * would be 40px, not 10px, and the scale has no step for 10 or 18 at all. `icon`
 * is `size-9` because 36 *is* on the scale's multiples — `9 × 4px` — so it is the
 * one size that reads as a utility.
 */
export const SIZE_CLASSES: Readonly<Record<ButtonSize, string>> = {
  default: 'p-[10px_18px] rounded-sm text-sm',
  large: 'p-[14px_26px] rounded-md text-md',
  small: 'p-[6px_12px] rounded-xs text-xs',
  icon: 'size-9 rounded-sm',
}

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
 * `aria-label` is required and `children` is forbidden, which together are the two
 * halves of the same rule: the icon is the entire content, so the name must be
 * supplied, and there is no text to supply it with.
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
        'relative inline-flex items-center justify-center border appearance-none cursor-pointer whitespace-nowrap font-semibold [transition:var(--transition-control)]',
        'focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
        'disabled:opacity-[0.55] disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        block && 'w-full',
        className,
      )}
    >
      {/* One wrapper for both shapes, so the spinner can be centred over it without
          knowing which shape it is centring over.

          The label is made transparent rather than removed. `display: none` would
          drop the box and resize the button, and `visibility: hidden` would take it
          out of the accessibility tree, leaving a button whose accessible name is
          empty — an axe critical violation. `opacity: 0` keeps both: the width is
          unchanged and the name the button already had is the name it still has
          while it loads. `aria-busy` above is what announces the state. */}
      <span className={cx('inline-flex items-center justify-center gap-2', loading && 'opacity-0')}>
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
        <span className="absolute inset-0 flex items-center justify-center">
          <Icon name="spinner" spin />
        </span>
      ) : null}
    </button>
  )
}
