// src/app/reception/debts/page.tsx

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { formatMoney, formatNumber, isValidLocalDate } from '@/core/localization'
import { isMember } from '@/core/constants'

import { DEBTS_PAGE } from '@/app/catalog'
import { DebtsTable } from '@/app/_debts/debts-table'
import {
  clinicDebts, 
  readDebtSettings,
  type DebtRow,
} from '@/modules/debts'
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

// 👈 تغییر ۱: استفاده از کامپوننت‌های ادمین
import { DebtsKpi } from '@/app/admin/debts/_components/DebtsKpi'
import { DebtsFollowUpDateField } from './_components/debts-follow-up-date-field'


export const metadata: Metadata = { title: DEBTS_PAGE.reception.title }

const PAYMENT_OPTIONS = {
  method: [
    { value: 'CASH', label: PAYMENT_METHOD_LABELS.CASH },
    { value: 'CARD', label: PAYMENT_METHOD_LABELS.CARD },
    { value: 'ONLINE', label: PAYMENT_METHOD_LABELS.ONLINE },
  ],
  kind: [
    { value: 'PARTIAL', label: PAYMENT_KIND_LABELS.PARTIAL },
    { value: 'FINAL', label: PAYMENT_KIND_LABELS.FINAL },
  ],
} as const

const BASE_PATH = '/reception/debts'

type DebtsTab = 'everyone' | 'today' | 'all' | 'unfollowed'
const TAB_VALUES: readonly DebtsTab[] = ['everyone', 'today', 'all', 'unfollowed']
const DEFAULT_TAB: DebtsTab = 'everyone'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function ReceptionDebtsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const now = realClock()
  const tab = tabFromParam(params.tab)
  const search = asString(params.q).trim()
  const doctorFilter = asString(params.doctor)
  const followUpDate = asLocalDateParam(params.due)

  const { buckets, collectedRial, offset, doctors, followUpsMap } = await runInTenantScope(
    session.permissions,
    prisma(),
    async (tx) => {
      const settings = await readDebtSettings(tx, session.tenantId)
      const [buckets, collectedRial, doctors] = await Promise.all([
        clinicDebts({ tx, ctx: session.permissions, now }), // 👈 تغییر ۲: دیدن همه بدهی‌ها مثل ادمین
        paymentsThisMonth(tx, session.tenantId, now, settings.utcOffsetMinutes),
        tx.user.findMany({
          where: { tenantId: session.tenantId, isActive: true },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
        }),
      ])

      const appointmentIds = buckets.overdue30
        .concat(buckets.overdue7, buckets.overdue, buckets.dueSoon)
        .map((row) => row.appointmentId)

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

      return { buckets, collectedRial, offset: settings.utcOffsetMinutes, doctors, followUpsMap }
    },
  )

  const allRows = [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue, ...buckets.dueSoon]
  const pastDue = [...buckets.overdue30, ...buckets.overdue7, ...buckets.overdue]
  const totalRial = allRows.reduce((total, row) => total + row.balance, 0n)

  const tabRows = rowsForTab(allRows, tab, now, offset)
  const filteredRows = applyFilters(tabRows, search, doctorFilter, followUpDate, offset)

  const isFiltered = search !== '' || doctorFilter !== '' || followUpDate !== null

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(filteredRows, page)

  const pageRial = slice.reduce((total, row) => total + row.balance, 0n)

  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (tab !== DEFAULT_TAB) sp.set('tab', tab)
    if (search !== '') sp.set('q', search)
    if (doctorFilter !== '') sp.set('doctor', doctorFilter)
    if (followUpDate !== null) sp.set('due', followUpDate)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  const doctorOptions = [
    { value: '', label: DEBTS_PAGE.filter.allDoctors },
    ...doctors.map((doctor) => ({
      value: doctor.id,
      label:
        doctor.lastName === '' ? doctor.firstName : `${doctor.firstName} ${doctor.lastName}`,
    })),
  ]

  const totalLabel = isFiltered ? DEBTS_PAGE.total.filteredLabel : DEBTS_PAGE.total.label

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.reception.lead}</p>
      </div>

           <DebtsKpi
        totalRial={allRows.reduce((total, row) => total + row.balance, 0n)}
        totalDebtors={new Set(allRows.map((row) => row.customerId)).size}
        over30Count={buckets.overdue30?.length ?? 0}
        between1and7Count={buckets.overdue7?.length ?? 0}
      />

      <DebtsTabs
        active={tab}
        basePath={BASE_PATH}
        search={search}
        doctor={doctorFilter}
        followUpDate={followUpDate}
      />

      <DebtsFilters
        activeTab={tab}
        search={search}
        doctor={doctorFilter}
        doctorOptions={doctorOptions}
        followUpDate={followUpDate}
        basePath={BASE_PATH}
      />

            <DebtsTable
        rows={slice}
        showActions
        paymentOptions={PAYMENT_OPTIONS}
        followUpsMap={followUpsMap}
        panel="reception" // 👈 این خط رو حتماً اضافه کن
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-ink-3">
          {`${totalLabel} (${formatNumber(slice.length)} ${DEBTS_PAGE.total.pageRows})`}
        </span>
        <span className="font-semibold text-ink tabular-nums">{formatMoney(pageRial)}</span>
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

