/**
 * The debts page's per-doctor cards — the demo's three tiles under the KPI row.
 *
 * The same rows the table holds, grouped by the doctor who did the work, because a debt
 * is settled through a relationship and the relationship is the doctor's. The page hands
 * the rows and the names it already looked up; the card's hint counts the rows more than
 * a week late, which is the one a doctor can still rescue with a call.
 *
 * Renders nothing when the clinic holds no open balance — a row of empty cards under a
 * zero tile would be three boxes the manager learns to skip.
 */

import { formatMoney, formatNumber } from '@/core/localization'
import type { DebtRow } from '@/modules/debts'
import { DebtBucket } from '@/core/constants'

import { ADMIN_DEBTS } from '@/app/admin/catalog'

export interface DoctorCardsProps {
  /** Every bucket's rows, as the page read them. */
  readonly rows: readonly DebtRow[]
  /** The membership ids → Persian names map, as `loadDoctorNames` built it. */
  readonly doctorNames: Readonly<Record<string, string>>
}

export function DoctorCards({ rows, doctorNames }: DoctorCardsProps) {
  const byDoctor = new Map<string, { rial: bigint; debtors: Set<string>; over7: number }>()
  for (const row of rows) {
    const card = byDoctor.get(row.doctorId) ?? { rial: 0n, debtors: new Set<string>(), over7: 0 }
    card.rial += row.balance
    card.debtors.add(row.customerId)
    if (row.bucket === DebtBucket.Over7Days || row.bucket === DebtBucket.Over30Days) card.over7 += 1
    byDoctor.set(row.doctorId, card)
  }
  const cards = [...byDoctor.entries()]
    .map(([doctorId, card]) => ({
      id: doctorId,
      name: doctorNames[doctorId] ?? ADMIN_DEBTS.doctorFallback,
      rial: card.rial,
      debtors: card.debtors.size,
      over7: card.over7,
    }))
    .sort((a, b) => (a.rial > b.rial ? -1 : a.rial < b.rial ? 1 : 0))

  if (cards.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.id}
          className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3"
        >
          <span className="text-sm text-ink-2">{card.name}</span>
          <span className="text-lg font-bold text-ink tabular-nums">{formatMoney(card.rial)}</span>
          <span className="text-xs text-ink-3 tabular-nums">
            {formatNumber(card.debtors)}
            {ADMIN_DEBTS.doctorHintDebtors}
            {' · '}
            {formatNumber(card.over7)}
            {ADMIN_DEBTS.doctorHintOverdue}
          </span>
        </div>
      ))}
    </div>
  )
}
