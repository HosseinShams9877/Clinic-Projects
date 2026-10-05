/**
 * The manager's cycle oversight — `02-architecture.md` §9's `admin/cycles.html`.
 *
 * The manager's default holds all sixteen permissions, and the page the manager reads is
 * the clinic's whole course book: the cycles at every status, including the two terminal
 * ones the drop-off curve counts. It is the entry point the report builds on, and the two
 * writes the page offers are the two that close a course — the completion an unbounded one
 * needs and the abandonment with a reason the report groups by.
 *
 * ## Why the page is read-only and the row is not
 *
 * The table renders no form of its own and the row offers two writes, which is the same
 * shape the manager's own services page takes: an oversight surface is a read, and the
 * writes that change what it shows are the row's own, gated by the permission the module
 * checks and not by the page the button is on.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'

import { CYCLES_PAGE } from '@/app/catalog'
import { CyclesTable } from '@/app/_cycles/cycles-table'
import { clinicCycles, readUtcOffsetMinutes } from '@/modules/cycles'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CYCLES_PAGE.admin.title }

/**
 * «دوره‌های درمان» — the clinic's courses, at every status the cycle holds.
 */
export default async function AdminCyclesPage() {
  const session = await requireStaffPanel('admin')

  const { rows, offset } = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [rows, offset] = await Promise.all([
      clinicCycles({ tx, ctx: session.permissions }),
      readUtcOffsetMinutes(tx, session.tenantId),
    ])
    return { rows, offset }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.admin.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.admin.lead}</p>
      </div>

      <CyclesTable
        rows={rows}
        utcOffsetMinutes={offset}
        showOversightActions
        emptyMessage={CYCLES_PAGE.empty.clinic}
      />
    </div>
  )
}
