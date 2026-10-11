/**
 * The topbar's notification bell — a popover of the day's reminders, every panel.
 *
 * The rows are the `notifications` module's `todaysReminders`, read once by
 * `PanelShell` and handed down as plain data (see that file's header for why the shell
 * makes this one read). This component only renders them: a ghost bell with a red count
 * badge, and a popover listing the day's notifications with their time and text, or the
 * empty state when there are none. No row is invented — an empty feed shows no badge.
 */

'use client'

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '@/core/components/popover'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { NOTIFICATIONS_POPOVER, TOPBAR } from './catalog'

/** One notification row, flattened by `PanelShell` from the ledger feed. */
export interface NotificationItem {
  readonly id: string
  readonly time: string
  readonly text: string
}

export interface NotificationBellProps {
  readonly items: readonly NotificationItem[]
  /** Where «همه اعلان‌ها» leads — the day's notifications surface. */
  readonly allHref: string
}

export function NotificationBell({ items, allHref }: NotificationBellProps) {
  const count = items.length
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
          {count === 0 ? null : (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold text-ink-inverse tabular-nums">
              {formatNumber(count)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent align="end" sideOffset={8} className="w-80 max-w-[90vw] p-0">
          <header className="border-b border-line px-4 py-3 font-bold text-ink">
            {NOTIFICATIONS_POPOVER.title}
          </header>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">{NOTIFICATIONS_POPOVER.empty}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
                    <Icon name="notification" size="compact" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink-3 tabular-nums">{item.time}</span>
                    <span className="block text-sm text-ink-2">{item.text}</span>
                  </span>
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
