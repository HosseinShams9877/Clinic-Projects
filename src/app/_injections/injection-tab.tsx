/**
 * The «نقشه تزریق» tab — the KPI band, the add button, and the table.
 *
 * A Server Component, and the read is the page's: the profile page already opens
 * the transaction the injections are read in (`loadCustomerProfile`), so this tab
 * takes the rows and counts as props and renders them. A tab that opened its own
 * read would be a second transaction the profile page did not need.
 */

import type { InjectionCounts, InjectionRow } from '@/modules/injections'

import { InjectionDialog } from './injection-dialog'
import { InjectionKpi } from './injection-kpi'
import { InjectionTable } from './injection-table'
import { INJECTION_TAB } from './catalog'

export function InjectionTab({
  rows,
  counts,
  panel,
  customerId,
}: {
  readonly rows: readonly InjectionRow[]
  readonly counts: InjectionCounts
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly customerId: string
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-ink">{INJECTION_TAB.title}</h2>
          <span className="text-xs text-ink-3">
            {rows.length} {INJECTION_TAB.countSuffix}
          </span>
        </div>
        <InjectionDialog panel={panel} customerId={customerId} />
      </header>

      <InjectionKpi counts={counts} />

      <div className="rounded-lg border border-line bg-surface p-4">
        <InjectionTable rows={rows} />
        <p className="mt-4 text-xs text-ink-3">{INJECTION_TAB.hint}</p>
      </div>
    </section>
  )
}