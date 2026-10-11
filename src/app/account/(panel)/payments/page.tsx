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
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { dateToLocalDate, formatDate, formatMoney, formatNumber } from '@/core/localization'

import { PAYMENTS_PAGE } from '@/app/catalog'
import { ACCOUNT_PAYMENTS } from '@/app/account/catalog'
import { customerLedger, PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/payments'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: PAYMENTS_PAGE.title }

/**
 * «پرداخت‌های من» — the customer's receipts, the three KPI tiles the demo leads with,
 * and the transaction history.
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
        <p className="text-sm text-ink-2">{ACCOUNT_PAYMENTS.lead}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
        <Kpi label={ACCOUNT_PAYMENTS.totalPaid} value={formatMoney(balance.paid, { unit: false })} sub={ACCOUNT_PAYMENTS.toman} icon="success" tone="bg-ok-bg text-ok" />
        <Kpi label={ACCOUNT_PAYMENTS.balance} value={balance.balance > 0n ? formatMoney(balance.balance, { unit: false }) : formatNumber(0)} sub={ACCOUNT_PAYMENTS.toman} icon="debt" tone="bg-warn-bg text-warn" />
        <Kpi label={ACCOUNT_PAYMENTS.count} value={formatNumber(paid.length)} icon="payment" tone="bg-info-bg text-info" />
      </div>

      <section className="flex flex-col rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{ACCOUNT_PAYMENTS.historyTitle}</h2>
        </div>
        {paid.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">{PAYMENTS_PAGE.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{ACCOUNT_PAYMENTS.historyTitle}</caption>
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
                  <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-surface-2">
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
      </section>
    </div>
  )
}

/** One KPI tile, as the demo's payments header leads with. */
function Kpi({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly sub?: string
  readonly icon: IconName
  readonly tone: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tone)}>
        <Icon name={icon} size="card" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="truncate text-lg font-bold text-ink tabular-nums">{value}</span>
        {sub === undefined ? null : <span className="truncate text-xs text-ink-3">{sub}</span>}
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
