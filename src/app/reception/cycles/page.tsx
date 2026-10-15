/**
 * The desk's contact list — `02-architecture.md` §9's `reception/cycles.html`.
 *
 * ## The two tabs
 *
 * «همه‌ی فعال‌ها» is the default: every open course, on the list or not — the set
 * the desk books the next session against. «در لیست تماس» is the follow-up queue:
 * the courses the clock has put on the list because their day arrived and the
 * customer has not booked. The two are two reads over the same rows.
 *
 * ## Why the page also reads the day grid
 *
 * «رزرو جلسه بعدی» opens the booking popup against the day's own doctors and
 * slots, so the page loads the day grid as well and hands its `services`,
 * `customers`, `doctorsByServiceId` and `freeSlotsByDoctorId` down to the row
 * actions. The popup is the same one the appointments page opens.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { fromUtcInstant, todayLocalDate } from '@/core/localization'

import { CYCLES_PAGE } from '@/app/catalog'
import { CyclesTable } from '@/app/_cycles/cycles-table'
import {
  contactList,
  readUtcOffsetMinutes,
  receptionActiveCycles,
} from '@/modules/cycles'

import { todaysReminders } from '@/modules/notifications'
import { requireStaffPanel } from '@/app/_shell/session'
import { loadDayGrid } from '@/app/_appointments/page-data'

import {
  CyclesChips,
  CyclesKpi,
  CyclesTabs,
  type CyclesCounts,
  type CyclesFilter,
  type CyclesTab,
} from './_components/cycles-board'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'

export const metadata: Metadata = { title: CYCLES_PAGE.reception.title }

const BASE_PATH = '/reception/cycles'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

function filterFromParam(value: string | string[] | undefined): CyclesFilter {
  if (value === 'overdue' || value === 'notContacted') return value
  return 'all'
}

/**
 * The tab the URL names, or «همه‌ی فعال‌ها».
 *
 * The default is `active`, so the first load of the page shows every open course
 * and not only the follow-up queue. A URL that names `list` explicitly is the desk
 * asking for the queue.
 */
function tabFromParam(value: string | string[] | undefined): CyclesTab {
  if (value === 'list') return 'list'
  return 'active'
}

export default async function ReceptionCyclesPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const now = realClock()
  const today = todayLocalDate(now)
  const params = await searchParams
  const active = filterFromParam(params.filter)
  const tab = tabFromParam(params.tab)

  const { listRows, activeRows, offset, sessionsToday, autoSms, day } = await runInTenantScope(
    session.permissions,
    prisma(),
    async (tx) => {
      const [list, active, offset, dayGrid, reminders] = await Promise.all([
        contactList({ tx, ctx: session.permissions, now }),
        receptionActiveCycles({ tx, ctx: session.permissions, now }),
        readUtcOffsetMinutes(tx, session.tenantId),
        loadDayGrid({
          tx,
          ctx: session.permissions,
          clinicId: session.permissions.clinicId,
          localDate: today,
        }),
        todaysReminders(tx, session.tenantId, now),
      ])
      return {
        listRows: list,
        activeRows: active,
        offset,
        day: dayGrid,
        sessionsToday: dayGrid.rows.filter(
          (row) => row.status === 'COMPLETED' || row.status === 'ARRIVED',
        ).length,
        autoSms: reminders.filter((row) => row.kind !== null).length,
      }
    },
  )

  const isOverdue = (row: (typeof listRows)[number]) =>
    row.nextContactAt !== null && row.nextContactAt.getTime() < now.getTime()
  const isNotContacted = (row: (typeof listRows)[number]) => row.lastContactAt === null
  const isTodayContact = (row: (typeof listRows)[number]) =>
    row.nextContactAt !== null && fromUtcInstant(row.nextContactAt, offset).localDate === today
  const counts: CyclesCounts = {
    overdue: listRows.filter(isOverdue).length,
    todayContact: listRows.filter(isTodayContact).length,
    sessionsToday,
    autoSms,
  }

  const sourceRows = tab === 'active' ? activeRows : listRows
  const visible =
    tab === 'active'
      ? sourceRows
      : active === 'overdue'
        ? sourceRows.filter(isOverdue)
        : active === 'notContacted'
          ? sourceRows.filter(isNotContacted)
          : sourceRows

  const entries = Object.fromEntries(visible.map((entry) => [entry.id, entry]))

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(visible, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (tab !== 'active') sp.set('tab', tab)
    if (active !== 'all') sp.set('filter', active)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  const bookingOptions = {
    services: day.services,
    customers: day.customers,
    doctorsByServiceId: day.doctorsByServiceId,
    freeSlotsByDoctorId: day.freeSlotsByDoctorId,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CYCLES_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{CYCLES_PAGE.reception.lead}</p>
      </div>

      <CyclesKpi counts={counts} />

      <CyclesTabs active={tab} basePath={BASE_PATH} filter={active} />

      {tab === 'list' ? <CyclesChips active={active} basePath={BASE_PATH} tab={tab} /> : null}

      <CyclesTable
        rows={slice}
        contactEntries={entries}
        utcOffsetMinutes={offset}
        showDeskActions
        bookingOptions={bookingOptions}
        emptyMessage={tab === 'active' ? CYCLES_PAGE.empty.activeList : CYCLES_PAGE.empty.list}
      />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}