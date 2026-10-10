'use client'

/**
 * The desk's task cartable — «کارهای امروز».
 */

import { useState } from 'react'
import Link from 'next/link'

import { Button } from '@/core/components/button/Button'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { DESK_PAGE } from '@/app/catalog'

import { WorkCard } from './work-card'

export interface TaskRow {
  readonly id: string
  readonly priority: 'urgent' | 'today'
  readonly kind: TaskKind
  readonly description: string
  readonly names: readonly string[]
  readonly action: { readonly label: string; readonly href: string }
}

export type TaskKind = 'overdue' | 'debt' | 'lead' | 'cycle' | 'call' | 'birthday'

const PRIORITY_CLASS: Readonly<Record<TaskRow['priority'], string>> = {
  urgent: 'bg-brand-50 text-brand',
  today: 'bg-surface-sunken text-ink-2',
}

const CHIP_ORDER: readonly (TaskKind | 'all')[] = [
  'all',
  'overdue',
  'debt',
  'lead',
  'cycle',
  'call',
  'birthday',
]

export function TaskCartable({ rows }: { rows: readonly TaskRow[] }) {
  const [active, setActive] = useState<TaskKind | 'all'>('all')

  const counts = countByKind(rows)
  const visible = active === 'all' ? rows : rows.filter((row) => row.kind === active)

  return (
    <WorkCard
      title={DESK_PAGE.cartable.title}
      icon={<Icon name="appointment" />}
      action={
        <div className="flex flex-wrap items-center gap-1">
          {CHIP_ORDER.map((kind) => {
            const count = kind === 'all' ? rows.length : counts[kind]
            if (kind !== 'all' && count === 0) return null
            return (
              <Chip
                key={kind}
                label={DESK_PAGE.cartable.filters[kind]}
                count={count}
                active={active === kind}
                onClick={() => setActive(kind)}
              />
            )
          })}
        </div>
      }
    >
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">
          {DESK_PAGE.cartable.empty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {visible.map((row) => (
            <TaskItem key={row.id} row={row} />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-2">{DESK_PAGE.cartable.footer}</p>
    </WorkCard>
  )
}

function TaskItem({ row }: { row: TaskRow }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cx(
              'rounded-xs px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
              PRIORITY_CLASS[row.priority],
            )}
          >
            {DESK_PAGE.cartable.priority[row.priority]}
          </span>
          <span className="truncate text-sm text-ink">{row.description}</span>
        </div>
        {row.names.length === 0 ? null : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            {row.names.map((name, index) => (
              <li key={`${row.id}-${String(index)}`}>{name}</li>
            ))}
          </ul>
        )}
      </div>
      <Link href={row.action.href} className="shrink-0 no-underline">
        <Button variant="soft" size="small">
          {row.action.label}
        </Button>
      </Link>
    </li>
  )
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex items-center gap-1 rounded-pill border px-2.5 py-1 text-xs font-semibold',
        '[transition:var(--transition-control)]',
        active
          ? 'border-brand bg-brand-50 text-brand'
          : 'border-line bg-surface text-ink-2 hover:border-brand',
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  )
}

function countByKind(rows: readonly TaskRow[]): Record<TaskKind, number> {
  const counts: Record<TaskKind, number> = {
    overdue: 0,
    debt: 0,
    lead: 0,
    cycle: 0,
    call: 0,
    birthday: 0,
  }
  for (const row of rows) counts[row.kind] += 1
  return counts
}