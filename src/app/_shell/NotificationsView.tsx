/**
 * The full notifications page body — the bell's «همه اعلان‌ها» destination.
 *
 * A client component because its two writes are interactive: «علامت‌گذاری همه» marks
 * every visible key read, and each row's «حذف» hides that key for this principal. The
 * entries are the same role-aware feed the bell reads, handed in by the route's server
 * component; this only renders them and calls the actions. A read row is muted; a
 * click on the row opens its source (and marks it read).
 */

'use client'

import Link from 'next/link'
import { useTransition } from 'react'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { NOTIFICATIONS_PAGE } from './catalog'
import type { NotificationEntry } from './notifications'
import {
  hideNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from './notification-actions'
import type { Panel } from './navigation'

export interface NotificationsViewProps {
  readonly panel: Panel
  readonly items: readonly NotificationEntry[]
}

export function NotificationsView({ panel, items }: NotificationsViewProps) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{NOTIFICATIONS_PAGE.title}</h1>
          <p className="text-sm text-ink-2">{NOTIFICATIONS_PAGE.lead}</p>
        </div>
        {items.length === 0 ? null : (
          <Button
            variant="neutral"
            leadingIcon="confirm"
            disabled={pending}
            onClick={() => startTransition(async () => { await markAllNotificationsReadAction(panel) })}
          >
            {NOTIFICATIONS_PAGE.markAll}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-sm text-ink-3">
          {NOTIFICATIONS_PAGE.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className={cx(
                'flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3',
                item.read ? 'opacity-60' : '',
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
                <Icon name={item.icon} size="card" />
              </span>
              <Link
                href={item.href}
                onClick={() => startTransition(async () => { await markNotificationReadAction(panel, item.key) })}
                className="min-w-0 flex-1 no-underline"
              >
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
              </Link>
              <Button
                size="small"
                variant="ghost"
                leadingIcon="close"
                disabled={pending}
                onClick={() => startTransition(async () => { await hideNotificationAction(panel, item.key) })}
              >
                {NOTIFICATIONS_PAGE.delete}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
