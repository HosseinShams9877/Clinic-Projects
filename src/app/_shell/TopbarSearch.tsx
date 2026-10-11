/**
 * The topbar's live customer search — a debounced input with a results dropdown.
 *
 * Typing queries the staff member's customer file through `quickSearchCustomersAction`
 * (which reuses the app's existing `loadCustomersList`, no new module query); each hit
 * links to the customer — the detail route where the panel has one, otherwise the
 * panel's customers list filtered to that mobile. Customers only: there is no exposed
 * services-by-name query, so services are not searched here.
 */

'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { formatPhone } from '@/core/localization'

import { TOPBAR } from './catalog'
import { quickSearchCustomersAction, type TopbarSearchResult } from './actions'
import type { Panel } from './navigation'

export interface TopbarSearchProps {
  readonly panel: Panel
  /** The panel's customers list, the fallback destination. */
  readonly basePath: string
  /** The panel's customer-detail route, or `null` when it has none. */
  readonly detailPath: string | null
}

export function TopbarSearch({ panel, basePath, detailPath }: TopbarSearchProps) {
  const [value, setValue] = useState('')
  const [results, setResults] = useState<readonly TopbarSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(next: string) {
    setValue(next)
    if (timer.current !== null) clearTimeout(timer.current)
    if (next.trim() === '') {
      setResults([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(() => {
      void quickSearchCustomersAction(panel, next).then((hits) => {
        setResults(hits)
        setOpen(true)
      })
    }, 250)
  }

  const hrefFor = (result: TopbarSearchResult): string =>
    detailPath === null ? `${basePath}?q=${encodeURIComponent(result.mobile)}` : `${detailPath}/${result.id}`

  return (
    <div className="relative min-w-0 max-w-md flex-1">
      <label className="flex items-center gap-2 rounded-pill bg-surface-sunken px-4 py-2 text-ink-2">
        <Icon name="search" size="compact" />
        <input
          type="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          placeholder={TOPBAR.searchPlaceholder}
          aria-label={TOPBAR.searchLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </label>
      {open && results.length > 0 ? (
        <ul className="absolute top-[calc(100%+6px)] z-[var(--z-popover)] overflow-hidden rounded-md border border-line bg-surface shadow-3 [inset-inline:0]">
          {results.map((result) => (
            <li key={result.id}>
              <Link
                href={hrefFor(result)}
                className={cx('flex items-center justify-between gap-3 px-4 py-2 text-sm no-underline hover:bg-surface-sunken')}
                onMouseDown={(event) => event.preventDefault()}
              >
                <span className="font-semibold text-ink">{result.name}</span>
                <span className="text-xs text-ink-3 tabular-nums" dir="ltr">
                  {formatPhone(result.mobile)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
