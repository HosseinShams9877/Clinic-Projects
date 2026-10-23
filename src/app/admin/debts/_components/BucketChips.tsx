import Link from 'next/link'
import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'
import { ADMIN_DEBTS } from '@/app/admin/catalog'
import { DebtBucket } from '@/core/constants'

export interface BucketChipsProps {
  readonly active: string | null
  readonly counts: Readonly<Record<string, number>>
  readonly total: number
  readonly query: string
  readonly doctorId: string
}

export function BucketChips({ active, counts, total, query, doctorId }: BucketChipsProps) {
  const chips = [
    { key: '', label: ADMIN_DEBTS.filterAll, count: total },
    { key: DebtBucket.PastDue, label: ADMIN_DEBTS.filterPastDue, count: counts[DebtBucket.PastDue] ?? 0 },
    { key: DebtBucket.DueSoon, label: ADMIN_DEBTS.filterNearDue, count: counts[DebtBucket.DueSoon] ?? 0 },
    { key: DebtBucket.Over7Days, label: ADMIN_DEBTS.filterOver7, count: counts[DebtBucket.Over7Days] ?? 0 },
    { key: DebtBucket.Over30Days, label: ADMIN_DEBTS.filterOver30, count: counts[DebtBucket.Over30Days] ?? 0 },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = chip.key === (active ?? '')
        return (
          <Link
            key={chip.key}
            href={hrefFor(chip.key, query, doctorId)}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold no-underline transition-colors',
              isActive
                ? 'border-transparent bg-brand text-ink-inverse shadow-sm'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2'
            )}
          >
            <span className={cx('grid size-5 place-items-center rounded-pill text-[10px]', isActive ? 'bg-surface text-brand' : 'bg-surface-sunken text-ink-3')}>
              {formatNumber(chip.count)}
            </span>
            {chip.label}
          </Link>
        )
      })}
    </div>
  )
}

function hrefFor(bucket: string, query: string, doctorId: string): string {
  const sp = new URLSearchParams()
  if (query !== '') sp.set('q', query)
  if (doctorId !== '') sp.set('doctor', doctorId)
  if (bucket !== '') sp.set('bucket', bucket)
  const qs = sp.toString()
  return qs === '' ? '/admin/debts' : `/admin/debts?${qs}`
}