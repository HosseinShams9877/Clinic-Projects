// src/app/_injections/injection-tab.tsx

'use client'

/**
 * The «نقشه تزریق» tab — the two views, the add button, and the info bar.
 */

import { useState } from 'react'
import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import type { InjectionArea } from '@/core/constants'

import type { InjectionCounts, InjectionRow } from '@/modules/injections'

import { InjectionDialog } from './injection-dialog'
import { InjectionKpi } from './injection-kpi'
import { InjectionTable } from './injection-table'
import { InjectionMap } from './injection-map'
import { INJECTION_TAB } from './catalog'

/** The tab's two views, keyed as the search param writes them. */
export type InjectionView = 'map' | 'table'

/** The search param the view switch writes. */
export const INJECTION_VIEW_PARAM = 'injectionView'

/** The default view — the map, because the face is what the tab is named after. */
export const DEFAULT_INJECTION_VIEW: InjectionView = 'map'

export function InjectionTab({
  rows,
  counts,
  panel,
  customerId,
  view = DEFAULT_INJECTION_VIEW,
  basePath,
}: {
  readonly rows: readonly InjectionRow[]
  readonly counts: InjectionCounts
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly customerId: string
  readonly view?: InjectionView
  /** The profile's own route, so the view switch writes to it. */
  readonly basePath?: string
}) {
  const [selectedArea, setSelectedArea] = useState<InjectionArea | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false) // <-- استیت جدید

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
            <Icon name="treatment" size="card" />
          </span>
          <h2 className="text-lg font-bold text-ink">{INJECTION_TAB.title}</h2>
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-2 tabular-nums">
            {rows.length} {INJECTION_TAB.countSuffix}
          </span>
        </div>
        <InjectionDialog 
          panel={panel} 
          customerId={customerId} 
          defaultArea={selectedArea} 
          open={dialogOpen} 
          onOpenChange={setDialogOpen} 
        />
      </header>

      <InjectionKpi counts={counts} />

      {basePath === undefined ? null : (
        <nav className="flex items-center gap-2" aria-label={INJECTION_TAB.title}>
          <ViewTab
            basePath={basePath}
            view="map"
            active={view}
            label={INJECTION_TAB.views.map}
          />
          <ViewTab
            basePath={basePath}
            view="table"
            active={view}
            label={INJECTION_TAB.views.table}
          />
        </nav>
      )}

      {view === 'map' ? (
        <InjectionMap 
          rows={rows} 
          onAreaClick={(area) => {
            setSelectedArea(area)
            setDialogOpen(true)
          }} 
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sh-1">
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-3">
            <Icon name="info" size="compact" />
            <span>{INJECTION_TAB.hint}</span>
          </div>
          <div className="p-4">
            <InjectionTable rows={rows} />
          </div>
        </div>
      )}
    </section>
  )
}

function ViewTab({
  basePath,
  view,
  active,
  label,
}: {
  readonly basePath: string
  readonly view: InjectionView
  readonly active: InjectionView
  readonly label: string
}) {
  const isActive = view === active
  const separator = basePath.includes('?') ? '&' : '?'
  const href =
    view === DEFAULT_INJECTION_VIEW
      ? basePath
      : `${basePath}${separator}${INJECTION_VIEW_PARAM}=${view}`
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cx(
        'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
        isActive
          ? 'border-transparent bg-brand-50 text-brand-700'
          : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
      )}
    >
      {label}
    </Link>
  )
}