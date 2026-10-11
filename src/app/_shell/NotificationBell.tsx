/**
 * The topbar's notification bell — a popover of the panel's own notifications.
 *
 * The rows are the role-aware per-item feed `PanelShell` built (`notifications.ts`):
 * one row per real entity, each with a stable key the read/hidden state is kept
 * against. The badge counts only unread entries; clicking a row marks it read (a
 * Server Action) and navigates to its source. An unread row is tinted; a read one is
 * muted. The footer leads to the full notifications page. No row is invented, and a
 * hidden row never reaches here.
 */

'use client'

import Link from 'next/link'
import { useTransition } from 'react'

import { Icon } from '@/core/components/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '@/core/components/popover'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { NOTIFICATIONS_POPOVER, TOPBAR } from './catalog'
import type { NotificationEntry } from './notifications'
import { markNotificationReadAction } from './notification-actions'
import type { Panel } from './navigation'

export interface NotificationBellProps {
  readonly panel: Panel
  readonly items: readonly NotificationEntry[]
  readonly unreadCount: number
  /** Where «همه اعلان‌ها» leads — the panel's notifications page. */
  readonly allHref: string
}

/** The most rows the popover shows before «همه اعلان‌ها» takes over. */
const POPOVER_LIMIT = 8

export function NotificationBell({ panel, items, unreadCount, allHref }: NotificationBellProps) {
  const [, startTransition] = useTransition()
  const shown = items.slice(0, POPOVER_LIMIT)

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
          {unreadCount === 0 ? null : (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold text-ink-inverse tabular-nums">
              {formatNumber(unreadCount)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent align="end" sideOffset={8} className="w-80 max-w-[90vw] p-0">
          <header className="border-b border-line px-4 py-3 font-bold text-ink">
            {NOTIFICATIONS_POPOVER.title}
          </header>
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">{NOTIFICATIONS_POPOVER.empty}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {shown.map((item) => (
                <li key={item.key} className="border-b border-line last:border-b-0">
                  <Link
                    href={item.href}
                    onClick={() =>
                      startTransition(async () => {
                        await markNotificationReadAction(panel, item.key)
                      })
                    }
                    className={cx(
                      'flex items-center gap-3 px-4 py-3 no-underline hover:bg-surface-sunken',
                      item.read ? 'opacity-60' : '',
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
                      <Icon name={item.icon} size="compact" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-sm font-semibold text-ink">{item.title}</span>
                        {item.read ? null : <span className="size-2 shrink-0 rounded-pill bg-danger" aria-hidden="true" />}
                      </span>
                      {item.detail === '' && item.time === '' ? null : (
                        <span className="block text-xs text-ink-3">
                          {item.detail}
                          {item.detail !== '' && item.time !== '' ? ' · ' : ''}
                          <span className="tabular-nums">{item.time}</span>
                        </span>
                      )}
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
