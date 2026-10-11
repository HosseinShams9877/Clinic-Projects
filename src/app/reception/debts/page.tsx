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
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { fromUtcInstant } from '@/core/localization'
import { cx } from '@/core/lib'
import { DebtBucket } from '@/core/constants'

import { DEBTS_PAGE, RECEPTION_DEBTS } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import { contactList, readDebtSettings, DEBT_BUCKET_LABELS, DEBT_BUCKET_ORDER } from '@/modules/debts'
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
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

/** The page's own route, as the bucket chips link back to. */
const BASE_PATH = '/reception/debts'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/** Whole days between two `LocalDate` strings (proleptic Gregorian ISO). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

/**
 * «مانده حساب» — the debts the desk owes a call about, as a KPI row, a bucket chip
 * filter, and one flat table.
 */
export default async function ReceptionDebtsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const now = realClock()
  const bucketParam = asString((await searchParams).bucket)

  const { buckets, collectedRial, offset } = await runInTenantScope(
    session.permissions,
    prisma(),
    async (tx) => {
      const settings = await readDebtSettings(tx, session.tenantId)
      const [buckets, collectedRial] = await Promise.all([
        contactList({ tx, ctx: session.permissions, now }),
        paymentsThisMonth(tx, session.tenantId, now, settings.utcOffsetMinutes),
      ])
      return { buckets, collectedRial, offset: settings.utcOffsetMinutes }
    },
  )

  const byBucket: Readonly<Record<string, readonly (typeof buckets.overdue)[number][]>> = {
    [DebtBucket.Over30Days]: [...buckets.overdue30],
    [DebtBucket.Over7Days]: [...buckets.overdue7],
    [DebtBucket.PastDue]: [...buckets.overdue],
    [DebtBucket.DueSoon]: [...buckets.dueSoon],
  }
  const allRows = DEBT_BUCKET_ORDER.flatMap((bucket) => byBucket[bucket] ?? [])
  const visible = bucketParam in byBucket ? (byBucket[bucketParam] ?? allRows) : allRows

  // KPI from the real rows: collected this month (payments aggregate), average delay
  // across past-due rows, the past-due count, and the total outstanding balance.
  const pastDue = [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue]
  const totalRial = allRows.reduce((total, row) => total + row.balance, 0n)
  const today = fromUtcInstant(now, offset).localDate
  const delays = pastDue.map((row) => daysBetween(row.dueLocalDate, today)).filter((d) => d > 0)
  const avgDelayDays = delays.length === 0 ? 0 : Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)

  const page = pageFromParam((await searchParams).page)
  const { slice, totalPages } = paginate(visible, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (bucketParam in DEBT_BUCKET_LABELS) sp.set('bucket', bucketParam)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.reception.lead}</p>
      </div>

      <DebtsKpi
        collectedRial={collectedRial}
        avgDelayDays={avgDelayDays}
        overdueCount={pastDue.length}
        totalRial={totalRial}
      />

      <BucketChips active={bucketParam} />

      <DebtsTable rows={slice} showActions paymentOptions={PAYMENT_OPTIONS} />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

/** The bucket chip filter — «همه» plus the four severities, as `?bucket=` links. */
function BucketChips({ active }: { readonly active: string }) {
  const chips: readonly { key: string; label: string }[] = [
    { key: 'all', label: RECEPTION_DEBTS.filterAll },
    ...DEBT_BUCKET_ORDER.map((bucket) => ({ key: bucket, label: DEBT_BUCKET_LABELS[bucket] })),
  ]
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const isActive = chip.key === active || (chip.key === 'all' && !(active in DEBT_BUCKET_LABELS))
        return (
          <Link
            key={chip.key}
            href={chip.key === 'all' ? BASE_PATH : `${BASE_PATH}?bucket=${chip.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {chip.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
