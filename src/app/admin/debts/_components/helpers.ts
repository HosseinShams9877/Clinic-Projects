/**
 * The debts page's pure helpers — the day arithmetic, the URL params and the filters.
 *
 * None of these hold a row or a permission; they are the page's own derivations over the
 * buckets `clinicDebts` already returned. The module's own bucket is the severity ladder
 * the chips filter on; the day count a cell renders is the page's, because a sentence
 * needs the exact number and not the ladder.
 */

import { DebtBucket, isMember } from '@/core/constants'
import { normalizeForSearch, normalizeMobile } from '@/core/localization'

import { ADMIN_DEBTS } from '@/app/admin/catalog'
import type { DebtBuckets, DebtRow } from '@/modules/debts'

/** The four buckets as one list, in the severity order the module stacks them in. */
export function allDebtRows(buckets: DebtBuckets): readonly DebtRow[] {
  return [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue, ...buckets.dueSoon]
}

/** Whole days between two `LocalDate` strings (proleptic Gregorian ISO). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

/** The three buckets a row past its due date lands in. */
const PAST_DUE_BUCKETS: readonly DebtBucket[] = [
  DebtBucket.Over30Days,
  DebtBucket.Over7Days,
  DebtBucket.PastDue,
]

/** The rows past their due date — the three late buckets, and not the soon one. */
export function pastDue(rows: readonly DebtRow[]): readonly DebtRow[] {
  const late = new Set(PAST_DUE_BUCKETS)
  return rows.filter((row) => late.has(row.bucket))
}

/** The mean days overdue across the past-due rows, rounded to a whole day. */
export function averageDelay(rows: readonly DebtRow[], today: string): number {
  const delays = pastDue(rows)
    .map((row) => daysBetween(row.dueLocalDate, today))
    .filter((days) => days > 0)
  if (delays.length === 0) return 0
  return Math.round(delays.reduce((total, days) => total + days, 0) / delays.length)
}

/** How many rows each bucket holds, keyed as the chips' own filter value. */
export function bucketCounts(rows: readonly DebtRow[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.bucket] = (counts[row.bucket] ?? 0) + 1
  }
  return counts
}

/** The doctors who hold an open balance, as the `<select>`'s own options. */
export function doctorOptions(
  rows: readonly DebtRow[],
  doctorNames: Readonly<Record<string, string>>,
): readonly { readonly id: string; readonly name: string }[] {
  const byDoctor = new Map<string, { readonly id: string; readonly name: string }>()
  for (const row of rows) {
    byDoctor.set(row.doctorId, {
      id: row.doctorId,
      name: doctorNames[row.doctorId] ?? ADMIN_DEBTS.doctorFallback,
    })
  }
  return [...byDoctor.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa'))
}

/** One search param as a plain string, or '' when the URL does not carry one. */
export function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

/** The bucket the URL names, or `null` when it names one the module does not hold. */
export function bucketFromParam(value: string | string[] | undefined): DebtBucket | null {
  if (typeof value !== 'string') return null
  return isMember(DebtBucket, value) ? value : null
}

/** Whether a row matches the toolbar's query, by the two columns a debt is known by. */
export function matchesQuery(row: DebtRow, query: string): boolean {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return true

  const name = normalizeForSearch(
    row.customerLastName === null
      ? row.customerFirstName
      : `${row.customerFirstName} ${row.customerLastName}`,
  )
  const mobile = normalizeMobile(row.customerMobile)

  return tokens.every((token) => name.includes(token) || mobile.includes(token))
}

/**
 * The typed query as the tokens each must match.
 *
 * The search reads one token per word and requires all of them, so a name typed in
 * either order finds the same row and a mobile typed in part of its digits finds it
 * too. A token that is only digits is folded with `normalizeMobile` — which folds
 * the Persian and Arabic digits to Latin and strips the country prefix — and every
 * other token is folded with `normalizeForSearch`, which is the same fold the
 * name column went through. An all-whitespace query is no tokens at all.
 */
function tokenizeQuery(query: string): readonly string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((token) =>
      /^[\d\u06F0-\u06F9\u0660-\u0669]+$/.test(token)
        ? normalizeMobile(token)
        : normalizeForSearch(token),
    )
    .filter((token) => token !== '')
}
