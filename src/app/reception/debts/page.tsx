/**
 * The desk's debt list — `02-architecture.md` §9's `reception/debts.html`.
 *
 * The secretary's default holds `view_debts` and `follow_up_debt`
 * (`04-roles-permissions.md` §2.1's 1–12), and the list the desk reads is the product's
 * follow-up queue: the appointments whose balance is open, stacked by how late they are.
 * The balance is computed by the read and never stored, so the list a receptionist opens
 * is the list the ledger just made — and the one a receipt empties in the request that
 * recorded it.
 *
 * ## What the desk does from here
 *
 * The three writes the row offers: record a payment, record a follow-up with a day to try
 * again, or move the due date a customer promised. The manager's page offers none, and
 * the doctor's is the doctor's own.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'

import { DEBTS_PAGE } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import { contactList } from '@/modules/debts'
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/payments'
import { requireStaffPanel } from '@/app/_shell/session'

import { DebtsKpi } from './_components/debts-kpi'

export const metadata: Metadata = { title: DEBTS_PAGE.reception.title }

/**
 * «ثبت پرداخت»'s two closed lists, labelled from the module that owns them.
 *
 * Built here, on the server, because the `payments` barrel is a server-only surface —
 * it writes receipts — and the two labels are the only thing the client form needs from
 * it. Reading them here and handing them down keeps the writer's graph out of the
 * browser bundle, and keeps the two sets spelled in the one place the receipt's own
 * catalog spells them.
 */
const PAYMENT_OPTIONS = {
  method: [
    { value: 'CASH', label: PAYMENT_METHOD_LABELS.CASH },
    { value: 'CARD', label: PAYMENT_METHOD_LABELS.CARD },
    { value: 'ONLINE', label: PAYMENT_METHOD_LABELS.ONLINE },
  ],
  kind: [
    { value: 'PARTIAL', label: PAYMENT_KIND_LABELS.PARTIAL },
    { value: 'FINAL', label: PAYMENT_KIND_LABELS.FINAL },
  ],
} as const

/**
 * «بدهکاران» — the debts the desk owes a call about, worst first.
 */
export default async function ReceptionDebtsPage() {
  const session = await requireStaffPanel('reception')

  const buckets = await runInTenantScope(session.permissions, prisma(), (tx) =>
    contactList({ tx, ctx: session.permissions, now: realClock() }),
  )

  // The KPI figures are summed from the real buckets, so a tile cannot disagree with the
  // tables below: overdue is the three past-due buckets, due-soon is its own.
  const sum = (rows: readonly { balance: bigint }[]) => rows.reduce((total, row) => total + row.balance, 0n)
  const overdueRial = sum(buckets.overdue30) + sum(buckets.overdue7) + sum(buckets.overdue)
  const dueSoonRial = sum(buckets.dueSoon)
  const debtors =
    buckets.overdue30.length + buckets.overdue7.length + buckets.overdue.length + buckets.dueSoon.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.reception.lead}</p>
      </div>

      <DebtsKpi
        totalRial={overdueRial + dueSoonRial}
        overdueRial={overdueRial}
        dueSoonRial={dueSoonRial}
        debtors={debtors}
      />

      <DebtsTable buckets={buckets} showActions paymentOptions={PAYMENT_OPTIONS} />
    </div>
  )
}
