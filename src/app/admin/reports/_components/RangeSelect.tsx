/**
 * The reports head's own range picker — the demo's `<select>` over the three spans.
 *
 * A range is a URL the way every other filter in the product is one, so the control
 * is a route push and not a client switch: a manager who shares the link shares the
 * exact span, and the page re-reads the `?range=` param this writes. The three are
 * the demo's own three, and a custom span still reaches the page through the two
 * date fields the head's card holds beside this select.
 *
 * Client because a `<select>` cannot submit on its own and the demo holds no apply
 * button next to it — the change is the submit.
 */

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { ADMIN_REPORTS } from '@/app/admin/catalog'

/** The three spans the URL may spell, as the select's own options hold them. */
export const RANGE_THIS_MONTH = 'month'
export const RANGE_LAST_MONTH = 'last'
export const RANGE_QUARTER = 'quarter'

/** The demo's own three, in the order the select renders them. */
const OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: RANGE_THIS_MONTH, label: ADMIN_REPORTS.rangeThisMonth },
  { value: RANGE_LAST_MONTH, label: ADMIN_REPORTS.rangeLastMonth },
  { value: RANGE_QUARTER, label: ADMIN_REPORTS.rangeQuarter },
]

export interface RangeSelectProps {
  /** The route the select writes, which is the page rendering it. */
  readonly basePath: string
  /** The span the URL names, so a refresh keeps the select in step. */
  readonly value: string
}

export function RangeSelect({ basePath, value }: RangeSelectProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  return (
    <label className="flex items-center gap-2 text-sm text-ink-3">
      <span className="sr-only">{ADMIN_REPORTS.rangeLabel}</span>
      <select
        className="rounded-sm border border-line-2 bg-surface px-3 py-[11px] text-sm font-normal text-ink"
        defaultValue={value}
        onChange={(event) => {
          const next = event.currentTarget.value
          startTransition(() => router.push(next === RANGE_THIS_MONTH ? basePath : `${basePath}?range=${next}`))
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
