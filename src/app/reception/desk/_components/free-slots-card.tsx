/**
 * «ساعت‌های خالی امروز» — the day's next free times.
 */

import Link from 'next/link'

import { Button } from '@/core/components/button/Button'
import { Icon } from '@/core/components/icons'
import { asLocalTime, formatTime } from '@/core/localization'

import { DESK_PAGE } from '@/app/catalog'

import { WorkCard } from './work-card'

export interface FreeSlot {
  readonly time: string
  readonly doctorName: string
  readonly href: string
}

export function FreeSlotsCard({
  slots,
  gridHref,
}: {
  slots: readonly FreeSlot[]
  gridHref: string
}) {
  return (
    <WorkCard
      title={DESK_PAGE.freeSlots.title}
      icon={<Icon name="clock" />}
      action={
        <Link href={gridHref} className="no-underline">
          <Button variant="ghost" size="small">
            {DESK_PAGE.freeSlots.gridAction}
          </Button>
        </Link>
      }
    >
      {slots.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">
          {DESK_PAGE.freeSlots.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {slots.map((slot) => (
            <li key={`${slot.doctorName}-${slot.time}`}>
              <Link
                href={slot.href}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 no-underline [transition:var(--transition-control)] hover:border-brand"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-ink tabular-nums">
                    {formatTime(asLocalTime(slot.time))}
                  </span>
                  <span className="text-xs text-ink-2">{slot.doctorName}</span>
                </div>
                <Icon name="calendar" className="text-brand" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WorkCard>
  )
}