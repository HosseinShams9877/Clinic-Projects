/**
 * The four counts the injection map's tab shows above its table.
 *
 * The four are the module's own read: how many rows, how many sessions they fall
 * across, and the two amount totals — cubic centimetres and units, kept separate
 * because a filler and a toxin are not the same quantity.
 */

import { formatNumber, toPersianDigits } from '@/core/localization'

import type { InjectionCounts } from '@/modules/injections'

import { INJECTION_TAB } from './catalog'

export function InjectionKpi({ counts }: { readonly counts: InjectionCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      <Tile label={INJECTION_TAB.kpi.total} value={toPersianDigits(counts.total)} />
      <Tile label={INJECTION_TAB.kpi.sessions} value={toPersianDigits(counts.sessions)} />
      <Tile label={INJECTION_TAB.kpi.totalCc} value={formatNumber(counts.totalCc)} />
      <Tile label={INJECTION_TAB.kpi.totalUnits} value={formatNumber(counts.totalUnits)} />
    </div>
  )
}

/** One count, in the shape the profile's other tiles render. */
function Tile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="text-lg font-bold text-ink tabular-nums">{value}</span>
    </div>
  )
}