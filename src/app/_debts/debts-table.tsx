/**
 * The debt surfaces' shared table — the one row the three staff pages render.
 *
 * The three pages (`reception/debts`, `admin/debts`, `doctor/debts`) are one row read
 * through three permissions, which is why the table is one component and the three
 * pages differ only in the copy block they hand it and the writes they offer. The
 * customer's own history is a fourth surface and renders a different row, because a
 * customer does not see the desk's follow-up columns.
 *
 * ## Why the money is not summed again here
 *
 * `charged`, `discount`, `paid` and `balance` are the module's own terms and the row
 * carries them; the page formats each through `formatMoney` and never re-derives the
 * balance from the three. A second arithmetic would be a second place the formula could
 * disagree with `03-data-model.md` §4.1.
 *
 * ## Why the four lists are stacked and not paged
 *
 * The buckets are four severities and the desk reads the worst first, so the page
 * stacks the four lists in `DEBT_BUCKET_ORDER` and each one's empty state is its own
 * sentence. A page of 20 rows sorted by date would put the row the desk loses the most
 * by not calling at the bottom.
 */

import { DEBTS_PAGE } from '@/app/catalog'
import { DebtBucket } from '@/core/constants'
import {
  dateToLocalDate,
  asLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
} from '@/core/localization'
import { DEBT_BUCKET_LABELS, DEBT_BUCKET_ORDER } from '@/modules/debts'
import type { DebtBuckets, DebtRow } from '@/modules/debts'
import { cx } from '@/core/lib'

import { DebtRowActions, type PaymentOptions } from './debts-forms'

/**
 * The table's own props: the four buckets, the writes the caller's panel may offer, and
 * the two closed lists the payment form renders when it does.
 *
 * The options travel with `showActions` because they are the form's: a page that renders
 * the desk's actions without them renders a form whose two selects have nothing to show,
 * so the cell is only drawn when both are present.
 */
export interface DebtsTableProps {
  readonly buckets: DebtBuckets
  /** Whether the desk's three row actions belong on the table. */
  readonly showActions?: boolean
  /** The payment form's two closed lists, which only the desk's table renders. */
  readonly paymentOptions?: PaymentOptions
}

/**
 * The four buckets, as the three pages render them.
 *
 * The bucket a list holds is the list's own heading, and the heading is the module's
 * label for the bucket — the four names are the four the document names, and a fifth
 * list would need a fifth bucket the module does not have.
 */
export function DebtsTable({ buckets, showActions, paymentOptions }: DebtsTableProps) {
  const lists: Readonly<Record<DebtBucket, readonly DebtRow[]>> = {
    [DebtBucket.Over30Days]: buckets.overdue30,
    [DebtBucket.Over7Days]: buckets.overdue7,
    [DebtBucket.PastDue]: buckets.overdue,
    [DebtBucket.DueSoon]: buckets.dueSoon,
  }

  return (
    <div className="flex flex-col gap-8">
      {DEBT_BUCKET_ORDER.map((bucket) => (
        <section key={bucket} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <BucketBadge bucket={bucket} />
            {DEBT_BUCKET_LABELS[bucket]}
            <span className="text-sm font-normal text-ink-3">({lists[bucket].length})</span>
          </h2>
          <BucketTable
            rows={lists[bucket]}
            showActions={showActions}
            paymentOptions={paymentOptions}
          />
        </section>
      ))}
    </div>
  )
}

/** One bucket's rows, or its own empty sentence when there are none. */
function BucketTable({
  rows,
  showActions,
  paymentOptions,
}: {
  readonly rows: readonly DebtRow[]
  readonly showActions?: boolean
  readonly paymentOptions?: PaymentOptions
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-ink-3">
        {DEBTS_PAGE.buckets.empty}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{DEBTS_PAGE.reception.title}</caption>
        <thead>
          <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
            <Th>{DEBTS_PAGE.columns.customer}</Th>
            <Th>{DEBTS_PAGE.columns.mobile}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.charged}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.discount}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.paid}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.balance}</Th>
            <Th>{DEBTS_PAGE.columns.dueDate}</Th>
            <Th>{DEBTS_PAGE.columns.followUp}</Th>
            <Th>{DEBTS_PAGE.columns.nextContact}</Th>
            {showActions ? <Th>{DEBTS_PAGE.columns.actions}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <DebtRowMarkup
              key={row.appointmentId}
              row={row}
              showActions={showActions}
              paymentOptions={paymentOptions}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One debt, as the table renders it. */
function DebtRowMarkup({
  row,
  showActions,
  paymentOptions,
}: {
  readonly row: DebtRow
  readonly showActions?: boolean
  readonly paymentOptions?: PaymentOptions
}) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3 font-semibold text-ink">{customerName(row)}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
        {formatPhone(row.customerMobile)}
      </td>
      <td className="px-4 py-3 text-end tabular-nums">{formatMoney(row.charged)}</td>
      <td className="px-4 py-3 text-end tabular-nums text-ink-2">{formatMoney(row.discount)}</td>
      <td className="px-4 py-3 text-end tabular-nums">{formatMoney(row.paid)}</td>
      <td className="px-4 py-3 text-end font-semibold tabular-nums text-danger">
        {formatMoney(row.balance)}
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-2">
        {formatDate(asLocalDate(row.dueLocalDate), 'short')}
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-2">
        {row.debtFollowUpAt === null
          ? '—'
          : formatDate(dateToLocalDate(row.debtFollowUpAt), 'short')}
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-2">
        {row.debtNextContactAt === null
          ? '—'
          : formatDate(dateToLocalDate(row.debtNextContactAt), 'short')}
      </td>
      {showActions && paymentOptions !== undefined ? (
        <td className="px-4 py-3">
          <DebtRowActions row={row} options={paymentOptions} />
        </td>
      ) : null}
    </tr>
  )
}

/** The customer's name, with the last name only when the row carries one. */
function customerName(row: DebtRow): string {
  return row.customerLastName === null
    ? row.customerFirstName
    : `${row.customerFirstName} ${row.customerLastName}`
}

/** One bucket, as the severity chip the heading renders. */
function BucketBadge({ bucket }: { readonly bucket: DebtBucket }) {
  return (
    <span
      className={cx(
        'inline-flex size-2 rounded-pill',
        bucket === DebtBucket.Over30Days
          ? 'bg-danger'
          : bucket === DebtBucket.Over7Days
            ? 'bg-brand-500'
            : bucket === DebtBucket.PastDue
              ? 'bg-warning'
              : 'bg-ink-3',
      )}
      aria-hidden="true"
    />
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
