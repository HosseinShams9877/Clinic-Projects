/**
 * The results card's chip bar — the module's own six statuses plus «همه», as links.
 *
 * A state is a URL the way the cycles page's tabs are one, so the bar is `<Link>`s and
 * not a client switch: a filtered view is a bookmarkable fact, and the page renders from
 * the same `?state=` param the chips write. The demo's own four chips collapse the six
 * into «در حال اجرا» / «پیش‌نویس» / «پایان‌یافته»; the module's six are the row's own
 * vocabulary and collapsing them would name a state the row is not in, so the bar holds
 * the six and names each as the module's catalog does. A status the clinic holds none of
 * still renders, because a state with no rows is a state the manager may filter by.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'

import { ADMIN_CAMPAIGNS } from '@/app/admin/catalog'

/** One chip's own state, as the module's closed set spells it, and the count it holds. */
export interface StatusChip {
  /** The chip's own filter value, which the `?state=` param carries. */
  readonly value: string
  /** The status's own label, as the module's catalog names it. */
  readonly label: string
  /** How many campaigns the state holds. */
  readonly count: number
}

/** The bar's props: the chips, the state the URL names, and the page's own base path. */
export interface StatusChipsProps {
  readonly chips: readonly StatusChip[]
  /** The state the URL names, or `null` when it names none (which is «همه»). */
  readonly active: string | null
  /** The page's own route, as the chips link back to it. */
  readonly basePath: string
  /** Builds the href for a state, preserving the caller's other search params. */
  readonly hrefFor: (state: string | null) => string
}

/** The six statuses and «همه», as the card's own filter renders them. */
export function StatusChips({ chips, active, hrefFor }: StatusChipsProps) {
  return (
    <nav
      className="flex flex-wrap items-center gap-2"
      aria-label={ADMIN_CAMPAIGNS.resultsTitle}
    >
      <Chip
        label={ADMIN_CAMPAIGNS.filterAll}
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

/** One chip, as a link and not a button — a state is a URL. */
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
