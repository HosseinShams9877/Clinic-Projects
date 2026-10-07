/**
 * The manager panel's home — `02-architecture.md` §7's «داشبورد من」 and §9's
 * `admin/dashboard.html`.
 *
 * The home is the day the request is in: the appointments ahead, the month's new
 * customers and finished cycles, and the two queues that need a person — the cycles
 * whose next session is overdue and the customers who have gone quiet. None of it is
 * money; the manager is the one role with the whole matrix, and the one screen that
 * sizes the day is not the screen that prices it.
 *
 * The day is resolved inside the tenant's own scope from the tenant's own offset,
 * so a clinic whose clock is half a day away from UTC counts the day it is having.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { formatNumber, fromUtcInstant } from '@/core/localization'
import { realClock } from '@/core/lib/clock'

import { PANEL_HOMES, PANEL_SCOPE } from '@/app/catalog'
import { requireStaffPanel } from '@/app/_shell/session'
import { readReportOffset } from '@/modules/reports'
import { DASHBOARD_FIELDS, readManagerHome } from '@/modules/dashboard'

export const metadata: Metadata = { title: PANEL_HOMES.admin }

export default async function AdminHomePage() {
  const session = await requireStaffPanel('admin')

  const home = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const offset = await readReportOffset(tx, session.tenantId)
    const today = fromUtcInstant(realClock(), offset).localDate
    return readManagerHome(tx, session.tenantId, today)
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{DASHBOARD_FIELDS.title}</h1>
        <p className="text-sm text-ink-2">{PANEL_SCOPE.admin}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{DASHBOARD_FIELDS.today}</h2>
        <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
          <CountCard label={DASHBOARD_FIELDS.todayTotal} value={home.today.total} />
          <CountCard label={DASHBOARD_FIELDS.completed} value={home.today.completed} />
          <CountCard label={DASHBOARD_FIELDS.noShows} value={home.today.noShows} />
          <CountCard label={DASHBOARD_FIELDS.awaitingArrival} value={home.today.awaitingArrival} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{DASHBOARD_FIELDS.month}</h2>
        <div className="grid grid-cols-2 gap-3 panel:grid-cols-3">
          <CountCard label={DASHBOARD_FIELDS.newCustomers} value={home.month.newCustomers} />
          <CountCard label={DASHBOARD_FIELDS.cyclesCompleted} value={home.month.cyclesCompleted} />
          <CountCard label={DASHBOARD_FIELDS.cyclesAbandoned} value={home.month.cyclesAbandoned} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{DASHBOARD_FIELDS.overdueLead}</h2>
        <div className="grid grid-cols-2 gap-3">
          <CountCard label={DASHBOARD_FIELDS.overdueCycles} value={home.overdueCycles} />
          <CountCard label={DASHBOARD_FIELDS.dormantCustomers} value={home.dormantCustomers} />
        </div>
      </section>
    </div>
  )
}

/** One count, as the home's grid renders it: a label and the number it names. */
function CountCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="text-2xl font-bold text-ink">{formatNumber(value)}</span>
    </div>
  )
}
