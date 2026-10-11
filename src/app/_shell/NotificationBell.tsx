/**
 * The topbar's notification bell — a popover of the panel's own cartable chips.
 *
 * The rows are the role-aware summary `PanelShell` builds in `notifications.ts`: one
 * row per notification kind the panel's role is meant to see, each with a live count
 * and a link to the page that clears it. The bell is a ghost button with a red badge
 * carrying the sum of those counts; clicking a row navigates to its source. No row is
 * invented — a kind with a zero count is not passed, and an empty set shows no badge
 * and the empty state.
 */

'use client'

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '@/core/components/popover'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { NOTIFICATIONS_POPOVER, TOPBAR } from './catalog'

/** One notification summary row, built by `PanelShell` for the resolved role. */
export interface NotificationItem {
  readonly id: string
  /** The kind's own label — the cartable chip's name. */
  readonly lead: string
  /** The count, as the Persian-digited «۳ مورد» the row renders. */
  readonly text: string
  /** How many items the kind holds, summed into the bell's badge. */
  readonly count: number
  /** The page a click on the row navigates to, which is where the kind is cleared. */
  readonly href: string
}

export interface NotificationBellProps {
  readonly items: readonly NotificationItem[]
  /** Where «همه اعلان‌ها» leads — the panel's own primary cartable surface. */
  readonly allHref: string
}

export function NotificationBell({ items, allHref }: NotificationBellProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cx(
            'relative grid size-[38px] shrink-0 place-items-center rounded-sm border-none bg-transparent text-ink-2',
            '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
            'hover:bg-surface-sunken hover:text-ink',
          )}
          aria-label={TOPBAR.notificationsLabel}
        >
          <Icon name="notification" size="nav" />
          {total === 0 ? null : (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold text-ink-inverse tabular-nums">
              {formatNumber(total)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent align="end" sideOffset={8} className="w-80 max-w-[90vw] p-0">
          <header className="border-b border-line px-4 py-3 font-bold text-ink">
            {NOTIFICATIONS_POPOVER.title}
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">{NOTIFICATIONS_POPOVER.empty}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-surface-sunken"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
                      <Icon name="notification" size="compact" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{item.lead}</span>
                      <span className="block text-xs text-ink-3 tabular-nums">{item.text}</span>
                    </span>
                    <Icon name="chevronStart" size="compact" className="shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={allHref}
            className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand-700 no-underline hover:bg-surface-sunken"
          >
            {NOTIFICATIONS_POPOVER.all}
          </Link>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  )
}
