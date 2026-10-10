/**
 * The reception page's tab bar — the desk's three views of one day.
 *
 * `02-architecture.md` §9's `reception/appointments.html` carries the three, and the
 * three are the module's own vocabulary: the day, the week, and the cartable of
 * results not recorded. Links and not buttons because the view is a URL, which is what
 * a shared desk shift and a browser's back button both speak; the grid re-reads on the
 * navigation, which is the same query the page ran.
 *
 * ## Why the cartable carries a count
 *
 * The cartable is the alarm the lifecycle sweep raises, and a desk works it top to
 * bottom. The count is the tab's own answer to "is there anything to clear", and it is
 * a number the sweep already produced — the tab renders it in Persian digits because
 * every number the product shows does.
 *
 * ## Why the day and the week keep the anchor
 *
 * Switching to the week from a Tuesday keeps the week that Tuesday is in, because the
 * anchor is what `weekDays` builds the seven from; a tab that dropped the anchor would
 * jump to the week containing today, which is a different week the week the person was
 * looking at.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import type { AppointmentsView } from './page-data'

/** The tab bar's own props: which view is on, and where the other two link to. */
export interface ViewTabsProps {
  /** The view the page is rendering, from the search param. */
  readonly view: AppointmentsView
  /** The cartable's length, as the tab's badge. */
  readonly cartableCount: number
  /** The page's own route, as the links' base. */
  readonly basePath: string
  /** The day the grid is anchored on, kept by every tab. */
  readonly search: string
}

/**
 * The three tabs, as the view the page is on and the two it links to.
 *
 * The active tab is `aria-current="page"` and not `aria-selected`, because the three
 * are three pages rather than one page's sections, and a screen reader should announce
 * the one the person is on the way it announces any page.
 */
export function ViewTabs({ view, cartableCount, basePath, search }: ViewTabsProps) {
  return (
    <nav
      className="flex items-center gap-2 max-panel:flex-nowrap max-panel:overflow-x-auto panel:flex-wrap"
      aria-label={APPOINTMENTS_PAGE.timeColumn}
    >
      {tabs().map((tab) => {
        const active = tab.view === view
        return (
          <Link
            key={tab.view}
            href={`${basePath}?view=${tab.view}${search}`}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              active
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {tab.label}
            {tab.view === 'cartable' && cartableCount > 0 ? (
              <span className="ms-2 inline-flex items-center rounded-pill bg-danger-bg px-2 py-[2px] text-xs font-bold text-danger">
                {formatNumber(cartableCount)}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

/** The three tabs, with the cartable's count folded into its label's badge. */
function tabs(): readonly { readonly view: AppointmentsView; readonly label: string }[] {
  return [
    { view: 'day', label: APPOINTMENTS_PAGE.tabs.day },
    { view: 'week', label: APPOINTMENTS_PAGE.tabs.week },
    { view: 'cartable', label: APPOINTMENTS_PAGE.tabs.cartable },
  ]
}
