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
import { CycleStatus, isMember } from '@/core/constants'
import { formatNumber, formatPercent } from '@/core/localization'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { CYCLES_PAGE } from '@/app/catalog'
import { DOCTOR_CYCLES } from '@/app/doctor/catalog'
import { CyclesTable } from '@/app/_cycles/cycles-table'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { doctorCycles, readUtcOffsetMinutes } from '@/modules/cycles'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CYCLES_PAGE.doctor.title }

/** The page's own route, as the pagination links to. */
const BASE_PATH = '/doctor/cycles'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * «چرخه درمان» — the courses the doctor performs, scoped by the module's own read.
 */
export default async function DoctorCyclesPage({ searchParams }: { readonly searchParams: PageSearchParams }) {
  const session = await requireStaffPanel('doctor')
  const page = pageFromParam((await searchParams).page)

  const { rows, offset } = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [rows, offset] = await Promise.all([
      doctorCycles({ tx, ctx: session.permissions }),
      readUtcOffsetMinutes(tx, session.tenantId),
    ])
    return { rows, offset }
  })

  const active = rows.filter(
    (row) => isMember(CycleStatus, row.status) &&
      (row.status === CycleStatus.Active || row.status === CycleStatus.Due || row.status === CycleStatus.AtRisk),
  ).length
  const overdue = rows.filter((row) => row.inContactList).length
  const completed = rows.filter((row) => isMember(CycleStatus, row.status) && row.status === CycleStatus.Completed).length
  const abandoned = rows.filter((row) => isMember(CycleStatus, row.status) && row.status === CycleStatus.Abandoned).length
  const terminal = completed + abandoned
  const completionRate = terminal === 0 ? 0 : Math.round((completed / terminal) * 100)

  const { slice, totalPages } = paginate(rows, page)
  const hrefFor = (next: number): string => (next > 1 ? `${BASE_PATH}?page=${String(next)}` : BASE_PATH)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.doctor.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.doctor.lead}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
        <CycleKpi label={DOCTOR_CYCLES.kpi.active} value={formatNumber(active)} icon="treatment" tone="bg-info-bg text-info" />
        <CycleKpi label={DOCTOR_CYCLES.kpi.overdue} value={formatNumber(overdue)} icon="alert" tone="bg-warn-bg text-warn" />
        <CycleKpi label={DOCTOR_CYCLES.kpi.completionRate} value={formatPercent(completionRate)} icon="confirm" tone="bg-ok-bg text-ok" />
      </div>

      <CyclesTable rows={slice} utcOffsetMinutes={offset} emptyMessage={CYCLES_PAGE.empty.doctor} />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

/** One count, as the cycles page's own KPI tile. */
function CycleKpi({
  label,
  value,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly icon: IconName
  readonly tone: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tone)}>
        <Icon name={icon} size="card" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="truncate text-lg font-bold text-ink tabular-nums">{value}</span>
      </span>
    </div>
  )
}
