/**
 * The desk's contact list — `02-architecture.md` §9's `reception/cycles.html`.
 *
 * The secretary's default holds `act_on_cycles` (`04-roles-permissions.md` §2.1's 1–12),
 * and the list the desk reads is the product's primary revenue query: the courses whose
 * day arrived and whose customer has no appointment yet. The read recomputes every row
 * it returns, so the list a receptionist opens is the list the clock already made — and
 * the one a booking empties in the request that booked it.
 *
 * ## What the desk does from here
 *
 * The three writes the row offers: record a contact result with a day to try again, book
 * the next session, or record that the customer withdrew with a reason from the closed
 * list. The doctor's panel offers none of the three, and the manager's offers the two
 * that close a course.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { fromUtcInstant, todayLocalDate } from '@/core/localization'

import { CYCLES_PAGE } from '@/app/catalog'
import { CyclesTable } from '@/app/_cycles/cycles-table'
import { contactList, readUtcOffsetMinutes } from '@/modules/cycles'
import { clinicDay } from '@/modules/appointments'
import { todaysReminders } from '@/modules/notifications'
import { requireStaffPanel } from '@/app/_shell/session'

import { CyclesChips, CyclesKpi, type CyclesCounts, type CyclesFilter } from './_components/cycles-board'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'

export const metadata: Metadata = { title: CYCLES_PAGE.reception.title }

/** The page's own route, as the chip filter links back to. */
const BASE_PATH = '/reception/cycles'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/** The chip-filter value the URL names, or «all». */
function filterFromParam(value: string | string[] | undefined): CyclesFilter {
  if (value === 'overdue' || value === 'notContacted') return value
  return 'all'
}

/**
 * «دوره‌های فعال با موعد رسیده» — the courses the desk owes a call about.
 */
export default async function ReceptionCyclesPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const now = realClock()
  const today = todayLocalDate(now)
  const active = filterFromParam((await searchParams).filter)

  const { rows, entries, offset, sessionsToday, autoSms } = await runInTenantScope(
    session.permissions,
    prisma(),
    async (tx) => {
      const [list, offset, dayAppointments, reminders] = await Promise.all([
        contactList({ tx, ctx: session.permissions, now }),
        readUtcOffsetMinutes(tx, session.tenantId),
        clinicDay({ tx, ctx: session.permissions, clinicId: session.permissions.clinicId, localDate: today }),
        todaysReminders(tx, session.tenantId, now),
      ])
      return {
        rows: list,
        offset,
        entries: Object.fromEntries(list.map((entry) => [entry.id, entry])),
        sessionsToday: dayAppointments.filter((row) => row.status === 'COMPLETED' || row.status === 'ARRIVED').length,
        autoSms: reminders.filter((row) => row.kind !== null).length,
      }
    },
  )

  // The KPI and chip counts are computed from the real rows: overdue = a scheduled
  // contact whose day has passed, today-contact = one due today, not-contacted = never
  // called. Sessions-today and auto-SMS come from the day's appointments and the ledger.
  const isOverdue = (row: (typeof rows)[number]) =>
    row.nextContactAt !== null && row.nextContactAt.getTime() < now.getTime()
  const isNotContacted = (row: (typeof rows)[number]) => row.lastContactAt === null
  const isTodayContact = (row: (typeof rows)[number]) =>
    row.nextContactAt !== null && fromUtcInstant(row.nextContactAt, offset).localDate === today
  const counts: CyclesCounts = {
    overdue: rows.filter(isOverdue).length,
    todayContact: rows.filter(isTodayContact).length,
    sessionsToday,
    autoSms,
  }

  const visible =
    active === 'overdue'
      ? rows.filter(isOverdue)
      : active === 'notContacted'
        ? rows.filter(isNotContacted)
        : rows

  const page = pageFromParam((await searchParams).page)
  const { slice, totalPages } = paginate(visible, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (active !== 'all') sp.set('filter', active)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.reception.lead}</p>
      </div>

      <CyclesKpi counts={counts} />
      <CyclesChips active={active} basePath={BASE_PATH} />

      <CyclesTable
        rows={slice}
        contactEntries={entries}
        utcOffsetMinutes={offset}
        showDeskActions
        emptyMessage={CYCLES_PAGE.empty.list}
      />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}
