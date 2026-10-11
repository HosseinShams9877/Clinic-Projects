/**
 * The customer's own sessions — `02-architecture.md` §9's `account/appointments.html`.
 *
 * The demo renders each session as a card — a date chip, the service and its
 * doctor·time line, a status badge with the deposit note, and the actions the row
 * still owns — split into upcoming and past. The scope is the session's `customerId`
 * in the module's `where` (`09-security.md` §7); the id comes from the resolution and
 * from no request parameter.
 *
 * ## Why the actions are a client island and the rows are not
 *
 * The rows are a read and the actions are a write (`02-architecture.md` §6). The page
 * renders the cards server-side from the one scoped read and hands each upcoming card
 * its own island, which holds the pending state and the Persian sentence a refused
 * write returns. A past card carries only a rebook link.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import {
  asLocalDate,
  asLocalTime,
  formatMoney,
  formatTime,
  jalaliParts,
  monthName,
  toPersianDigits,
} from '@/core/localization'
import {
  APPOINTMENT_STATUS_LABELS,
  CUSTOMER_APPOINTMENTS_PAGE,
  customerAppointments,
  type OwnAppointmentRow,
} from '@/modules/appointments'
import { realClock } from '@/core/lib/clock'

import { ACCOUNT_APPOINTMENTS } from '@/app/account/catalog'
import { OwnAppointmentActions } from '@/app/_account/appointment-actions'
import { dateToLocalDate } from '@/core/localization'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_APPOINTMENTS_PAGE.title }

export default async function AccountAppointmentsPage() {
  const session = await requireCustomerPanel()
  const now = realClock()

  const { upcoming, past } = await runInTenantScope(session.permissions, prisma(), (tx) =>
    customerAppointments({ tx, tenantId: session.tenantId, customerId: session.customerId, now }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{CUSTOMER_APPOINTMENTS_PAGE.title}</h1>
          <p className="text-sm text-ink-2 tabular-nums">
            {ACCOUNT_APPOINTMENTS.countSub(toPersianDigits(upcoming.length), toPersianDigits(past.length))}
          </p>
        </div>
        <Link
          href="/booking"
          className="inline-flex items-center gap-2 rounded-sm bg-brand-btn px-[18px] py-[10px] text-sm font-semibold text-ink-inverse no-underline shadow-brand hover:bg-brand-600"
        >
          <Icon name="add" size="compact" />
          {ACCOUNT_APPOINTMENTS.book}
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{CUSTOMER_APPOINTMENTS_PAGE.upcoming.title}</h2>
        {upcoming.length === 0 ? (
          <EmptyRow label={CUSTOMER_APPOINTMENTS_PAGE.upcoming.empty} />
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.map((row) => (
              <ApptCard key={row.id} row={row} now={now} actionable />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{CUSTOMER_APPOINTMENTS_PAGE.past.title}</h2>
        {past.length === 0 ? (
          <EmptyRow label={CUSTOMER_APPOINTMENTS_PAGE.past.empty} />
        ) : (
          <div className="flex flex-col gap-3">
            {past.map((row) => (
              <ApptCard key={row.id} row={row} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ── One session, as the demo's card ──────────────────────────────────────────── */

function ApptCard({
  row,
  now,
  actionable,
}: {
  readonly row: OwnAppointmentRow
  readonly now: Date
  readonly actionable?: boolean
}) {
  const day = asLocalDate(row.localDate)
  const parts = jalaliParts(day)
  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4',
        actionable ? '' : 'opacity-90',
      )}
    >
      <div className="grid size-14 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
        <span className="text-lg font-bold tabular-nums leading-none">{toPersianDigits(parts.day)}</span>
        <span className="text-[11px]">{monthName(parts.month)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold text-ink">{row.serviceName ?? '—'}</span>
        <span className="text-sm text-ink-3">
          {row.doctorName === null ? '' : `${row.doctorName} · `}
          <span className="tabular-nums">{`${ACCOUNT_APPOINTMENTS.at} ${formatTime(timeOf(row.localTime))}`}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          <span className="text-xs text-ink-3 tabular-nums">
            {row.depositAmount > 0n
              ? `${ACCOUNT_APPOINTMENTS.deposit} ${formatMoney(row.depositAmount)}`
              : ACCOUNT_APPOINTMENTS.noDeposit}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {actionable ? (
          <OwnAppointmentActions appointmentId={row.id} status={row.status} currentLocalDate={dateToLocalDate(now)} />
        ) : (
          <Link
            href="/booking"
            className="inline-flex items-center rounded-sm border border-line-2 bg-surface px-3 py-[6px] text-xs font-semibold text-ink-2 no-underline hover:bg-surface-2"
          >
            {ACCOUNT_APPOINTMENTS.rebook}
          </Link>
        )}
      </div>
    </div>
  )
}

/** The status, as the catalog's own label on a tone the state picks. */
function StatusBadge({ status }: { readonly status: string }) {
  const label =
    status in APPOINTMENT_STATUS_LABELS
      ? APPOINTMENT_STATUS_LABELS[status as keyof typeof APPOINTMENT_STATUS_LABELS]
      : status
  const tone =
    status === 'COMPLETED'
      ? 'bg-ok-bg text-ok'
      : status === 'CANCELLED' || status === 'NO_SHOW' || status === 'RESCHEDULED'
        ? 'bg-neutral-bg text-ink-3'
        : 'bg-info-bg text-info'
  return <span className={cx('inline-flex rounded-pill px-2 py-[2px] text-xs font-semibold', tone)}>{label}</span>
}

/** The empty state the two sections share. */
function EmptyRow({ label }: { readonly label: string }) {
  return <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">{label}</p>
}

/** A stored `HH:mm` as the branded `LocalTime` the formatter takes. */
function timeOf(value: string): ReturnType<typeof asLocalTime> {
  return asLocalTime(value)
}
