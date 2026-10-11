/**
 * The cycles page's KPI row and chip filter — the demo's page-head tiles and the
 * «همه / عقب‌افتاده / تماس نگرفته» chips above the contact-list table.
 *
 * Both are presentational: the page computes the counts and the active filter from the
 * real `contactList` rows and hands them here, so a tile cannot disagree with the table
 * beneath it. The chips are `<Link>`s on a `?filter=` param (the project's own tab idiom)
 * so the page stays a Server Component and the grid re-reads on navigation.
 */

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { RECEPTION_CYCLES } from '@/app/catalog'

/** The chip-filter values, keyed as the `?filter=` param writes them. */
export type CyclesFilter = 'all' | 'overdue' | 'notContacted'

export interface CyclesCounts {
  readonly overdue: number
  readonly todayContact: number
  readonly sessionsToday: number
  readonly autoSms: number
}

const TILES: readonly { key: keyof CyclesCounts; label: string; icon: IconName; tone: string }[] = [
  { key: 'overdue', label: RECEPTION_CYCLES.kpi.overdue, icon: 'alert', tone: 'bg-danger-bg text-danger' },
  { key: 'todayContact', label: RECEPTION_CYCLES.kpi.todayContact, icon: 'phone', tone: 'bg-warn-bg text-warn' },
  { key: 'sessionsToday', label: RECEPTION_CYCLES.kpi.sessionsToday, icon: 'success', tone: 'bg-ok-bg text-ok' },
  { key: 'autoSms', label: RECEPTION_CYCLES.kpi.autoSms, icon: 'notification', tone: 'bg-info-bg text-info' },
]

export function CyclesKpi({ counts }: { readonly counts: CyclesCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      {TILES.map((tile) => (
        <div key={tile.key} className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tile.tone)}>
            <Icon name={tile.icon} size="card" />
          </span>
          <span className="flex flex-col">
            <span className="text-xs text-ink-3">{tile.label}</span>
            <span className="text-xl font-bold text-ink tabular-nums">{formatNumber(counts[tile.key])}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function CyclesChips({
  active,
  basePath,
}: {
  readonly active: CyclesFilter
  readonly basePath: string
}) {
  const chips: readonly { key: CyclesFilter; label: string }[] = [
    { key: 'all', label: RECEPTION_CYCLES.filter.all },
    { key: 'overdue', label: RECEPTION_CYCLES.filter.overdue },
    { key: 'notContacted', label: RECEPTION_CYCLES.filter.notContacted },
  ]
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const isActive = chip.key === active
        return (
          <Link
            key={chip.key}
            href={chip.key === 'all' ? basePath : `${basePath}?filter=${chip.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {chip.label}
          </Link>
        )
      })}
    </nav>
  )
}
