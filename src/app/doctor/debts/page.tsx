/**
 * The doctor's own debts — `02-architecture.md` §9's `doctor/debts.html`.
 *
 * The doctor's default holds neither `view_debts` nor `follow_up_debt`
 * (`04-roles-permissions.md` §2.1), so the page is granted by override — the module's
 * own `requirePermission` is the gate, and a doctor without the grant gets the
 * sentence rather than an empty list. The rows are scoped to the doctor's own
 * appointments in the `where`, so the read cannot reach a course that is not theirs.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'

import { DEBTS_PAGE } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { doctorDebts } from '@/modules/debts'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: DEBTS_PAGE.doctor.title }

/** The page's own route, as the pagination links to. */
const BASE_PATH = '/doctor/debts'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * «مانده‌حساب» — the debts of the customers this doctor treated.
 */
export default async function DoctorDebtsPage({ searchParams }: { readonly searchParams: PageSearchParams }) {
  const session = await requireStaffPanel('doctor')
  const page = pageFromParam((await searchParams).page)

  const buckets = await runInTenantScope(session.permissions, prisma(), (tx) =>
    doctorDebts({ tx, ctx: session.permissions, now: realClock() }),
  )

  const allRows = [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue, ...buckets.dueSoon]
  const { slice, totalPages } = paginate(allRows, page)
  const hrefFor = (next: number): string => (next > 1 ? `${BASE_PATH}?page=${String(next)}` : BASE_PATH)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.doctor.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.doctor.lead}</p>
      </div>

      <DebtsTable rows={slice} />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}
