/**
 * The customer file's two shared pieces — its search field and its table — as the
 * three customer surfaces render them.
 *
 * The three pages (`reception/customers`, `admin/customers`, `doctor/customers`) are
 * one file read through three permissions, which is why the table is one component
 * and the three pages differ only in the copy block they hand it and the scope they
 * read under. A fourth table would be a fourth place the file's columns are decided.
 *
 * ## Why the search is a GET form and not a state
 *
 * The search is the page's own question and the URL is its memory: `/admin/customers`
 * with a `q` param is a bookmark, a back button and a shareable link, and none of the
 * three needs a client bundle to hold it. The form is a plain `<form>` with no
 * `action`, so it submits to the route it is on and the page reads the param back —
 * the same shape `admin/appointments`'s filter bar takes.
 *
 * ## Why the profile link is a prop and not a fact the table knows
 *
 * `02-architecture.md` §9 puts the profile (`admin/customer.html`) in the manager
 * panel, and the desk and the doctor cannot open it — their panels send them
 * elsewhere. A table that built the link itself would build a link two of its three
 * callers cannot follow, so the caller that can names the base path and the two that
 * cannot pass nothing and render a plain name.
 */

import Link from 'next/link'

import { CUSTOMERS_PAGE } from '@/app/catalog'
import {
  CUSTOMER_LIFECYCLE_LABELS,
  LEAD_STATUS_LABELS,
} from '@/modules/customers'
import type { CustomerListRow } from '@/modules/customers'
import {
  dateToLocalDate,
  formatDate,
  formatPhone,
  toPersianDigits,
} from '@/core/localization'
import { CustomerLifecycle, LeadStatus, isMember } from '@/core/constants'
import { cx } from '@/core/lib'

import { Icon } from '@/core/components/icons'

/** The table's own props: the rows, the doctor names, and the profile route or none. */
export interface CustomersTableProps {
  readonly rows: readonly CustomerListRow[]
  /** The names the `primaryDoctorId` column renders, keyed by membership id. */
  readonly doctorNames: Readonly<Record<string, string>>
  /**
   * The route the name cell links to, without the id — `/admin/customer` — or
   * `undefined` when the caller's panel cannot open the profile.
   */
  readonly profileBasePath?: string
  /** Whether the desk's «ثبت نوبت» action belongs on the row. */
  readonly showBookAction?: boolean
  /** The sentence for a table with no rows, from the caller's own copy block. */
  readonly emptyMessage: string
}

/** The file, as the three pages render it. */
export function CustomersTable({
  rows,
  doctorNames,
  profileBasePath,
  showBookAction,
  emptyMessage,
}: CustomersTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{CUSTOMERS_PAGE.reception.title}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-ink-3">
            <Th>{CUSTOMERS_PAGE.columns.name}</Th>
            <Th>{CUSTOMERS_PAGE.columns.mobile}</Th>
            <Th>{CUSTOMERS_PAGE.columns.lifecycle}</Th>
            <Th>{CUSTOMERS_PAGE.columns.leadStatus}</Th>
            <Th>{CUSTOMERS_PAGE.columns.primaryDoctor}</Th>
            <Th>{CUSTOMERS_PAGE.columns.lastVisit}</Th>
            <Th className="text-end">{CUSTOMERS_PAGE.columns.sessions}</Th>
            {showBookAction ? <Th>{CUSTOMERS_PAGE.columns.actions}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CustomerRow
              key={row.id}
              row={row}
              doctorNames={doctorNames}
              profileBasePath={profileBasePath}
              showBookAction={showBookAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One customer, as the file renders it. */
function CustomerRow({
  row,
  doctorNames,
  profileBasePath,
  showBookAction,
}: {
  readonly row: CustomerListRow
  readonly doctorNames: Readonly<Record<string, string>>
  readonly profileBasePath?: string
  readonly showBookAction?: boolean
}) {
  const name = row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
  const doctorName = row.primaryDoctorId === null ? null : (doctorNames[row.primaryDoctorId] ?? null)

  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3 font-semibold text-ink">
        {profileBasePath === undefined ? (
          name
        ) : (
          <Link
            href={`${profileBasePath}/${row.id}`}
            className="text-brand-700 underline-offset-2 hover:underline"
          >
            {name}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
        {formatPhone(row.mobile)}
      </td>
      <td className="px-4 py-3">
        <LifecycleBadge lifecycle={row.lifecycle} />
      </td>
      <td className="px-4 py-3 text-ink-2">
        {row.leadStatus === null ? (
          '—'
        ) : (
          <LeadStatusBadge status={row.leadStatus} />
        )}
      </td>
      <td className="px-4 py-3 text-ink-2">{doctorName ?? '—'}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        {row.lastVisitAt === null ? '—' : formatDate(dateToLocalDate(row.lastVisitAt), 'short')}
      </td>
      <td className="px-4 py-3 text-end font-semibold text-ink tabular-nums">
        {toPersianDigits(row.completedSessions)}
      </td>
      {showBookAction ? (
        <td className="px-4 py-3">
          <Link
            href="/reception/appointments"
            className="inline-flex items-center gap-1 text-brand-700 underline-offset-2 hover:underline"
          >
            <Icon name="appointment" size="compact" />
            {CUSTOMERS_PAGE.actions.book}
          </Link>
        </td>
      ) : null}
    </tr>
  )
}

/** The file's two badges, as the two enumerations the module owns render them. */
function LifecycleBadge({ lifecycle }: { readonly lifecycle: string }) {
  if (!isMember(CustomerLifecycle, lifecycle)) {
    // A lifecycle the catalog does not hold is a row the demo does not write; the
    // raw code is not Persian copy, so the dash is what the column renders.
    return <span className="text-ink-3">—</span>
  }
  const isCustomer = lifecycle === CustomerLifecycle.Customer
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        isCustomer ? 'bg-ok-bg text-ok' : 'bg-neutral-bg text-ink-2',
      )}
    >
      {CUSTOMER_LIFECYCLE_LABELS[lifecycle]}
    </span>
  )
}

/** One of the cartable's four states, as a chip the file's column renders. */
function LeadStatusBadge({ status }: { readonly status: string }) {
  if (!isMember(LeadStatus, status)) return <span className="text-ink-3">—</span>
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        status === LeadStatus.Converted ? 'bg-ok-bg text-ok' : 'bg-surface-sunken text-ink-2',
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}

/** One column header, with the alignment the design system's tables keep. */
function Th({
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
