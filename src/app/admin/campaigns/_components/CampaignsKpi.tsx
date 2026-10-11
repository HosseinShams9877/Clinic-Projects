/**
 * The campaigns page's three tiles — the demo's KPI row above the assistant's card.
 *
 * Presentational: the page derives the three figures from the rows it already read and
 * the ledger's own conversion, so a tile cannot disagree with the table beneath it. The
 * demo's own figures name a ninety-day window the module does not keep and a month of
 * sends no read returns, so the two sub-lines name the scope the count actually covers —
 * the whole campaign history and the total the ledger holds — which is the honest
 * sentence about the same number.
 */

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatNumber, formatPercent } from '@/core/localization'

import { ADMIN_CAMPAIGNS } from '@/app/admin/catalog'

export interface CampaignsKpiProps {
  /** How many campaigns are `ACTIVE` right now. */
  readonly active: number
  /** How many of the active ones are recurring. */
  readonly recurring: number
  /** Σ `resultingAppointmentCount` across every campaign the clinic holds. */
  readonly visits: number
  /** Σ `sent` across every campaign, as the ledger recounts it. */
  readonly sends: number
  /** Visits over sends, or `null` when nothing has been sent yet. */
  readonly conversion: number | null
}

export function CampaignsKpi({
  active,
  recurring,
  visits,
  sends,
  conversion,
}: CampaignsKpiProps) {
  const tiles: readonly {
    readonly label: string
    readonly value: string
    readonly sub: string
    readonly icon: IconName
    readonly tone: string
  }[] = [
    {
      label: ADMIN_CAMPAIGNS.kpi.active,
      value: formatNumber(active),
      sub: `${formatNumber(recurring)}${ADMIN_CAMPAIGNS.recurringSub}`,
      icon: 'message',
      tone: 'bg-brand-50 text-brand',
    },
    {
      label: ADMIN_CAMPAIGNS.kpi.visits,
      value: formatNumber(visits),
      sub: ADMIN_CAMPAIGNS.allCampaignsSub,
      icon: 'success',
      tone: 'bg-ok-bg text-ok',
    },
    {
      label: ADMIN_CAMPAIGNS.kpi.conversion,
      value: conversion === null ? ADMIN_CAMPAIGNS.assistant.conversionNone : formatPercent(conversion),
      sub: `${formatNumber(sends)}${ADMIN_CAMPAIGNS.sendsSub}`,
      icon: 'reports',
      tone: 'bg-warn-bg text-warn',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3"
        >
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tile.tone)}>
            <Icon name={tile.icon} size="card" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-ink-3">{tile.label}</span>
            <span className="truncate text-lg font-bold text-ink tabular-nums">{tile.value}</span>
            <span className="text-xs text-ink-3 tabular-nums">{tile.sub}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
