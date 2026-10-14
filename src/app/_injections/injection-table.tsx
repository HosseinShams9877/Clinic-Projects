/**
 * The injection map's table — one row per injection.
 *
 * The rows are the module's own shape and the table is the profile's rendering of
 * them. The material cell joins the material and the brand, because the two are
 * one fact to a reader (a brand is not a material, but a material with a brand is
 * what was injected) and a column for each would be two columns that read as one.
 *
 * ## The table's own visual language
 *
 * The header is `bg-surface-2`, the body rows alternate on `odd:bg-surface-2/40`
 * so a wide table is scannable across, and a row highlights on hover. The area
 * column carries a small brand dot before the label, because the area is the one
 * fact a reader scans first. The amount cell is the one cell that is
 * `text-brand-700` and bold — a dosage is the number a doctor reads, and the
 * colour marks it as the cell that matters. An empty cell is a muted dash, not a
 * blank, so the reader knows the column exists and the row does not carry it.
 *
 * ## Why every cell declares `text-start`
 *
 * The table is RTL, and a `<th>` or `<td>` without an explicit alignment takes the
 * browser's default — which is `start`, but only if the direction is inherited
 * correctly through the sticky-header's own stacking context. Declaring it on both
 * the header and every body cell is what makes a column's title sit exactly above
 * its own values: the two are one alignment, stated twice.
 */

import { asLocalDate, formatDate } from '@/core/localization'
import { Icon } from '@/core/components/icons'

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
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-2 bg-surface-2 px-4 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-pill bg-brand-50 text-brand-700">
          <Icon name="treatment" size="action" />
        </span>
        <p className="text-sm text-ink-3">{INJECTION_TAB.empty}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2">
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
            <tr
              key={row.id}
              className="border-t border-line transition-colors odd:bg-surface-2/40 hover:bg-brand-50/60"
            >
              <Td>
                <span className="flex items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-pill bg-brand-300" aria-hidden="true" />
                  <span className="font-semibold text-ink">{areaLabel(row.area)}</span>
                </span>
              </Td>
              <Td>
                <span className="font-semibold text-ink">{materialLabel(row.material)}</span>
                {row.brand === null ? null : (
                  <span className="block text-xs text-ink-3">{row.brand}</span>
                )}
              </Td>
              <Td>
                <span className="inline-flex rounded-sm bg-brand-50 px-2 py-0.5 font-semibold text-brand-700 tabular-nums">
                  {amountLabel(row.amount, row.amountUnit)}
                </span>
              </Td>
              <Td>
                <span className="text-ink-2">{depthLabel(row.depth)}</span>
              </Td>
              <Td>
                <span className="text-ink-2">{techniqueLabel(row.technique)}</span>
              </Td>
              <Td>
                <span className="text-ink-2 tabular-nums" dir="ltr">
                  {row.batchNumber ?? <Dash />}
                </span>
              </Td>
              <Td>
                <span className="flex items-center gap-1.5 text-ink-2 tabular-nums">
                  <Icon name="calendar" size="compact" className="text-ink-3" />
                  {formatDate(asLocalDate(row.localDate), 'short')}
                </span>
              </Td>
              <Td>
                <span className="text-ink-2">
                  {row.note === null || row.note === '' ? <Dash /> : row.note}
                </span>
              </Td>
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
    <th
      scope="col"
      className="whitespace-nowrap border-b border-line-2 px-3 py-2.5 text-start align-middle text-xs font-semibold text-ink-3"
    >
      {children}
    </th>
  )
}

/** One body cell, with the header's own start alignment. */
function Td({ children }: { readonly children: React.ReactNode }) {
  return <td className="px-3 py-2.5 text-start align-middle">{children}</td>
}

/** The em-dash an empty cell renders, so the cell is legible as "empty". */
function Dash() {
  return <span className="text-ink-3">—</span>
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