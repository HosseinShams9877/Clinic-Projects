/**
 * The secretary's work list — `02-architecture.md` §9's `reception/desk.html`, and
 * the one page that names the day's whole work.
 *
 * The desk is a list and not a dashboard: each section is a queue the receptionist
 * clears, and the day is done when the page is empty. The seven sections are the
 * roadmap's own — the day's appointments, the results not recorded, the arrivals
 * waiting, the cycles to call, the debts past due, the new leads and the messages
 * already sent — and each is the module's own read, composed here rather than
 * recomputed, because a queue the page disagreed with would be two queues.
 *
 * ## Why the page reads six modules and owns none
 *
 * `02-architecture.md` §7's `dashboard` row: "Composes other modules; owns no
 * entities." The desk is that row's reception half, and the composition is the
 * page's whole job: `clinicDay` for the grid, `unrecordedCartable` for the alarm,
 * the two `contactList`s for the queues a call clears, `listLeads` for the cartable,
 * and `todaysReminders` for the messages the dispatch already produced. Nothing is
 * derived a second time — the balance a row shows is the one `debts` computed, and
 * the due day a cycle shows is the one `cycles` holds.
 *
 * ## Why a section a permission withholds is absent and not redacted
 *
 * The secretary's default is `04-roles-permissions.md` §2.1's 1–12, so every section
 * below shows for the default role. A manager's override that removes one is a desk
 * without that queue, and `can()` is what keeps the page from asking a module whose
 * answer it must refuse — a section rendered as "no permission" would be a queue the
 * clinic told the desk not to clear, presented as work.
 *
 * ## Why the page is a server component
 *
 * Every read below is a module barrel the client bundle must not reach (`05`'s argon2
 * lesson, and the payments writer's). The page composes them where the request runs
 * and hands the rows down, and the only client code the desk needs is the shell's.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { AppointmentStatus, LeadStatus, Permission } from '@/core/constants'
import {
  asLocalDate,
  asLocalTime,
  dateToLocalDate,
  formatMoney,
  formatPhone,
  formatTime,
  nowLocalTime,
  todayLocalDate,
  toPersianDigits,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { can } from '@/modules/roles-permissions'
import {
  APPOINTMENT_STATUS_LABELS,
  clinicDay,
  runLifecycleSweep,
  unrecordedCartable,
} from '@/modules/appointments'
import { CYCLE_STATUS_LABELS, contactList as cycleContacts, readUtcOffsetMinutes } from '@/modules/cycles'
import { DEBT_BUCKET_LABELS, contactList as debtContacts } from '@/modules/debts'
import { listLeads } from '@/modules/customers'
import {
  AUTOMATIC_KIND_LABELS,
  HELD_LABELS,
  todaysReminders,
} from '@/modules/notifications'
import { SEND_STATUS_LABELS } from '@/modules/messages'

import { DESK_PAGE, PANEL_HOMES } from '@/app/catalog'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: PANEL_HOMES.reception }

/** The six columns every section's table carries, in one place for the same reason. */
type DeskRow = {
  readonly key: string
  readonly first: string
  readonly second: string
  readonly third: string
  readonly fourth: string
  readonly status: string
}

/**
 * «میز کار امروز» — the day's seven queues, stacked in the order the day works
 * through them.
 */
