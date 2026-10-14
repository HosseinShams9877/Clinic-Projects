/**
 * The four counts the injection map's tab shows above its table.
 *
 * The four are the module's own read: how many rows, how many sessions they fall
 * across, and the two amount totals — cubic centimetres and units, kept separate
 * because a filler and a toxin are not the same quantity.
 *
 * ## The four tiles and their tones
 *
 * Each tile has its own icon disc, in the shape the profile's KPI band renders:
 * the row count is brand, the session count is info, the cubic centimetres are
 * warn (they are the filler's own unit, and the amber reads as "this is a dose,
 * not a count"), and the units are ok (a toxin's units are the one the clinic
 * tracks and reads as a completed number). The tones are chosen from the four
 * the design system already carries; no new colour is introduced.
 */

import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { formatNumber, toPersianDigits } from '@/core/localization'

import type { InjectionCounts } from '@/modules/injections'

import { INJECTION_TAB } from './catalog'

export function InjectionKpi({ counts }: { readonly counts: InjectionCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      <Tile
        label={INJECTION_TAB.kpi.total}
        value={toPersianDigits(counts.total)}
        icon="treatment"
        tone="bg-brand-50 text-brand-700"
      />
      <Tile
        label={INJECTION_TAB.kpi.sessions}
        value={toPersianDigits(counts.sessions)}
        icon="calendar"
        tone="bg-info-bg text-info"
      />
      <Tile
        label={INJECTION_TAB.kpi.totalCc}
        value={formatNumber(counts.totalCc)}
        icon="treatment"
        tone="bg-warn-bg text-warn"
      />
      <Tile
        label={INJECTION_TAB.kpi.totalUnits}
        value={formatNumber(counts.totalUnits)}
        icon="treatment"
        tone="bg-ok-bg text-ok"
      />
    </div>
  )
}

/** One count, in the shape the profile's other tiles render. */
function Tile({
  label,
  value,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly icon: IconName
  readonly tone: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-sh-1 transition-shadow hover:shadow-sh-2">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-md ${tone}`}
        aria-hidden="true"
      >
        <Icon name={icon} size="card" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="truncate text-lg font-bold text-ink tabular-nums">{value}</span>
      </span>
    </div>
  )
}