/**
 * The customer's own money — `02-architecture.md` §9's `account/payments.html`.
 *
 * The account panel has no permission primitive (`09-security.md` §7): a customer's
 * scope is their own `customerId`, which the session resolved, and the module's read is
 * scoped by it in the `where`. The page renders the two halves of the ledger — the
 * receipts, newest first, and the balance they sum to — and the balance is computed by
 * the module from the rows the page is showing, so the number and the list cannot
 * disagree.
 *
 * ## Why a refund renders as a negative amount
 *
 * `03-data-model.md` §4.1 makes `Σ amount` the paid side of the balance, and a `REFUND`
 * row carries a negative `amount` so the one subtraction serves both directions. The
 * history renders it through `formatMoney`, which shows the sign, and the kind's own
 * label says what it is.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { dateToLocalDate, formatDate, formatMoney } from '@/core/localization'

import { PAYMENTS_PAGE } from '@/app/catalog'
import { customerLedger, PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/payments'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: PAYMENTS_PAGE.title }

/**
 * «پرداخت‌های من» — the customer's receipts and the balance they leave.
 */
export default async function AccountPaymentsPage() {
  const session = await requireCustomerPanel()

  const { balance, paid } = await runInTenantScope(session.permissions, prisma(), (tx) =>
    customerLedger({ tx, tenantId: session.tenantId, customerId: session.customerId }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{PAYMENTS_PAGE.title}</h1>
        <p className="text-sm text-ink-2">{PAYMENTS_PAGE.lead}</p>
      </div>

      <BalanceSummary
        charged={balance.charged}
        discount={balance.discount}
        paid={balance.paid}
        balance={balance.balance}
      />

      {paid.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {PAYMENTS_PAGE.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{PAYMENTS_PAGE.title}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3">
                <Th>{PAYMENTS_PAGE.columns.date}</Th>
                <Th>{PAYMENTS_PAGE.columns.kind}</Th>
                <Th>{PAYMENTS_PAGE.columns.method}</Th>
                <Th className="text-end">{PAYMENTS_PAGE.columns.discount}</Th>
                <Th className="text-end">{PAYMENTS_PAGE.columns.amount}</Th>
                <Th>{PAYMENTS_PAGE.columns.note}</Th>
              </tr>
            </thead>
            <tbody>
              {paid.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 tabular-nums text-ink-2">
                    {formatDate(dateToLocalDate(row.paidAt), 'short')}
                  </td>
                  <td className="px-4 py-3 text-ink">{PAYMENT_KIND_LABELS[row.kind]}</td>
                  <td className="px-4 py-3 text-ink-2">{PAYMENT_METHOD_LABELS[row.method]}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-2">
                    {row.discountAmount > 0n ? formatMoney(row.discountAmount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold tabular-nums text-ink">
                    {formatMoney(row.amount)}
                  </td>
                  <td className="px-4 py-3 text-ink-3">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * The three terms and the balance they produce — the summary the customer reads first.
 *
 * The balance is the same number the module computed for this customer, and the four
 * cells are the formula's own four terms so a customer reading across the row can see
 * what the balance is made of.
 */
function BalanceSummary({
  charged,
  discount,
  paid,
  balance,
}: {
  readonly charged: bigint
  readonly discount: bigint
  readonly paid: bigint
  readonly balance: bigint
}) {
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      <SummaryCell label={PAYMENTS_PAGE.summary.charged} value={formatMoney(charged)} />
      <SummaryCell label={PAYMENTS_PAGE.summary.discount} value={formatMoney(discount)} />
      <SummaryCell label={PAYMENTS_PAGE.summary.paid} value={formatMoney(paid)} />
      <SummaryCell
        label={PAYMENTS_PAGE.summary.balance}
        value={balance > 0n ? formatMoney(balance) : PAYMENTS_PAGE.summary.settled}
        emphasis={balance > 0n}
      />
    </div>
  )
}

/** One term of the summary, as the cell the customer reads. */
function SummaryCell({
  label,
  value,
  emphasis,
}: {
  readonly label: string
  readonly value: string
  readonly emphasis?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4">
      <span className="text-xs font-semibold text-ink-3">{label}</span>
      <span
        className={
          emphasis === true
            ? 'text-lg font-bold tabular-nums text-danger'
            : 'text-lg font-bold tabular-nums text-ink'
        }
      >
        {value}
      </span>
    </div>
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
      className={`whitespace-nowrap px-4 py-3 text-start text-xs font-semibold ${className ?? ''}`}
    >
      {children}
    </th>
  )
}