export default async function ReceptionDeskPage() {
  const session = await requireStaffPanel('reception')
  const now = realClock()
  const today = todayLocalDate(now)

  const desk = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const ctx = session.permissions
    // The cartable is raised by the clock and not by a person, and the sweep is
    // idempotent, so the desk shows the day already promoted whether or not the
    // worker's tick has landed.
    const utcOffsetMinutes = await readUtcOffsetMinutes(tx, ctx.tenantId)
    await runLifecycleSweep({ tx, tenantId: ctx.tenantId, now, utcOffsetMinutes })

    const [day, unrecorded, cycles, debts, leads, reminders] = await Promise.all([
      clinicDay({ tx, ctx, clinicId: ctx.clinicId ?? null, localDate: today }),
      unrecordedCartable({ tx, tenantId: ctx.tenantId }),
      can(ctx, Permission.ActOnCycles)
        ? cycleContacts({ tx, ctx, now })
        : Promise.resolve([]),
      can(ctx, Permission.ViewDebts) ? debtContacts({ tx, ctx, now }) : Promise.resolve(null),
      can(ctx, Permission.ManageLeads) ? listLeads({ tx, ctx }) : Promise.resolve([]),
      todaysReminders(tx, ctx.tenantId, now),
    ])
    return { day, unrecorded, cycles, debts, leads, reminders }
  })

  const arrivals = desk.day.filter((row) => row.status === AppointmentStatus.AwaitingArrival)
  const overdue =
    desk.debts === null
      ? []
      : [...desk.debts.overdue, ...desk.debts.overdue7, ...desk.debts.overdue30]
  const newLeads = desk.leads.filter((row) => row.leadStatus === LeadStatus.New)

  const sections: readonly DeskRow[][] = [
    desk.day.map((row) => ({
      key: row.id,
      first: formatTime(asLocalTime(row.localTime)),
      second: row.customerName ?? '—',
      third: row.customerMobile === null ? '—' : formatPhone(row.customerMobile),
      fourth: row.serviceName ?? '—',
      status: APPOINTMENT_STATUS_LABELS[row.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? row.status,
    })),
    desk.unrecorded.map((row) => ({
      key: row.id,
      first: formatTime(asLocalTime(row.localTime)),
      second: row.customerName ?? '—',
      third: row.customerMobile === null ? '—' : formatPhone(row.customerMobile),
      fourth: row.serviceName ?? '—',
      status: APPOINTMENT_STATUS_LABELS[row.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? row.status,
    })),
    arrivals.map((row) => ({
      key: row.id,
      first: formatTime(asLocalTime(row.localTime)),
      second: row.customerName ?? '—',
      third: row.customerMobile === null ? '—' : formatPhone(row.customerMobile),
      fourth: row.doctorName,
      status: APPOINTMENT_STATUS_LABELS.AWAITING_ARRIVAL,
    })),
    desk.cycles.map((row) => ({
      key: row.id,
      first:
        row.dueLocalDate === null
          ? '—'
          : toPersianDigits(asLocalDate(row.dueLocalDate)),
      second: row.customerName,
      third: formatPhone(row.mobile),
      fourth: DESK_PAGE.sessionOf(row.serviceName, row.dueSessionNumber),
      status: CYCLE_STATUS_LABELS[row.status as keyof typeof CYCLE_STATUS_LABELS] ?? row.status,
    })),
    overdue.map((row) => ({
      key: row.appointmentId,
      first: formatMoney(row.balance, { unit: false }),
      second: `${row.customerFirstName} ${row.customerLastName ?? ''}`.trim(),
      third: formatPhone(row.customerMobile),
      fourth: toPersianDigits(asLocalDate(row.dueLocalDate)),
      status: DEBT_BUCKET_LABELS[row.bucket] ?? row.bucket,
    })),
    newLeads.map((row) => ({
      key: row.id,
      first: toPersianDigits(asLocalDate(dateToLocalDate(row.createdAt))),
      second: `${row.firstName} ${row.lastName ?? ''}`.trim(),
      third: formatPhone(row.mobile),
      fourth: row.acquisitionSource ?? '—',
      status: row.leadStatus ?? '—',
    })),
    desk.reminders.map((row) => ({
      key: row.id,
      first: row.sentAt === null ? '—' : formatTime(nowLocalTime(row.sentAt)),
      second: row.customerName,
      third: formatPhone(row.mobile),
      fourth: row.kind === null ? row.renderedText : AUTOMATIC_KIND_LABELS[row.kind],
      status:
        row.status === 'SUPPRESSED'
          ? `${HELD_LABELS.suppressed} — ${row.suppressedReason ?? ''}`.trim()
          : SEND_STATUS_LABELS[row.status as keyof typeof SEND_STATUS_LABELS] ?? row.status,
    })),
  ]

  const headings = [
    DESK_PAGE.sections.appointments,
    DESK_PAGE.sections.unrecorded,
    DESK_PAGE.sections.arrivals,
    DESK_PAGE.sections.cycles,
    DESK_PAGE.sections.debts,
    DESK_PAGE.sections.leads,
    DESK_PAGE.sections.reminders,
  ]
  const links = [
    { href: '/reception/appointments', label: DESK_PAGE.links.allAppointments },
    { href: '/reception/appointments?view=cartable', label: DESK_PAGE.links.allAppointments },
    undefined,
    { href: '/reception/cycles', label: DESK_PAGE.links.allCycles },
    { href: '/reception/debts', label: DESK_PAGE.links.allDebts },
    { href: '/reception/leads', label: DESK_PAGE.links.allLeads },
    undefined,
  ]

  const empty = sections.every((rows) => rows.length === 0)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DESK_PAGE.title}</h1>
        <p className="text-sm text-ink-2">{DESK_PAGE.lead}</p>
      </div>

      {empty ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-12 text-center text-base font-medium text-ink-2">
          {DESK_PAGE.empty}
        </p>
      ) : (
        sections.map((rows, index) => (
          <DeskSection
            key={headings[index]}
            heading={headings[index]}
            count={rows.length}
            link={links[index]}
            rows={rows}
          />
        ))
      )}
    </div>
  )
}

/**
 * One section of the day — a heading with its count, the rows, or the sentence that
 * says the queue is clear.
 */
function DeskSection({
  heading,
  count,
  link,
  rows,
}: {
  readonly heading: string
  readonly count: number
  readonly link?: { readonly href: string; readonly label: string }
  readonly rows: readonly DeskRow[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 text-lg font-bold text-ink">
        {heading}
        <span className="text-sm font-normal text-ink-3">
          {count === 0
            ? DESK_PAGE.counts.none
            : count === 1
              ? DESK_PAGE.counts.one
              : DESK_PAGE.counts.many(count)}
        </span>
        {link === undefined ? null : (
          <Link
            href={link.href}
            className="ms-auto text-sm font-medium text-primary hover:underline"
          >
            {link.label}
          </Link>
        )}
      </h2>
      {count === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-ink-3">
          {DESK_PAGE.counts.none}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{heading}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3">
                <Th>{DESK_PAGE.columns.time}</Th>
                <Th>{DESK_PAGE.columns.name}</Th>
                <Th>{DESK_PAGE.columns.mobile}</Th>
                <Th>{DESK_PAGE.columns.service}</Th>
                <Th>{DESK_PAGE.columns.status}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line text-ink last:border-b-0">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{row.first}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.second}</td>
                  <td className="px-4 py-3 whitespace-nowrap" dir="ltr">
                    {row.third}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{row.fourth}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** A table header cell, as the seven tables the page renders share. */
function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th scope="col" className={`px-4 py-2 text-start font-medium ${className ?? ''}`}>
      {children}
    </th>
  )
}
