'use client'

import { useState } from 'react'
import { formatMoney, formatNumber, toPersianDigits } from '@/core/localization'
import { ADMIN_FINANCIAL_REPORTS } from '@/app/catalog'
import { Icon } from '@/core/components/icons'
import type { DebtRow } from '@/modules/debts'
import { DebtDetailsDialog } from '@/app/_components/DebtDetailsDialog'

export function DebtsReportClient({
  rows,
  uniqueDoctors,
  weekDueCount,
  activeDebtorsCount,
  followedTodayCount,
  awaitingResultCount,
  basePath,
  q,
  doctorId,
  bucket,
}: {
  rows: DebtRow[]
  uniqueDoctors: { id: string, name: string }[]
  weekDueCount: number
  activeDebtorsCount: number
  followedTodayCount: number
  awaitingResultCount: number
  basePath: string
  q: string
  doctorId: string
  bucket: string
}) {
  const [selectedRow, setSelectedRow] = useState<DebtRow | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{ADMIN_FINANCIAL_REPORTS.heading}</h1>
        <p className="text-sm text-ink-2">{ADMIN_FINANCIAL_REPORTS.subtitle}</p>
      </div>

      {/* باکس هشدار/اطلاعات */}
      <div className="flex items-start gap-3 rounded-2xl bg-info-bg/10 px-4 py-3 text-sm text-info border border-info/20">
        <Icon name="info" size="card" />
        <span>{ADMIN_FINANCIAL_REPORTS.alert}</span>
      </div>

      {/* کارت‌های KPI */}
      <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
        <div className="flex flex-row-reverse items-center justify-between rounded-2xl border border-line/50 bg-surface px-4 py-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-bg/20 text-info">
            <Icon name="calendar" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.weekDue}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(weekDueCount)}</span>
          </span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-2xl border border-line/50 bg-surface px-4 py-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-bg/20 text-danger">
            <Icon name="customers" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.activeDebtors}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(activeDebtorsCount)}</span>
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.units.person}</span>
          </span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-2xl border border-line/50 bg-surface px-4 py-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok-bg/20 text-ok">
            <Icon name="success" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.followedToday}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(followedTodayCount)}</span>
          </span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-2xl border border-line/50 bg-surface px-4 py-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-bg/20 text-warn">
            <Icon name="clock" size="card" />
          </span>
          <span className="flex flex-col items-end">
            <span className="text-xs text-ink-3">{ADMIN_FINANCIAL_REPORTS.kpi.awaitingResult}</span>
            <span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(awaitingResultCount)}</span>
          </span>
        </div>
      </div>

      {/* فرم فیلترها */}
      <form action={basePath} method="GET" className="flex flex-col gap-4 rounded-2xl border border-line/50 bg-surface p-5 shadow-sm">
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
                 className="w-full rounded-xl border border-line-2 pl-3 pr-9 py-2.5 text-sm bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all" 
               />
             </div>
           </div>
           
           <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_FINANCIAL_REPORTS.doctorLabel}</label>
             <select name="doctor" defaultValue={doctorId} className="rounded-xl border border-line-2 px-3 py-2.5 text-sm text-ink-2 bg-surface focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all">
                <option value="">{ADMIN_FINANCIAL_REPORTS.allDoctors}</option>
                {uniqueDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
             </select>
           </div>

           <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-3">{ADMIN_FINANCIAL_REPORTS.statusLabel}</label>
              <div className="flex flex-wrap gap-2">
                 <button type="submit" name="bucket" value="" className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${bucket === '' ? 'bg-brand text-ink-inverse shadow-brand' : 'border border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'}`}>{ADMIN_FINANCIAL_REPORTS.filters.all}</button>
                 <button type="submit" name="bucket" value="past" className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${bucket === 'past' ? 'bg-brand text-ink-inverse shadow-brand' : 'border border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'}`}>{ADMIN_FINANCIAL_REPORTS.filters.past}</button>
                 <button type="submit" name="bucket" value="awaiting" className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${bucket === 'awaiting' ? 'bg-brand text-ink-inverse shadow-brand' : 'border border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'}`}>{ADMIN_FINANCIAL_REPORTS.filters.awaiting}</button>
                 <button type="submit" name="bucket" value="due" className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${bucket === 'due' ? 'bg-brand text-ink-inverse shadow-brand' : 'border border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'}`}>{ADMIN_FINANCIAL_REPORTS.filters.due}</button>
              </div>
           </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line/40 pt-4">
           <a href={basePath} className="rounded-xl border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 bg-surface flex items-center justify-center hover:bg-surface-3 hover:text-ink transition-colors">
             {ADMIN_FINANCIAL_REPORTS.clearFilters}
           </a>
           <button type="submit" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-700 shadow-brand ring-1 ring-brand-300 ring-offset-2 transition-all">
              <Icon name="filter" size="compact" /> {ADMIN_FINANCIAL_REPORTS.applyFilters}
           </button>
        </div>
      </form>

      {/* جدول گزارش */}
      <section className="flex flex-col rounded-2xl border border-line/50 bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-line/40 px-5 py-4 bg-surface-2">
           <h2 className="font-bold text-ink">{ADMIN_FINANCIAL_REPORTS.table.title}</h2>
           <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-ink-2 shadow-sm">{toPersianDigits(rows.length)} {ADMIN_FINANCIAL_REPORTS.table.countSuffix}</span>
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
                  <tr key={row.appointmentId} className="border-b border-line/50 last:border-0 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{row.customerFirstName[0]}</span>
                        <span className="font-semibold text-ink">{row.customerFirstName} {row.customerLastName ?? ''}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-ink-2">{row.serviceName ?? '—'}</td>
                    <td className="px-4 py-4 text-ink-2">{row.doctorName}</td>
                    <td className="px-4 py-4 text-ink-3">{row.dueLocalDate}</td>
                    <td className="px-4 py-4 font-bold text-ink tabular-nums">{formatMoney(row.balance)}</td>
                    <td className="px-4 py-4">
                       <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-semibold text-ink-2">
                         <span className="size-1.5 rounded-full bg-danger"></span> {row.daysOverdue > 0 ? `${row.daysOverdue} روز گذشته` : 'در انتظار'}
                       </span>
                    </td>
                    <td className="px-4 py-4 text-ink-2">—</td>
                    <td className="px-4 py-4 text-ink-2 text-xs">{row.lastFollowUp ? 'پیگیری شده' : '—'}</td>
                    <td className="px-4 py-4 text-ink-2 text-xs">—</td>
                    <td className="px-4 py-4">
                       <span className="rounded-full bg-warn-bg px-2 py-1 text-xs font-semibold text-warn">—</span>
                    </td>
                    <td className="px-4 py-4">
                       <button 
                         onClick={() => setSelectedRow(row)}
                         className="flex items-center gap-1 rounded-xl border border-line-2 px-3 py-1.5 text-xs font-semibold text-ink-2 bg-surface hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                       >
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

      <DebtDetailsDialog 
        isOpen={!!selectedRow} 
        onClose={() => setSelectedRow(null)} 
        row={selectedRow} 
      />
    </div>
  )
}