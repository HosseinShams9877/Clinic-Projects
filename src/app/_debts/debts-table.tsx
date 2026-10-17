// src/app/_debts/debts-table.tsx

/**
 * The debt surfaces' shared table — the one row the three staff pages render.
 */

import { DEBTS_PAGE } from '@/app/catalog'
import {
  dateToLocalDate,
  asLocalDate,
  formatDate,
  formatMoney,
  formatNumber,
  formatPhone,
} from '@/core/localization'
import type { DebtRow } from '@/modules/debts'
import { cx } from '@/core/lib'

import { DebtRowActions, type PaymentOptions } from './debts-forms'

type FollowUpRecord = {
  readonly id: string
  readonly note: string | null
  readonly createdAt: Date
  readonly createdBy: { readonly firstName: string; readonly lastName: string | null } | null
}

export interface DebtsTableProps {
  readonly rows: readonly DebtRow[]
  readonly showActions?: boolean
  readonly paymentOptions?: PaymentOptions
  readonly followUpsMap?: Readonly<Record<string, readonly FollowUpRecord[]>>
}

export function DebtsTable({
  rows,
  showActions,
  paymentOptions,
  followUpsMap = {},
}: DebtsTableProps) {
  return (
    <BucketTable
      rows={rows}
      showActions={showActions}
      paymentOptions={paymentOptions}
      followUpsMap={followUpsMap}
    />
  )
}

function BucketTable({
  rows,
  showActions,
  paymentOptions,
  followUpsMap,
}: {
  readonly rows: readonly DebtRow[]
  readonly showActions?: boolean
  readonly paymentOptions?: PaymentOptions
  readonly followUpsMap: Readonly<Record<string, readonly FollowUpRecord[]>>
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
            <Th>{DEBTS_PAGE.filter.doctor}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.charged}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.discount}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.paid}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.balance}</Th>
            <Th>{DEBTS_PAGE.columns.dueDate}</Th>
            <Th className="text-end">{DEBTS_PAGE.columns.daysOverdue}</Th>
            <Th>{DEBTS_PAGE.columns.lastFollowUp}</Th>
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
              followUps={followUpsMap[row.appointmentId] ?? []}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DebtRowMarkup({
  row,
  showActions,
  paymentOptions,
  followUps,
}: {
  readonly row: DebtRow
  readonly showActions?: boolean
  readonly paymentOptions?: PaymentOptions
  readonly followUps: readonly FollowUpRecord[]
}) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3 font-semibold text-ink">{customerName(row)}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
        {formatPhone(row.customerMobile)}
      </td>
      <td className="px-4 py-3 text-ink-2">{row.doctorName}</td>
      <td className="px-4 py-3 text-end tabular-nums">{formatMoney(row.charged)}</td>
      <td className="px-4 py-3 text-end tabular-nums text-ink-2">{formatMoney(row.discount)}</td>
      <td className="px-4 py-3 text-end tabular-nums">{formatMoney(row.paid)}</td>
      <td className="px-4 py-3 text-end font-semibold tabular-nums text-danger">
        {formatMoney(row.balance)}
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-2">
        {formatDate(asLocalDate(row.dueLocalDate), 'short')}
      </td>
      <td className="px-4 py-3 text-end tabular-nums text-ink-2">
        {row.daysOverdue > 0
          ? `${formatNumber(row.daysOverdue)} ${DEBTS_PAGE.days}`
          : DEBTS_PAGE.dash}
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-2">
        {row.lastFollowUp === null
          ? DEBTS_PAGE.dash
          : formatDate(dateToLocalDate(row.lastFollowUp.at), 'short')}
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-2">
        {row.nextContactAt === null
          ? DEBTS_PAGE.dash
          : formatDate(dateToLocalDate(row.nextContactAt), 'short')}
      </td>
      {showActions && paymentOptions !== undefined ? (
        <td className="px-4 py-3">
          <DebtRowActions
            row={row}
            options={paymentOptions}
            followUps={followUps}
          />
        </td>
      ) : null}
    </tr>
  )
}

function customerName(row: DebtRow): string {
  return row.customerLastName === null
    ? row.customerFirstName
    : `${row.customerFirstName} ${row.customerLastName}`
}

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