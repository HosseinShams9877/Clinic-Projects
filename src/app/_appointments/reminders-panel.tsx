/**
 * «یادآوری‌های امروز» — the desk's side panel of the day's reminder feed.
 *
 * The feed is the `notifications` module's own `todaysReminders`, flattened to a card
 * view-model by `page-data.ts` so this component stays a pure render: a bell with the
 * day's count, one card per message the clinic produced today, and the footer sentence
 * that says the occasions and cycle due-dates are built automatically. The desk reads
 * it beside the grid because a reminder is about the same people the grid is about.
 */

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import type { ReminderCard } from './page-data'

/** The badge's colour per tone, over the status token palette. */
const TONE_CLASSES: Readonly<Record<ReminderCard['badgeTone'], string>> = {
  brand: 'bg-brand-50 text-brand-700',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  neutral: 'bg-surface-sunken text-ink-2',
}

export interface RemindersPanelProps {
  readonly reminders: readonly ReminderCard[]
}

export function RemindersPanel({ reminders }: RemindersPanelProps) {
  return (
    <section className="flex flex-col rounded-md border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
          <Icon name="notification" size="card" />
        </span>
        <h2 className="font-bold text-ink">{APPOINTMENTS_PAGE.remindersTitle}</h2>
        <span className="ms-auto grid size-6 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700 tabular-nums">
          {formatNumber(reminders.length)}
        </span>
      </header>

      {reminders.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-3">{APPOINTMENTS_PAGE.remindersEmpty}</p>
      ) : (
        <ul className="flex flex-col px-4">
          {reminders.map((reminder) => (
            <li key={reminder.id} className="flex gap-3 border-t border-line py-3 first:border-t-0">
              <span className="w-[46px] shrink-0 text-center text-xs font-bold text-brand-700 tabular-nums">
                {reminder.time}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                <b className="mb-1.5 block text-sm font-semibold text-ink">{reminder.text}</b>
                <span className="flex flex-wrap items-center gap-2">
                  {reminder.badge === null ? null : (
                    <span className={cx('inline-flex rounded-pill px-2 py-[2px] text-xs font-semibold', TONE_CLASSES[reminder.badgeTone])}>
                      {reminder.badge}
                    </span>
                  )}
                  {reminder.actionHref === null || reminder.actionLabel === null ? null : (
                    <Link
                      href={reminder.actionHref}
                      className="inline-flex rounded-xs border border-brand-300 px-3 py-[6px] text-xs font-semibold text-brand-700 no-underline hover:bg-brand-50"
                    >
                      {reminder.actionLabel}
                    </Link>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="px-4 py-3 text-xs leading-relaxed text-ink-3">{APPOINTMENTS_PAGE.remindersFooter}</p>
    </section>
  )
}
