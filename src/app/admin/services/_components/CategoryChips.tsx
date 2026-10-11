/**
 * The catalogue toolbar's category chips — the module's four, plus «همه», as links.
 *
 * A category is a URL the way the debts page's bucket chips are one, so the bar is
 * `<Link>`s and not a client switch: a filtered catalogue is a bookmarkable fact, and
 * the page renders from the same `?category=` param the chips write. The four are the
 * `ServiceCategory` set's own, named by the module's catalog, because a chip that named
 * a category the set does not hold would filter to nothing and say it had filtered to
 * something. The demo's fifth chip («مشاوره») is one such name, and is not here.
 *
 * Each chip carries its own count, because a manager reading the bar asks «چند تا؟»
 * before clicking — and a category the clinic holds no service in still renders, because
 * an empty category is a category the manager may filter by.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'

import { ADMIN_SERVICES } from '@/app/admin/catalog'

/** One chip, as the bar holds it: the raw value, its own label, and its own count. */
export interface CategoryChip {
  /** The chip's own filter value, which the `?category=` param carries. */
  readonly value: string
  /** The category's own label, as the module's catalog names it. */
  readonly label: string
  /** How many services the category holds. */
  readonly count: number
}

export interface CategoryChipsProps {
  readonly chips: readonly CategoryChip[]
  /** The category the URL names, or `null` when it names none (which is «همه»). */
  readonly active: string | null
  /** Builds the href for a category, preserving the caller's other search params. */
  readonly hrefFor: (category: string | null) => string
}

export function CategoryChips({ chips, active, hrefFor }: CategoryChipsProps) {
  return (
    <nav
      className="flex flex-wrap items-center gap-2"
      aria-label={ADMIN_SERVICES.categoriesLabel}
    >
      <Chip
        label={ADMIN_SERVICES.filterAll}
        count={chips.reduce((total, chip) => total + chip.count, 0)}
        href={hrefFor(null)}
        active={active === null}
      />
      {chips.map((chip) => (
        <Chip
          key={chip.value}
          label={chip.label}
          count={chip.count}
          href={hrefFor(chip.value)}
          active={active === chip.value}
        />
      ))}
    </nav>
  )
}

/** One chip, as a link and not a button — a category is a URL. */
function Chip({
  label,
  count,
  href,
  active,
}: {
  readonly label: string
  readonly count: number
  readonly href: string
  readonly active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-pill border px-3 py-[6px] text-xs font-semibold no-underline',
        active
          ? 'border-transparent bg-brand text-ink-inverse'
          : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
      )}
    >
      {label}
      <span className={cx('text-[10px]', active ? 'text-ink-inverse/70' : 'text-ink-3')}>
        {toPersianDigits(count)}
      </span>
    </Link>
  )
}
