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

import { CYCLES_PAGE } from '@/app/catalog'
import { CyclesTable } from '@/app/_cycles/cycles-table'
import { contactList, readUtcOffsetMinutes } from '@/modules/cycles'
import { requireStaffPanel } from '@/app/_shell/session'

import { CyclesChips, CyclesKpi, type CyclesCounts, type CyclesFilter } from './_components/cycles-board'

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
  const active = filterFromParam((await searchParams).filter)

  const { rows, entries, offset } = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [list, offset] = await Promise.all([
      contactList({ tx, ctx: session.permissions, now }),
      readUtcOffsetMinutes(tx, session.tenantId),
    ])
    return {
      rows: list,
      offset,
      // The desk's table keys its actions by the entry, which carries the mobile the row
      // dials and the due day the desk reads.
      entries: Object.fromEntries(list.map((entry) => [entry.id, entry])),
    }
  })

  // The KPI and chip counts are computed from the real rows, so a tile cannot disagree
  // with the table: overdue = a scheduled contact whose day has passed, not-contacted =
  // never called, scheduled = has a next contact booked.
  const isOverdue = (row: (typeof rows)[number]) =>
    row.nextContactAt !== null && row.nextContactAt.getTime() < now.getTime()
  const isNotContacted = (row: (typeof rows)[number]) => row.lastContactAt === null
  const counts: CyclesCounts = {
    total: rows.length,
    overdue: rows.filter(isOverdue).length,
    notContacted: rows.filter(isNotContacted).length,
    scheduled: rows.filter((row) => row.nextContactAt !== null).length,
  }

  const visible =
    active === 'overdue'
      ? rows.filter(isOverdue)
      : active === 'notContacted'
        ? rows.filter(isNotContacted)
        : rows

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.reception.lead}</p>
      </div>

      <CyclesKpi counts={counts} />
      <CyclesChips active={active} counts={counts} basePath={BASE_PATH} />

      <CyclesTable
        rows={visible}
        contactEntries={entries}
        utcOffsetMinutes={offset}
        showDeskActions
        emptyMessage={CYCLES_PAGE.empty.list}
      />
    </div>
  )
}
