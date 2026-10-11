/**
 * The shared table pagination control — 10 rows a page, `?page=` in the URL.
 *
 * A Server Component: it emits `<Link>`s so a page stays server-rendered and the page
 * number is a bookmarkable URL fact, the same shape the filters and search already take.
 * The caller slices its own rows and tells this control the page and the total; the
 * control hides itself when there is one page or none. `hrefFor` builds each link so the
 * caller keeps its other params (a filter, a search query) on the URL.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'

import { PAGINATION } from './catalog'

/** The rows one page shows across the reception panel. */
export const PAGE_SIZE = 10

export interface PaginationProps {
  /** The current 1-based page. */
  readonly page: number
  /** The total number of pages (≥ 1). */
  readonly totalPages: number
  /** Builds the href for a page, preserving the caller's other search params. */
  readonly hrefFor: (page: number) => string
}

export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null
  const atStart = page <= 1
  const atEnd = page >= totalPages
  const chip = 'rounded-xs border border-line-2 px-3 py-[6px] text-xs font-semibold no-underline'

  return (
    <nav className="flex items-center justify-center gap-3 pt-2">
      {atStart ? (
        <span className={cx(chip, 'bg-surface-2 text-ink-3')} aria-disabled="true">
          {PAGINATION.prev}
        </span>
      ) : (
        <Link href={hrefFor(page - 1)} className={cx(chip, 'bg-surface text-ink-2 hover:bg-surface-2')}>
          {PAGINATION.prev}
        </Link>
      )}

      <span className="text-xs text-ink-2 tabular-nums">
        {PAGINATION.page} {formatNumber(page)} {PAGINATION.of} {formatNumber(totalPages)}
      </span>

      {atEnd ? (
        <span className={cx(chip, 'bg-surface-2 text-ink-3')} aria-disabled="true">
          {PAGINATION.next}
        </span>
      ) : (
        <Link href={hrefFor(page + 1)} className={cx(chip, 'bg-surface text-ink-2 hover:bg-surface-2')}>
          {PAGINATION.next}
        </Link>
      )}
    </nav>
  )
}

/** The current page from a `?page=` value, clamped to at least 1. */
export function pageFromParam(value: string | string[] | undefined): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** The page's slice of a list, and the total page count. */
export function paginate<T>(rows: readonly T[], page: number): { readonly slice: readonly T[]; readonly totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const start = (current - 1) * PAGE_SIZE
  return { slice: rows.slice(start, start + PAGE_SIZE), totalPages }
}
