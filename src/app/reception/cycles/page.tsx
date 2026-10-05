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

export const metadata: Metadata = { title: CYCLES_PAGE.reception.title }

/**
 * «دوره‌های فعال با موعد رسیده» — the courses the desk owes a call about.
 */
export default async function ReceptionCyclesPage() {
  const session = await requireStaffPanel('reception')
  const now = realClock()

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.reception.lead}</p>
      </div>

      <CyclesTable
        rows={rows}
        contactEntries={entries}
        utcOffsetMinutes={offset}
        showDeskActions
        emptyMessage={CYCLES_PAGE.empty.list}
      />
    </div>
  )
}
