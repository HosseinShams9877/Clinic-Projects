/**
 * The cycles page's KPI row, its tab bar, and its chip filter.
 */

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { RECEPTION_CYCLES } from '@/app/catalog'

export type CyclesFilter = 'all' | 'overdue' | 'notContacted'

export type CyclesTab = 'list' | 'active'

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

export function CyclesTabs({
  active,
  basePath,
  filter,
}: {
  readonly active: CyclesTab
  readonly basePath: string
  readonly filter: CyclesFilter
}) {
  const tabs: readonly { key: CyclesTab; label: string }[] = [
    { key: 'active', label: RECEPTION_CYCLES.tabs.active },
    { key: 'list', label: RECEPTION_CYCLES.tabs.list },
  ]

  return (
    <nav
      className="flex items-center gap-2 max-panel:flex-nowrap max-panel:overflow-x-auto panel:flex-wrap"
      aria-label={RECEPTION_CYCLES.tabs.ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        const sp = new URLSearchParams()
        if (tab.key !== 'active') sp.set('tab', tab.key)
        if (filter !== 'all') sp.set('filter', filter)
        const qs = sp.toString()
        const href = qs === '' ? basePath : `${basePath}?${qs}`
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function CyclesChips({
  active,
  basePath,
  tab,
}: {
  readonly active: CyclesFilter
  readonly basePath: string
  readonly tab: CyclesTab
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
        const sp = new URLSearchParams()
        if (tab !== 'active') sp.set('tab', tab)
        if (chip.key !== 'all') sp.set('filter', chip.key)
        const qs = sp.toString()
        const href = qs === '' ? basePath : `${basePath}?${qs}`
        return (
          <Link
            key={chip.key}
            href={href}
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