/**
 * One row of the manager's debt table — the demo's eight columns, as a `<tr>`.
 *
 * Server Component: the row is a read, and the one navigation it holds («پرونده») is a
 * link the row can write itself. The two name columns are the page's app-tier lookups —
 * `DebtRow` carries the ids and the names are looked up where the table is composed.
 *
 * The status cell is the one place the page derives a fact the module did not compute:
 * the number of days between the row's due date and today. The module's own bucket is
 * the severity ladder the chips filter on; this cell is the sentence a manager reads,
 * which needs the exact count and not the ladder.
 */

import Link from 'next/link'

import { asLocalDate, dateToLocalDate, formatDate, formatMoney, formatPhone, toPersianDigits } from '@/core/localization'
import { cx } from '@/core/lib'

import { ADMIN_DEBTS } from '@/app/admin/catalog'
import type { DebtRow } from '@/modules/debts'

import { daysBetween } from './helpers'

/** The route the profile lives at, as the row's «اقدام» cell links to. */
const PROFILE_BASE_PATH = '/admin/customer'

export interface DebtRowViewProps {
  readonly row: DebtRow
  /** The clinic-local day the page resolved, as the status cell's reference. */
  readonly today: string
  /** The service's name, or `null` when the row's service is not in the catalogue. */
  readonly serviceName: string | null
  /** The doctor's Persian name, or `null` when the membership read missed the id. */
  readonly doctorName: string | null
}

export function DebtRowView({ row, today, serviceName, doctorName }: DebtRowViewProps) {
  const name = row.customerLastName === null ? row.customerFirstName : `${row.customerFirstName} ${row.customerLastName}`
  const delay = daysBetween(row.dueLocalDate, today)

  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700"
            aria-hidden="true"
          >
            {row.customerFirstName.slice(0, 1)}
          </span>
          <span className="flex flex-col">
            <span className="font-semibold text-ink">{name}</span>
            <span className="text-xs text-ink-3 tabular-nums" dir="ltr">
              {formatPhone(row.customerMobile)}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-ink-2">{serviceName ?? '—'}</td>
      <td className="px-4 py-3 text-ink-3">{doctorName ?? '—'}</td>
      <td className="px-4 py-3 text-end font-bold text-warn tabular-nums">{formatMoney(row.balance)}</td>
      <td className="px-4 py-3 text-ink-3 tabular-nums">{formatDate(asLocalDate(row.dueLocalDate), 'short')}</td>
      <td className="px-4 py-3">{statusBadge(delay)}</td>
      <td className="px-4 py-3 text-ink-3 tabular-nums">
        {row.debtFollowUpAt === null ? (
          ADMIN_DEBTS.notFollowedUp
        ) : (
          <span className="flex flex-col">
            <span>{ADMIN_DEBTS.followedUp}</span>
            <span>{formatDate(dateToLocalDate(row.debtFollowUpAt), 'short')}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <Link
          href={`${PROFILE_BASE_PATH}/${row.customerId}`}
          className="inline-flex items-center rounded-xs border border-transparent bg-brand-50 px-3 py-[6px] text-xs font-semibold text-brand-700 no-underline hover:bg-brand-100"
        >
          {ADMIN_DEBTS.profile}
        </Link>
      </td>
    </tr>
  )
}

/**
 * The status cell's badge — the day count, as the delay's sign reads it.
 *
 * Positive is past due (danger), negative is still ahead (info), and the day a debt is
 * due is neither and reads its own sentence.
 */
function statusBadge(delay: number): React.ReactNode {
  if (delay === 0) {
    return <span className="inline-flex rounded-pill bg-warn-bg px-2 py-1 text-xs font-semibold text-warn">{ADMIN_DEBTS.dueToday}</span>
  }
  if (delay > 0) {
    return (
      <span className="inline-flex rounded-pill bg-danger-bg px-2 py-1 text-xs font-semibold text-danger tabular-nums">
        {toPersianDigits(delay)} {ADMIN_DEBTS.daysLateSuffix}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-pill bg-info-bg px-2 py-1 text-xs font-semibold text-info tabular-nums">
      {toPersianDigits(-delay)} {ADMIN_DEBTS.daysLeftSuffix}
    </span>
  )
}

/** One column header, with the alignment the design system's tables keep. */
export function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}
