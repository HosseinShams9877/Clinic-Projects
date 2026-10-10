/**
 * The desk's card primitive — the white, thin-bordered, rounded box that every
 * section of `reception/desk` sits in.
 *
 * The demo's every card shares one shape: a `surface` background, a `line` border,
 * a `radius-lg` corner, and a padding step. The shape is not a component in
 * `08-ui-design-system.md` §25 — the design system names `Card` for the public
 * site and the panel, but the desk's cards carry a title row and an optional
 * action slot that the generic `Card` does not. Rather than overload `Card`,
 * this file is the desk's own, so the reception page renders the same box in
 * four places without four copies of the same `className`.
 *
 * It is a Server Component: it renders children and holds no state.
 */

import type { ReactNode } from 'react'

import { cx } from '@/core/lib'

/**
 * The card's outer shape.
 *
 * `bg-surface` and `border-line` are the tokens `08-ui-design-system.md` §43
 * names for a panel card. `rounded-lg` is the 12px step (§36). The shadow is
 * the one §37 gives a card at rest.
 */
export function WorkCard({
  children,
  className,
  /**
   * The card's accessible name. Rendered as the heading and used by the section
   * landmark, so a screen reader announces «کارتابل کارهای امروز» when the
   * cartable is reached.
   */
  title,
  /**
   * The small text beside the title — a count, a status, a lead. In the demo the
   * KPI cards carry «۹ مشتری» here and the cartable carries the active filter's
   * count.
   */
  subtitle,
  /**
   * The right-hand slot of the title row: a button, a chip group, a badge. In
   * the demo the cartable holds the filter chips and the free-slots card holds
   * the two navigation buttons.
   */
  action,
  /** The bell, warning or calendar icon beside the title. */
  icon,
}: {
  children: ReactNode
  className?: string
  title: string
  subtitle?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={cx(
        'rounded-lg border border-line bg-surface shadow-card',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          {icon === undefined ? null : (
            <span className="text-brand" aria-hidden="true">
              {icon}
            </span>
          )}
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {subtitle === undefined ? null : (
            <span className="text-xs text-ink-2">{subtitle}</span>
          )}
        </div>
        {action === undefined ? null : (
          <div className="flex items-center gap-2">{action}</div>
        )}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}