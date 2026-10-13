/**
 * The debts page's KPI row — the demo's page-head tiles above the severity buckets.
 *
 * Presentational: the page sums the real `contactList` buckets and hands the figures
 * here, so a tile cannot disagree with the tables below it. Amounts are `formatMoney`,
 * the count is `formatNumber` — Persian digits throughout, no fabrication.
 *
 * ## Why the average-delay tile is gone
 *
 * The tile reported a single number the desk could not act on: an average across
 * debts of different sizes is not a debt, and the row's own `daysOverdue` column now
 * carries the fact per debt, which is what the desk actually calls about. Three tiles
 * and one row of them — the total the clinic is owed, the count that is late, and
 * what came in this month.
 */

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatMoney, formatNumber } from '@/core/localization'

import { RECEPTION_DEBTS } from '@/app/catalog'

export interface DebtsKpiProps {
  /** Payments received in the current clinic-local month, in rial. */
  readonly collectedRial: bigint
  /** How many rows are past their due date. */
  readonly overdueCount: number
  /** Total outstanding balance across every bucket, in rial. */
  readonly totalRial: bigint
}

export function DebtsKpi({ collectedRial, overdueCount, totalRial }: DebtsKpiProps) {
  const tiles: readonly { label: string; value: string; icon: IconName; tone: string }[] = [
    { label: RECEPTION_DEBTS.kpi.total, value: formatMoney(totalRial), icon: 'debt', tone: 'bg-info-bg text-info' },
    { label: RECEPTION_DEBTS.kpi.overdue, value: formatNumber(overdueCount), icon: 'alert', tone: 'bg-danger-bg text-danger' },
    { label: RECEPTION_DEBTS.kpi.collected, value: formatMoney(collectedRial), icon: 'success', tone: 'bg-ok-bg text-ok' },
  ]
  return (
    <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tile.tone)}>
            <Icon name={tile.icon} size="card" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-ink-3">{tile.label}</span>
            <span className="truncate text-lg font-bold text-ink tabular-nums">{tile.value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}