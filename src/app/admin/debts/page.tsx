/**
 * The manager's debt oversight — `02-architecture.md` §9's `admin/debts.html`.
 *
 * The manager's default holds `view_debts` and not `follow_up_debt`
 * (`04-roles-permissions.md` §2.1), so the page is the read and nothing else: the same
 * four buckets the desk's list is, with no row action, because the write that settles a
 * debt belongs to the desk's page and the desk's permission.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'

import { DEBTS_PAGE } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import { clinicDebts } from '@/modules/debts'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: DEBTS_PAGE.admin.title }

/**
 * «بدهی‌ها» — the clinic's open balances, as the manager reads them.
 */
export default async function AdminDebtsPage() {
  const session = await requireStaffPanel('admin')

  const buckets = await runInTenantScope(session.permissions, prisma(), (tx) =>
    clinicDebts({ tx, ctx: session.permissions, now: realClock() }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.admin.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.admin.lead}</p>
      </div>

      <DebtsTable buckets={buckets} />
    </div>
  )
}
