/**
 * The customer's own sessions — `02-architecture.md` §9's `account/appointments.html`.
 *
 * The two halves the list splits into, and the two actions a row still owned by the
 * person carries. The scope is the session's `customerId` in the module's `where`
 * (`09-security.md` §7); there is no `customerId` on this page's request, because
 * there is no such parameter to read, and the id comes from the resolution.
 *
 * ## Why the actions are a client island and the rows are not
 *
 * The rows are a read and the actions are a write, and `02-architecture.md` §6 makes
 * those two components. The page renders the rows server-side from the one scoped
 * read, and hands each row its own island, which is the component that can hold a
 * pending state and the Persian sentence a refused write sends back.
 *
 * ## Why a past row renders nothing where an upcoming row renders two buttons
 *
 * The state machine owns that question, and the island asks it rather than the page —
 * a cancelled or completed session is a row the module will not move, so the row shows
 * its status and nothing else. The page does not filter the actions itself for the
 * same reason the module does not expose a "may I" primitive: the answer is a fact
 * about the row, and the row's own status is the fact.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { dateToLocalDate, formatDate, toPersianDigits } from '@/core/localization'
import {
  APPOINTMENT_STATUS_LABELS,
  CUSTOMER_APPOINTMENTS_PAGE,
  customerAppointments,
  type OwnAppointmentRow,
} from '@/modules/appointments'
import { realClock } from '@/core/lib/clock'

import { OwnAppointmentActions } from '@/app/_account/appointment-actions'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_APPOINTMENTS_PAGE.title }

/**
 * «نوبت‌های من» — the person's upcoming and past sessions.
 */
export default async function AccountAppointmentsPage() {
  const session = await requireCustomerPanel()
  const now = realClock()

  const { upcoming, past } = await runInTenantScope(session.permissions, prisma(), (tx) =>
    customerAppointments({ tx, tenantId: session.tenantId, customerId: session.customerId, now }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMER_APPOINTMENTS_PAGE.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMER_APPOINTMENTS_PAGE.lead}</p>
      </div>

      <AppointmentList
        title={CUSTOMER_APPOINTMENTS_PAGE.upcoming.title}
        empty={CUSTOMER_APPOINTMENTS_PAGE.upcoming.empty}
        rows={upcoming}
        now={now}
        actionable
      />

      <AppointmentList
        title={CUSTOMER_APPOINTMENTS_PAGE.past.title}
        empty={CUSTOMER_APPOINTMENTS_PAGE.past.empty}
        rows={past}
        now={now}
      />
    </div>
  )
}

/** One half of the list, as a table the person reads across. */
function AppointmentList({
  title,
  empty,
  rows,
  now,
  actionable,
}: {
  readonly title: string
  readonly empty: string
  readonly rows: readonly OwnAppointmentRow[]
  readonly now: Date
  /** Whether the rows in this half may still carry the customer's two actions. */
  readonly actionable?: boolean
}) {
  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {empty}
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-ink-3">
              <Th>{CUSTOMER_APPOINTMENTS_PAGE.columns.date}</Th>
              <Th>{CUSTOMER_APPOINTMENTS_PAGE.columns.time}</Th>
              <Th>{CUSTOMER_APPOINTMENTS_PAGE.columns.service}</Th>
              <Th>{CUSTOMER_APPOINTMENTS_PAGE.columns.doctor}</Th>
              <Th>{CUSTOMER_APPOINTMENTS_PAGE.columns.status}</Th>
              {actionable ? <Th>{CUSTOMER_APPOINTMENTS_PAGE.actions.cancel}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-surface-2">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ink-2">
                  {formatDate(dateToLocalDate(row.scheduledAt), 'short')}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ink-2">
                  {toPersianDigits(row.localTime)}
                </td>
                <td className="px-4 py-3 text-ink">{row.serviceName ?? '—'}</td>
                <td className="px-4 py-3 text-ink-2">{row.doctorName ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                  {asStatusLabel(row.status)}
                </td>
                {actionable ? (
                  <td className="px-4 py-3">
                    <OwnAppointmentActions
                      appointmentId={row.id}
                      status={row.status}
                      currentLocalDate={dateToLocalDate(now)}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** The status as the catalog's own label, and the deposit the person paid for it. */
function asStatusLabel(status: string): React.ReactNode {
  if (status in APPOINTMENT_STATUS_LABELS) {
    return APPOINTMENT_STATUS_LABELS[status as keyof typeof APPOINTMENT_STATUS_LABELS]
  }
  return status
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
