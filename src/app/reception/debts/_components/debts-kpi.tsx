/**
 * The debts page's KPI row — the demo's four page-head tiles above the severity buckets.
 *
 * Presentational: the page sums the real `contactList` buckets and hands the figures
 * here, so a tile cannot disagree with the tables below it. Amounts are `formatMoney`,
 * the count is `formatNumber` — Persian digits throughout, no fabrication.
 */

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatMoney, formatNumber } from '@/core/localization'

import { RECEPTION_DEBTS } from '@/app/catalog'

export interface DebtsKpiProps {
  /** Total outstanding balance across every bucket, in rial. */
  readonly totalRial: bigint
  /** Balance of the three past-due buckets, in rial. */
  readonly overdueRial: bigint
  /** Balance of the due-soon bucket, in rial. */
  readonly dueSoonRial: bigint
  /** How many debtors there are in total. */
  readonly debtors: number
}

export function DebtsKpi({ totalRial, overdueRial, dueSoonRial, debtors }: DebtsKpiProps) {
  const tiles: readonly { label: string; value: string; icon: IconName; tone: string }[] = [
    { label: RECEPTION_DEBTS.kpi.total, value: formatMoney(totalRial), icon: 'debt', tone: 'bg-info-bg text-info' },
    { label: RECEPTION_DEBTS.kpi.overdue, value: formatMoney(overdueRial), icon: 'alert', tone: 'bg-danger-bg text-danger' },
    { label: RECEPTION_DEBTS.kpi.dueSoon, value: formatMoney(dueSoonRial), icon: 'clock', tone: 'bg-warn-bg text-warn' },
    { label: RECEPTION_DEBTS.kpi.debtors, value: formatNumber(debtors), icon: 'customer', tone: 'bg-ok-bg text-ok' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
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
