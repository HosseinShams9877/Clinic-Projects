/**
 * The «نقشه تزریق» tab — the KPI band, the add button, and the table.
 *
 * A Server Component, and the read is the page's: the profile page already opens
 * the transaction the injections are read in (`loadCustomerProfile`), so this tab
 * takes the rows and counts as props and renders them. A tab that opened its own
 * read would be a second transaction the profile page did not need.
 *
 * ## The tab's own chrome
 *
 * A header with a small icon disc, the customer's injection count as a badge, and
 * the «افزودن تزریق» button on the inline-end edge. Below it, the KPI band. Below
 * that, the table card — and the card's header carries an `info` bar with the
 * clinical-data sentence, so the reader meets the note before the rows rather than
 * after them.
 */

import { Icon } from '@/core/components/icons'

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
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
            <Icon name="treatment" size="card" />
          </span>
          <h2 className="text-lg font-bold text-ink">{INJECTION_TAB.title}</h2>
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-2 tabular-nums">
            {rows.length} {INJECTION_TAB.countSuffix}
          </span>
        </div>
        <InjectionDialog panel={panel} customerId={customerId} />
      </header>

      <InjectionKpi counts={counts} />

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sh-1">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-3">
          <Icon name="info" size="compact" />
          <span>{INJECTION_TAB.hint}</span>
        </div>
        <div className="p-4">
          <InjectionTable rows={rows} />
        </div>
      </div>
    </section>
  )
}