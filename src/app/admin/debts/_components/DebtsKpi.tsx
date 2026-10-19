import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatMoney, formatNumber } from '@/core/localization'
import { ADMIN_DEBTS } from '@/app/admin/catalog'

export interface DebtsKpiProps {
  readonly totalRial: bigint
  readonly totalDebtors: number
  readonly over30Count: number
  readonly between1and7Count: number
}

export function DebtsKpi({
  totalRial,
  totalDebtors,
  over30Count,
  between1and7Count,
}: DebtsKpiProps) {
  const tiles = [
    {
      label: ADMIN_DEBTS.kpi.total,
      value: formatNumber(totalDebtors),
      sub: ADMIN_DEBTS.kpi.totalSubSuffix,
      icon: 'customers' as IconName,
      tone: 'bg-info-bg text-info',
    },
    {
      label: ADMIN_DEBTS.kpi.totalAmount,
      value: formatMoney(totalRial),
      sub: null,
      icon: 'debt' as IconName,
      tone: 'bg-danger-bg text-danger',
    },
    {
      label: ADMIN_DEBTS.kpi.between1and7,
      value: formatNumber(between1and7Count),
      sub: ADMIN_DEBTS.kpi.totalSubSuffix,
      icon: 'clock' as IconName,
      tone: 'bg-warn-bg text-warn',
    },
    {
      label: ADMIN_DEBTS.kpi.over30,
      value: formatNumber(over30Count),
      sub: ADMIN_DEBTS.kpi.totalSubSuffix,
      icon: 'alert' as IconName,
      tone: 'bg-danger-bg text-danger',
    },
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
            {tile.sub === null ? null : (
              <span className="text-xs text-ink-3 tabular-nums">{tile.sub}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}