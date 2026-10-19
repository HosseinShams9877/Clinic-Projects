import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { realClock } from '@/core/lib/clock'
import { formatMoney, formatNumber, toPersianDigits } from '@/core/localization'
import { ADMIN_FINANCIAL_REPORTS } from '@/app/catalog'
import { Icon } from '@/core/components/icons'
import { clinicDebts } from '@/modules/debts'
import { loadDoctorNamesByUserId } from '@/app/_customers/page-data'

export const metadata: Metadata = { title: ADMIN_FINANCIAL_REPORTS.title }

export default async function AdminFinancialReportsPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  
  const q = typeof params.q === 'string' ? params.q : ''
  const doctorId = typeof params.doctor === 'string' ? params.doctor : ''
  const bucket = typeof params.bucket === 'string' ? params.bucket : ''

  const now = realClock()
  
  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const debts = await clinicDebts({ tx, ctx: session.permissions, now })
    const allDoctorIds = Array.from(new Set(Object.values(debts).flat().map((d: any) => d.doctorId).filter(Boolean)))
    return {
      doctorNames: await loadDoctorNamesByUserId(tx, session.tenantId, allDoctorIds as string[]),
    }
  })

  const uniqueDoctors = Object.entries(data.doctorNames).map(([id, name]) => ({ id, name }))

  const fakeRecords = [
    {
      id: '1',
      customerName: 'مونا حسینی',
      serviceName: 'هایفوتراپی',
      doctorName: 'دکتر نادری',
      doctorId: 'doc1',
      dueDate: '۱۴۰۵/۰۵/۱۵',
      amount: 2500000n,
      statusLabel: '۴۴ روز گذشته',
      bucket: 'past',
      followerName: 'سمیرا صدری',
      lastAction: 'تماس تلفنی\n۱۸ شهریور ۱۰:۰۰',
      result: 'پاسخ دریافت نشد',
      nextFollowUp: 'امروز',
    },
    {
      id: '2',
      customerName: 'آرزو مرادی',
      serviceName: 'تزریق ژل',
      doctorName: 'دکتر محمدی',
      doctorId: 'doc2',
      dueDate: '۱۴۰۵/۰۵/۲۰',
      amount: 12500000n,
      statusLabel: '۳۹ روز گذشته',
      bucket: 'past',
      followerName: 'مریم احمدی',
      lastAction: 'درخواست تقسیط\n۲۵ مرداد ۱۴:۲۰',
      result: 'در انتظار نتیجه',
      nextFollowUp: '۳ روز دیگر',
    },
    {
      id: '3',
      customerName: 'علیرضا حسینی',
      serviceName: 'تزریق بوتاکس',
      doctorName: 'دکتر کیانی',
      doctorId: 'doc3',
      dueDate: '۱۴۰۵/۰۵/۰۷',
      amount: 8500000n,
      statusLabel: '۱۹ روز گذشته',
      bucket: 'awaiting',
      followerName: 'مریم صالحی',
      lastAction: 'ارسال پیامک\n۱۵ مهر ۱۰:۰۰',
      result: 'پیامک یادآوری ارسال شد',
      nextFollowUp: 'فردا',
    },
    {
      id: '4',
      customerName: 'سارا محمدی',
      serviceName: 'لیزر موهای زائد',
      doctorName: 'دکتر نادری',
      doctorId: 'doc1',
      dueDate: '۱۴۰۵/۰۵/۱۵',
      amount: 12000000n,
      statusLabel: '۱۱ روز گذشته',
      bucket: 'awaiting',
      followerName: 'سمیرا صدری',
      lastAction: 'تماس تلفنی\n۲۳ مهر ۱۲:۱۰',
      result: 'پاسخ دریافت نشد',
      nextFollowUp: 'فردا',
    },
  ]

  const rows = fakeRecords.filter((row) => {
    if (q) {
      const term = q.toLowerCase()
      if (!row.customerName.toLowerCase().includes(term) && !row.serviceName.toLowerCase().includes(term)) {
        return false
      }
    }
    if (doctorId && row.doctorId !== doctorId) {
      return false
    }
    if (bucket && row.bucket !== bucket) {
      return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{ADMIN_FINANCIAL_REPORTS.heading}</h1>
        <p className="text-sm text-ink-2">{ADMIN_FINANCIAL_REPORTS.subtitle}</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-sm text-info border border-info/20">
        <Icon name="info" size="card" />
        <span>{ADMIN_FINANCIAL_REPORTS.alert}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-bg text-info">
            <Icon name="calendar" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.weekDue}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(4)}</span>
          </span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-bg text-danger">
            <Icon name="customers" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.activeDebtors}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(8)}</span>
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.units.person}</span>
          </span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok-bg text-ok">
            <Icon name="success" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.followedToday}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(4)}</span>
          </span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-bg text-warn">
            <Icon name="clock" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.awaitingResult}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(3)}</span>
          </span>
        </div>
      </div>

      <form action="/admin/financial-reports" method="GET" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 panel:grid-cols-3">
           <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_FINANCIAL_REPORTS.searchLabel}</label>
             <div className="relative">
               <Icon name="search" size="compact" className="absolute right-3 top-3 text-ink-3" />
               <input 
                 type="text" 
                 name="q"
                 defaultValue={q}
                 placeholder={ADMIN_FINANCIAL_REPORTS.searchPlaceholder} 
                 className="w-full rounded-lg border border-line-2 pl-3 pr-9 py-2 text-sm" 
               />
             </div>
           </div>
           
           <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_FINANCIAL_REPORTS.doctorLabel}</label>
             <select name="doctor" defaultValue={doctorId} className="rounded-lg border border-line-2 px-3 py-2 text-sm text-ink-2">
                <option value="">{ADMIN_FINANCIAL_REPORTS.allDoctors}</option>
                {uniqueDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
             </select>
           </div>

           <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-3">{ADMIN_FINANCIAL_REPORTS.statusLabel}</label>
              <div className="flex flex-wrap gap-2">
                 <button type="submit" name="bucket" value="" className={`rounded-full px-4 py-2 text-xs font-semibold ${bucket === '' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_FINANCIAL_REPORTS.filters.all}</button>
                 <button type="submit" name="bucket" value="past" className={`rounded-full px-4 py-2 text-xs font-semibold ${bucket === 'past' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_FINANCIAL_REPORTS.filters.past}</button>
                 <button type="submit" name="bucket" value="awaiting" className={`rounded-full px-4 py-2 text-xs font-semibold ${bucket === 'awaiting' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_FINANCIAL_REPORTS.filters.awaiting}</button>
                 <button type="submit" name="bucket" value="due" className={`rounded-full px-4 py-2 text-xs font-semibold ${bucket === 'due' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_FINANCIAL_REPORTS.filters.due}</button>
              </div>
           </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
           <a href="/admin/financial-reports" className="rounded-lg border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 flex items-center justify-center hover:bg-surface-2 transition-colors">
             {ADMIN_FINANCIAL_REPORTS.clearFilters}
           </a>
           <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-600 transition-colors">
              <Icon name="filter" size="compact" /> {ADMIN_FINANCIAL_REPORTS.applyFilters}
           </button>
        </div>
      </form>

      <section className="flex flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
           <h2 className="font-bold text-ink">{ADMIN_FINANCIAL_REPORTS.table.title}</h2>
           <span className="rounded-pill bg-surface-2 px-3 py-1 text-xs text-ink-3">{toPersianDigits(rows.length)} {ADMIN_FINANCIAL_REPORTS.table.countSuffix}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm text-right">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2/50 text-ink-3">
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.customer}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.service}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.doctor}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.dueDate}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.amount}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.status}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.follower}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.lastAction}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.result}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.nextFollowUp}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_FINANCIAL_REPORTS.table.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-ink-3 text-sm">
                    {ADMIN_FINANCIAL_REPORTS.table.empty}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{row.customerName[0]}</span>
                        <span className="font-semibold text-ink">{row.customerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-ink-2">{row.serviceName}</td>
                    <td className="px-4 py-4 text-ink-2">{row.doctorName}</td>
                    <td className="px-4 py-4 text-ink-3">{row.dueDate}</td>
                    <td className="px-4 py-4 font-bold text-ink">{formatMoney(row.amount)}</td>
                    <td className="px-4 py-4">
                       <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-1 text-xs font-semibold text-ink-2">
                         <span className="size-1.5 rounded-full bg-danger"></span> {row.statusLabel}
                       </span>
                    </td>
                    <td className="px-4 py-4 text-ink-2">{row.followerName}</td>
                    <td className="px-4 py-4 text-ink-2 text-xs whitespace-pre-line">{row.lastAction}</td>
                    <td className="px-4 py-4 text-ink-2 text-xs">{row.result}</td>
                    <td className="px-4 py-4">
                       <span className="rounded-pill bg-warn-bg px-2 py-1 text-xs font-semibold text-warn">{row.nextFollowUp}</span>
                    </td>
                    <td className="px-4 py-4">
                       <button className="flex items-center gap-1 rounded-lg border border-line-2 px-2 py-1 text-xs text-ink-2 hover:bg-surface-2">
                         <Icon name="view" size="compact" /> {ADMIN_FINANCIAL_REPORTS.table.details}
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}