import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { formatMoney, formatNumber, isValidLocalDate } from '@/core/localization'
import { isMember } from '@/core/constants'
import { DEBTS_PAGE } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import { clinicDebts, readDebtSettings, type DebtRow } from '@/modules/debts'
import { paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'
import { DebtsKpi } from '@/app/reception/debts/_components/debts-kpi'
import { DebtsFollowUpDateField } from '@/app/reception/debts/_components/debts-follow-up-date-field'

export const metadata: Metadata = { title: DEBTS_PAGE.doctor.title }
const BASE_PATH = '/doctor/debts'

type DebtsTab = 'everyone' | 'today' | 'all' | 'unfollowed'
const TAB_VALUES: readonly DebtsTab[] = ['everyone', 'today', 'all', 'unfollowed']
const DEFAULT_TAB: DebtsTab = 'everyone'
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function DoctorDebtsPage({ searchParams }: { readonly searchParams: PageSearchParams }) {
  const session = await requireStaffPanel('doctor')
  const params = await searchParams
  const now = realClock()
  const tab = tabFromParam(params.tab)
  const search = asString(params.q).trim()
  const followUpDate = asLocalDateParam(params.due)

  const { myBuckets, collectedRial, offset, followUpsMap, installments } = await runInTenantScope(
    session.permissions,
    prisma(),
    async (tx) => {
      const settings = await readDebtSettings(tx, session.tenantId)
      const allBuckets = await clinicDebts({ tx, ctx: session.permissions, now }) 
      const myId = session.permissions.userId
      const myBuckets = {
        overdue30: allBuckets.overdue30.filter(r => r.doctorId === myId),
        overdue7: allBuckets.overdue7.filter(r => r.doctorId === myId),
        overdue: allBuckets.overdue.filter(r => r.doctorId === myId),
        dueSoon: allBuckets.dueSoon.filter(r => r.doctorId === myId),
      }

      const collectedRial = await paymentsThisMonth(tx, session.tenantId, now, settings.utcOffsetMinutes)
      const appointmentIds = myBuckets.overdue30.concat(myBuckets.overdue7, myBuckets.overdue, myBuckets.dueSoon).map((row) => row.appointmentId)

      // 👈 گرفتن اقساط برای تشخیص نوع بدهی
      const installments = await tx.installment.findMany({
        where: { appointmentId: { in: appointmentIds } },
        select: { id: true, appointmentId: true, type: true }
      })

      const allFollowUps = await tx.debtFollowUp.findMany({
        where: { tenantId: session.tenantId, appointmentId: { in: appointmentIds } },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      })

      const followUpsMap: Record<string, typeof allFollowUps> = {}
      for (const f of allFollowUps) {
        const existing = followUpsMap[f.appointmentId]
        if (existing) existing.push(f)
        else followUpsMap[f.appointmentId] = [f]
      }

      return { myBuckets, collectedRial, offset: settings.utcOffsetMinutes, followUpsMap, installments }
    },
  )

  const allRows = [...myBuckets.overdue30, ...myBuckets.overdue7, ...myBuckets.overdue, ...myBuckets.dueSoon]
  const pastDue = [...myBuckets.overdue30, ...myBuckets.overdue7, ...myBuckets.overdue]
  const totalRial = allRows.reduce((total, row) => total + row.balance, 0n)

  // 👈 ساخت نگاشت برای نوع بدهی
  const installmentByAppointment = new Map(installments.map(i => [i.appointmentId, i.type]))
  const typedRows = allRows.map(row => ({
    ...row,
    type: installmentByAppointment.get(row.appointmentId) || 'NORMAL'
  }))

  const tabRows = rowsForTab(typedRows, tab, now, offset)
  const filteredRows = applyFilters(tabRows, search, followUpDate, offset)

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(filteredRows, page)
  const pageRial = slice.reduce((total, row) => total + row.balance, 0n)

  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (tab !== DEFAULT_TAB) sp.set('tab', tab)
    if (search !== '') sp.set('q', search)
    if (followUpDate !== null) sp.set('due', followUpDate)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.doctor.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.doctor.lead}</p>
      </div>

      <DebtsKpi collectedRial={collectedRial} overdueCount={pastDue.length} totalRial={totalRial} />

      <nav className="flex items-center gap-2 max-panel:flex-nowrap max-panel:overflow-x-auto panel:flex-wrap">
        {TAB_VALUES.map((t) => {
          const isActive = t === tab
          const sp = new URLSearchParams()
          if (t !== DEFAULT_TAB) sp.set('tab', t)
          if (search !== '') sp.set('q', search)
          if (followUpDate !== null) sp.set('due', followUpDate)
          const qs = sp.toString()
          const href = qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
          return (
            <Link key={t} href={href} className={cx('shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline', isActive ? 'border-transparent bg-brand-50 text-brand-700' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2')}>
              {DEBTS_PAGE.tabs[t]}
            </Link>
          )
        })}
      </nav>

      <form method="get" action={BASE_PATH} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        {tab !== DEFAULT_TAB ? <input type="hidden" name="tab" value={tab} /> : null}
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-xs font-semibold text-ink-3">{DEBTS_PAGE.search.label}</span>
          <input type="search" name="q" defaultValue={search} placeholder={DEBTS_PAGE.search.placeholder} className="rounded-xs border border-line-2 bg-surface px-3 py-[6px] text-sm text-ink focus:border-brand-300 focus:outline-none" />
        </label>
        <DebtsFollowUpDateField defaultValue={followUpDate} />
        <button type="submit" className="mt-5 shrink-0 rounded-xs border border-brand-300 bg-brand-50 px-4 py-[6px] text-xs font-semibold text-brand-700 hover:bg-brand-100">{DEBTS_PAGE.search.label}</button>
      </form>

      {/* 👈 ارسال ردیف‌های دارای فیلد type */}
      <DebtsTable rows={slice as any} showActions={false} followUpsMap={followUpsMap} panel="doctor" />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-ink-3">{`${DEBTS_PAGE.total.label} (${formatNumber(slice.length)} ${DEBTS_PAGE.total.pageRows})`}</span>
        <span className="font-semibold text-ink tabular-nums">{formatMoney(pageRial)}</span>
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

function rowsForTab(rows: readonly any[], tab: DebtsTab, now: Date, utcOffsetMinutes: number): readonly any[] {
  if (tab === 'everyone') return rows
  if (tab === 'unfollowed') return rows.filter((row) => row.lastFollowUp === null)
  if (tab === 'today') return rows.filter((row) => isToday(row.nextContactAt, now, utcOffsetMinutes))
  return [...rows].filter((row) => row.lastFollowUp !== null).sort((a, b) => compareByNextContact(a, b, now))
}

function isToday(instant: Date | null, now: Date, utcOffsetMinutes: number): boolean {
  if (instant === null) return false
  return dayKey(instant, utcOffsetMinutes) === dayKey(now, utcOffsetMinutes)
}
function dayKey(instant: Date, utcOffsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}
function compareByNextContact(a: any, b: any, now: Date): number {
  if (a.nextContactAt === null && b.nextContactAt === null) return 0
  if (a.nextContactAt === null) return 1
  if (b.nextContactAt === null) return -1
  const aTime = a.nextContactAt.getTime() - now.getTime()
  const bTime = b.nextContactAt.getTime() - now.getTime()
  const aPast = aTime < 0
  const bPast = bTime < 0
  if (aPast && !bPast) return -1
  if (!aPast && bPast) return 1
  return aTime - bTime
}
function applyFilters(rows: readonly any[], search: string, followUpDate: string | null, utcOffsetMinutes: number): readonly any[] {
  return rows.filter((row) => {
    if (followUpDate !== null) {
      if (row.nextContactAt === null) return false
      if (dayKey(row.nextContactAt, utcOffsetMinutes) !== followUpDate) return false
    }
    if (search === '') return true
    const haystack = `${row.customerFirstName} ${row.customerLastName ?? ''} ${row.customerMobile}`
    return haystack.toLowerCase().includes(search.toLowerCase())
  })
}
function tabFromParam(value: string | string[] | undefined): DebtsTab {
  const name = typeof value === 'string' ? value : ''
  return isMember(TAB_VALUES, name) ? name : DEFAULT_TAB
}
function asString(value: string | string[] | undefined): string { return typeof value === 'string' ? value : '' }
function asLocalDateParam(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  if (value === '') return null
  return isValidLocalDate(value) ? value : null
}