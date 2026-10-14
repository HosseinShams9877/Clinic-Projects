/**
 * The injection map's table — one row per injection, and the filter above it.
 *
 * The rows are the module's own shape and the table is the profile's rendering of
 * them. The material cell joins the material and the brand, because the two are
 * one fact to a reader (a brand is not a material, but a material with a brand is
 * what was injected) and a column for each would be two columns that read as one.
 */

import { asLocalDate, formatDate } from '@/core/localization'


import {
  INJECTION_AREA_LABELS,
  INJECTION_DEPTH_LABELS,
  INJECTION_MATERIAL_LABELS,
  INJECTION_TECHNIQUE_LABELS,
  INJECTION_UNIT_LABELS,
  type InjectionRow,
} from '@/modules/injections'

import { INJECTION_TAB } from './catalog'

export function InjectionTable({ rows }: { readonly rows: readonly InjectionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">
        {INJECTION_TAB.empty}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-2 text-ink-3">
            <Th>{INJECTION_TAB.columns.area}</Th>
            <Th>{INJECTION_TAB.columns.material}</Th>
            <Th>{INJECTION_TAB.columns.amount}</Th>
            <Th>{INJECTION_TAB.columns.depth}</Th>
            <Th>{INJECTION_TAB.columns.technique}</Th>
            <Th>{INJECTION_TAB.columns.batch}</Th>
            <Th>{INJECTION_TAB.columns.session}</Th>
            <Th>{INJECTION_TAB.columns.note}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink">{areaLabel(row.area)}</td>
              <td className="px-3 py-2 text-ink-2">
                <span className="font-semibold text-ink">{materialLabel(row.material)}</span>
                {row.brand === null ? null : (
                  <span className="block text-xs text-ink-3">{row.brand}</span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-ink-2">{amountLabel(row.amount, row.amountUnit)}</td>
              <td className="px-3 py-2 text-ink-2">{depthLabel(row.depth)}</td>
              <td className="px-3 py-2 text-ink-2">{techniqueLabel(row.technique)}</td>
              <td className="px-3 py-2 text-ink-2 tabular-nums" dir="ltr">
                {row.batchNumber ?? '—'}
              </td>
              <td className="px-3 py-2 text-ink-2 tabular-nums">
                {formatDate(asLocalDate(row.localDate), 'short')}
              </td>
              <td className="px-3 py-2 text-ink-2">{row.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One column header, matching the design system's tables. */
function Th({ children }: { readonly children: React.ReactNode }) {
  return (
    <th scope="col" className="whitespace-nowrap px-3 py-2 text-start text-xs font-semibold">
      {children}
    </th>
  )
}

/** One area's label, or the raw code a row this release does not know renders. */
function areaLabel(code: string): string {
  const key = code as keyof typeof INJECTION_AREA_LABELS
  return INJECTION_AREA_LABELS[key] ?? code
}

/** One material's label. */
function materialLabel(code: string): string {
  const key = code as keyof typeof INJECTION_MATERIAL_LABELS
  return INJECTION_MATERIAL_LABELS[key] ?? code
}

/** One depth's label, or a dash when the row holds none. */
function depthLabel(code: string | null): string {
  if (code === null) return '—'
  const key = code as keyof typeof INJECTION_DEPTH_LABELS
  return INJECTION_DEPTH_LABELS[key] ?? code
}

/** One technique's label, or a dash when the row holds none. */
function techniqueLabel(code: string | null): string {
  if (code === null) return '—'
  const key = code as keyof typeof INJECTION_TECHNIQUE_LABELS
  return INJECTION_TECHNIQUE_LABELS[key] ?? code
}

/** The amount and its unit, as the cell reads them. */
function amountLabel(amount: string | null, unit: string | null): string {
  if (amount === null) return '—'
  if (unit === null) return amount
  const key = unit as keyof typeof INJECTION_UNIT_LABELS
  return `${amount} ${INJECTION_UNIT_LABELS[key] ?? unit}`
}