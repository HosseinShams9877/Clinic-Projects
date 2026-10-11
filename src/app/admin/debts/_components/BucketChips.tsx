/**
 * The debts toolbar's bucket chips — «همه» and the four severities, as `?bucket=` links.
 *
 * The labels are the module's own (`DEBT_BUCKET_LABELS`) and not the page's restatement
 * of them: the one place a bucket's name is written is the one place the desk recognises
 * it from, and a chip that re-spelled «بیش از ۷ روز» would be a second definition of the
 * same ladder the module computes. The count each chip carries is the real row count for
 * that bucket, so a chip is a promise the table keeps.
 *
 * Each link carries the query and the doctor the URL already names, so narrowing by one
 * does not drop the other two.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'
import { formatNumber } from '@/core/localization'
import { DEBT_BUCKET_LABELS, DEBT_BUCKET_ORDER } from '@/modules/debts'

import { ADMIN_DEBTS } from '@/app/admin/catalog'
import { DEBT_QUERY_PARAM } from './DebtSearchForm'

export interface BucketChipsProps {
  /** The bucket the URL names, or `null` when it names none. */
  readonly active: string | null
  /** How many rows each bucket holds, keyed as the chips' own filter value. */
  readonly counts: Readonly<Record<string, number>>
  /** The count «همه» carries, which is every bucket's rows. */
  readonly total: number
  /** The query the URL carries, kept on each chip's href. */
  readonly query: string
  /** The doctor the URL names, kept on each chip's href. */
  readonly doctorId: string
}

export function BucketChips({ active, counts, total, query, doctorId }: BucketChipsProps) {
  const chips: readonly { readonly key: string; readonly label: string; readonly count: number }[] = [
    { key: '', label: ADMIN_DEBTS.filterAll, count: total },
    ...DEBT_BUCKET_ORDER.map((bucket) => ({
      key: bucket,
      label: DEBT_BUCKET_LABELS[bucket],
      count: counts[bucket] ?? 0,
    })),
  ]

  return (
    <nav className="flex flex-wrap gap-2" aria-label={ADMIN_DEBTS.columns.status}>
      {chips.map((chip) => {
        const isActive = chip.key === (active ?? '')
        return (
          <Link
            key={chip.key}
            href={hrefFor(chip.key, query, doctorId)}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {chip.label}
            <span className="ms-1 text-[0.7em] opacity-70 tabular-nums">{formatNumber(chip.count)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** One chip's href, carrying the two filters the URL may already hold. */
function hrefFor(bucket: string, query: string, doctorId: string): string {
  const sp = new URLSearchParams()
  if (query !== '') sp.set(DEBT_QUERY_PARAM, query)
  if (doctorId !== '') sp.set('doctor', doctorId)
  if (bucket !== '') sp.set('bucket', bucket)
  const qs = sp.toString()
  return qs === '' ? '/admin/debts' : `/admin/debts?${qs}`
}
