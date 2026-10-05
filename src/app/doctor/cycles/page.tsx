/**
 * The doctor's own courses — `02-architecture.md` §9's `doctor/cycles.html`.
 *
 * The doctor's default holds `view_own_cycles` (`04-roles-permissions.md` §2.1's 1, 5,
 * 10) and nothing on a course's write path, so the page is a read and offers no actions.
 * The module scopes the read by `doctorId` in its own `where` clause, which is the
 * 404-not-403 rule's read half: another doctor's courses are absent from this page and
 * never present-then-refused, because the scoping is in the query and not a guard after
 * it.
 *
 * ## Why the doctor's row carries no actions
 *
 * A doctor reads their own courses; the desk calls about them and the manager closes
 * them. The row the doctor sees is the same row the other two panels render, which is
 * what keeps the three surfaces from disagreeing about a course's progress — and the
 * writes the doctor's own permission does not hold are the writes the module refuses.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'

import { CYCLES_PAGE } from '@/app/catalog'
import { CyclesTable } from '@/app/_cycles/cycles-table'
import { doctorCycles, readUtcOffsetMinutes } from '@/modules/cycles'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CYCLES_PAGE.doctor.title }

/**
 * «چرخه درمان» — the courses the doctor performs, scoped by the module's own read.
 */
export default async function DoctorCyclesPage() {
  const session = await requireStaffPanel('doctor')

  const { rows, offset } = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [rows, offset] = await Promise.all([
      doctorCycles({ tx, ctx: session.permissions }),
      readUtcOffsetMinutes(tx, session.tenantId),
    ])
    return { rows, offset }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.doctor.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.doctor.lead}</p>
      </div>

      <CyclesTable rows={rows} utcOffsetMinutes={offset} emptyMessage={CYCLES_PAGE.empty.doctor} />
    </div>
  )
}
