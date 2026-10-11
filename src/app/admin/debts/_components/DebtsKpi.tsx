/**
 * The debts page's four tiles — the demo's KPI row above the per-doctor cards.
 *
 * Presentational: the page sums the real `clinicDebts` buckets and the `payments` month
 * and hands the figures here, so a tile cannot disagree with the table below it. Two of
 * the four carry the sub-count a manager asks after the number («چند نفر؟»), which is
 * the one fact the sum alone does not answer. Amounts are `formatMoney`, counts are
 * `formatNumber` — Persian digits throughout, no fabrication.
 */

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatMoney, formatNumber } from '@/core/localization'

import { ADMIN_DEBTS } from '@/app/admin/catalog'

export interface DebtsKpiProps {
  /** Σ `balance` across every bucket, in rial. */
  readonly totalRial: bigint
  /** The distinct customers the total belongs to. */
  readonly totalDebtors: number
  /** Σ `balance` across the three past-due buckets, in rial. */
  readonly overdueRial: bigint
  /** How many rows are past their due date. */
  readonly overdueCount: number
  /** The mean days overdue across the past-due rows. */
  readonly avgDelayDays: number
  /** Payments received in the current clinic-local month, in rial. */
  readonly collectedRial: bigint
}

export function DebtsKpi({
  totalRial,
  totalDebtors,
  overdueRial,
  overdueCount,
  avgDelayDays,
  collectedRial,
}: DebtsKpiProps) {
  const tiles: readonly {
    readonly label: string
    readonly value: string
    readonly sub: string | null
    readonly icon: IconName
    readonly tone: string
  }[] = [
    {
      label: ADMIN_DEBTS.kpi.total,
      value: formatMoney(totalRial),
      sub: `${formatNumber(totalDebtors)}${ADMIN_DEBTS.totalSubSuffix}`,
      icon: 'debt',
      tone: 'bg-warn-bg text-warn',
    },
    {
      label: ADMIN_DEBTS.kpi.overdue,
      value: formatMoney(overdueRial),
      sub: `${formatNumber(overdueCount)}${ADMIN_DEBTS.overdueSubSuffix}`,
      icon: 'alert',
      tone: 'bg-danger-bg text-danger',
    },
    {
      label: ADMIN_DEBTS.kpi.avgDelay,
      value: `${formatNumber(avgDelayDays)} ${ADMIN_DEBTS.day}`,
      sub: null,
      icon: 'clock',
      tone: 'bg-info-bg text-info',
    },
    {
      label: ADMIN_DEBTS.kpi.collected,
      value: formatMoney(collectedRial),
      sub: null,
      icon: 'success',
      tone: 'bg-ok-bg text-ok',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
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
            {tile.sub === null ? null : (
              <span className="text-xs text-ink-3 tabular-nums">{tile.sub}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