/* ── بقیه کدها دقیقاً مثل قبل ─────────── */

function DebtsTabs({ active, basePath, search, doctor, followUpDate }: {
  readonly active: DebtsTab
  readonly basePath: string
  readonly search: string
  readonly doctor: string
  readonly followUpDate: string | null
}) {
  const labels: Readonly<Record<DebtsTab, string>> = {
    everyone: DEBTS_PAGE.tabs.everyone,
    today: DEBTS_PAGE.tabs.today,
    all: DEBTS_PAGE.tabs.all,
    unfollowed: DEBTS_PAGE.tabs.unfollowed,
  }
  return (
    <nav
      className="flex items-center gap-2 max-panel:flex-nowrap max-panel:overflow-x-auto panel:flex-wrap"
      aria-label={DEBTS_PAGE.reception.title}
    >
      {TAB_VALUES.map((tab) => {
        const isActive = tab === active
        const sp = new URLSearchParams()
        if (tab !== DEFAULT_TAB) sp.set('tab', tab)
        if (search !== '') sp.set('q', search)
        if (doctor !== '') sp.set('doctor', doctor)
        if (followUpDate !== null) sp.set('due', followUpDate)
        const qs = sp.toString()
        const href = qs === '' ? basePath : `${basePath}?${qs}`
        return (
          <Link
            key={tab}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {labels[tab]}
          </Link>
        )
      })}
    </nav>
  )
}

function DebtsFilters({ activeTab, search, doctor, doctorOptions, followUpDate, basePath }: {
  readonly activeTab: DebtsTab
  readonly search: string
  readonly doctor: string
  readonly doctorOptions: readonly { readonly value: string; readonly label: string }[]
  readonly followUpDate: string | null
  readonly basePath: string
}) {
  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface px-4 py-3"
    >
      {activeTab !== DEFAULT_TAB ? <input type="hidden" name="tab" value={activeTab} /> : null}
      <label className="flex min-w-64 flex-1 flex-col gap-1">
        <span className="text-xs font-semibold text-ink-3">{DEBTS_PAGE.search.label}</span>
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder={DEBTS_PAGE.search.placeholder}
          className="rounded-xs border border-line-2 bg-surface px-3 py-[6px] text-sm text-ink placeholder:text-ink-3 focus:border-brand-300 focus:outline-none"
        />
      </label>
      <label className="flex min-w-48 flex-col gap-1">
        <span className="text-xs font-semibold text-ink-3">{DEBTS_PAGE.filter.doctor}</span>
        <select
          name="doctor"
          defaultValue={doctor}
          className="rounded-xs border border-line-2 bg-surface px-3 py-[6px] text-sm text-ink focus:border-brand-300 focus:outline-none"
        >
          {doctorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <DebtsFollowUpDateField defaultValue={followUpDate} />
      <button
        type="submit"
        className="mt-5 shrink-0 rounded-xs border border-brand-300 bg-brand-50 px-4 py-[6px] text-xs font-semibold text-brand-700 hover:bg-brand-100"
      >
        {DEBTS_PAGE.search.label}
      </button>
    </form>
  )
}

function rowsForTab(rows: readonly DebtRow[], tab: DebtsTab, now: Date, utcOffsetMinutes: number): readonly DebtRow[] {
  if (tab === 'everyone') return rows
  if (tab === 'unfollowed') return rows.filter((row) => row.lastFollowUp === null)
  if (tab === 'today') return rows.filter((row) => isToday(row.nextContactAt, now, utcOffsetMinutes))
  return [...rows]
    .filter((row) => row.lastFollowUp !== null)
    .sort((a, b) => compareByNextContact(a, b, now))
}

function isToday(instant: Date | null, now: Date, utcOffsetMinutes: number): boolean {
  if (instant === null) return false
  return dayKey(instant, utcOffsetMinutes) === dayKey(now, utcOffsetMinutes)
}

function dayKey(instant: Date, utcOffsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

function compareByNextContact(a: DebtRow, b: DebtRow, now: Date): number {
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

function applyFilters(rows: readonly DebtRow[], search: string, doctorFilter: string, followUpDate: string | null, utcOffsetMinutes: number): readonly DebtRow[] {
  return rows.filter((row) => {
    if (doctorFilter !== '' && row.doctorId !== doctorFilter) return false
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

function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function asLocalDateParam(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  if (value === '') return null
  return isValidLocalDate(value) ? value : null
}