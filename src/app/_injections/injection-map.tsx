/**
 * The customer's injection map — a face, a point per session area, and the side
 * column that reads the volumes.
 */

import { Icon } from '@/core/components/icons'

import { formatNumber, toPersianDigits } from '@/core/localization'
import {
  INJECTION_AREA_LABELS,
  INJECTION_MATERIAL_LABELS,
  type InjectionRow,
} from '@/modules/injections'
import { InjectionArea, InjectionMaterial, isMember } from '@/core/constants'
import {
  INJECTION_AREA_POINTS,
  INJECTION_MATERIAL_COLORS,
  MATERIAL_FALLBACK,
} from './injection-map-catalog'
import { INJECTION_MAP } from './catalog'

export function InjectionMap({ rows }: { readonly rows: readonly InjectionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        {INJECTION_MAP.empty}
      </p>
    )
  }

  const ascending = [...rows].sort((a, b) => a.sessionAt.getTime() - b.sessionAt.getTime())
  const sessionByRowId = new Map<string, number>(
    ascending.map((row, index) => [row.id, index + 1]),
  )

  const byMaterial = materialTotals(rows)
  const byArea = areaTotals(rows)

  return (
    <section className="grid grid-cols-1 gap-4 panel:grid-cols-[1fr_320px]">
      <div className="relative rounded-lg border border-line bg-surface p-4">
        <FaceSvg rows={rows} sessionByRowId={sessionByRowId} />
      </div>

      <div className="flex flex-col gap-4">
        <SummaryCards byMaterial={byMaterial} />
        <LegendCard />
        <TopAreasCard byArea={byArea} />
      </div>
    </section>
  )
}

/* ── The face ─────────────────────────────────────────────────────────────── */

function FaceSvg({
  rows,
  sessionByRowId,
}: {
  readonly rows: readonly InjectionRow[]
  readonly sessionByRowId: ReadonlyMap<string, number>
}) {
  const offsetByArea = new Map<string, number>()

  return (
    <svg
      role="img"
      aria-label={INJECTION_MAP.title}
      viewBox="120 8 420 534"
      className="mx-auto block h-auto w-full max-w-[420px]"
    >
      <image
        href="/face.svg"
        x={120}
        y={8}
        width={420}
        height={534}
        preserveAspectRatio="xMidYMid meet"
        className="dark:invert dark:hue-rotate-180"
      />

      {rows.map((row) => {
        const point = isMember(InjectionArea, row.area)
          ? INJECTION_AREA_POINTS[row.area]
          : null
        if (point === null) return null

        const count = offsetByArea.get(row.area) ?? 0
        offsetByArea.set(row.area, count + 1)
        const ring = 6 * count
        const angle = (Math.PI * 2 * count) / 6
        const x = point.x + ring * Math.cos(angle)
        const y = point.y + ring * Math.sin(angle)

        const fill = isMember(InjectionMaterial, row.material)
          ? INJECTION_MATERIAL_COLORS[row.material]
          : MATERIAL_FALLBACK

        return (
          <g key={row.id}>
            <circle cx={x} cy={y} r={13} fill="#ffffff" stroke={fill} strokeWidth={3} />
            <text
              x={x}
              y={y + 4.6}
              textAnchor="middle"
              fontSize="13"
              fill={fill}
              style={{ fontFamily: 'inherit', fontWeight: 700 }}
            >
              {sessionByRowId.get(row.id) ?? '?'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── The side column ──────────────────────────────────────────────────────── */

function SummaryCards({
  byMaterial,
}: {
  readonly byMaterial: ReadonlyMap<string, { readonly cc: number; readonly units: number }>
}) {
  const ha = byMaterial.get(InjectionMaterial.HyaluronicAcid)?.cc ?? 0
  const botox = byMaterial.get(InjectionMaterial.Botox)?.units ?? 0

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
          <Icon name="treatment" size="card" />
        </span>
        <span className="flex flex-col">
          <span className="text-xs text-ink-3">{INJECTION_MAP.summary.ha}</span>
          <span className="text-lg font-bold text-ink tabular-nums">{formatNumber(ha)}</span>
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-info-bg text-info">
          <Icon name="treatment" size="card" />
        </span>
        <span className="flex flex-col">
          <span className="text-xs text-ink-3">{INJECTION_MAP.summary.botox}</span>
          <span className="text-lg font-bold text-ink tabular-nums">{formatNumber(botox)}</span>
        </span>
      </div>
    </div>
  )
}

function LegendCard() {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-bold text-ink-2">{INJECTION_MAP.legend}</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-2">
        {Object.values(InjectionMaterial).map((material) => (
          <li key={material} className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-pill"
              style={{
                backgroundColor: INJECTION_MATERIAL_COLORS[material] ?? MATERIAL_FALLBACK,
              }}
              aria-hidden="true"
            />
            {INJECTION_MATERIAL_LABELS[material]}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TopAreasCard({
  byArea,
}: {
  readonly byArea: ReadonlyMap<string, { readonly cc: number; readonly units: number }>
}) {
  const ranked = [...byArea.entries()]
    .map(([area, totals]) => ({
      area,
      total: totals.cc + totals.units / 100,
      cc: totals.cc,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  if (ranked.length === 0) {
    return null
  }

  const max = Math.max(...ranked.map((r) => r.cc), 1)

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-bold text-ink-2">{INJECTION_MAP.topAreas}</h3>
      <ul className="flex flex-col gap-3">
        {ranked.map((entry) => (
          <li key={entry.area} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-ink-2">
                {isMember(InjectionArea, entry.area)
                  ? INJECTION_AREA_LABELS[entry.area]
                  : entry.area}
              </span>
              <span className="text-ink tabular-nums">
                {formatNumber(entry.cc)}{' '}
                <span className="text-ink-3">{INJECTION_MAP.ccUnit}</span>
              </span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
              <span
                className="block h-full rounded-pill bg-brand"
                style={{ width: `${Math.max(6, (entry.cc / max) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── The two tallies ──────────────────────────────────────────────────────── */

function materialTotals(
  rows: readonly InjectionRow[],
): ReadonlyMap<string, { readonly cc: number; readonly units: number }> {
  const map = new Map<string, { cc: number; units: number }>()
  for (const row of rows) {
    const current = map.get(row.material) ?? { cc: 0, units: 0 }
    const amount = Number(row.amount ?? '0') || 0
    if (row.amountUnit === 'CC') current.cc += amount
    else if (row.amountUnit === 'UNIT') current.units += amount
    map.set(row.material, current)
  }
  return map
}

function areaTotals(
  rows: readonly InjectionRow[],
): ReadonlyMap<string, { readonly cc: number; readonly units: number }> {
  const map = new Map<string, { cc: number; units: number }>()
  for (const row of rows) {
    const current = map.get(row.area) ?? { cc: 0, units: 0 }
    const amount = Number(row.amount ?? '0') || 0
    if (row.amountUnit === 'CC') current.cc += amount
    else if (row.amountUnit === 'UNIT') current.units += amount
    map.set(row.area, current)
  }
  return map
}

export { toPersianDigits }