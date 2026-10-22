'use client'

import { useState } from 'react'
import { cx } from '@/core/lib'
import { formatMoney, toPersianDigits } from '@/core/localization'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'

import {
  INJECTION_AREA_LABELS,
  INJECTION_MATERIAL_LABELS,
} from '@/modules/injections'

export type TreatmentInjection = {
  id: string
  area: string | null
  material: string | null
  amount: string | null
  amountUnit: string | null
  brand: string | null
  depth: string | null
  technique: string | null
  note: string | null
}

export type TreatmentHistoryRow = {
  id: string
  kind: 'appointment' | 'standalone-injection'
  localDate: string
  localTime: string
  doctorName: string | null
  serviceName: string | null
  status: string
  note: string | null
  area: string | null
  material: string | null
  amount: string | null
  amountUnit: string | null
  brand: string | null
  depth: string | null
  technique: string | null
  recommendations: string | null
  priceAtBooking: bigint
  injections: TreatmentInjection[]
}

interface TreatmentHistoryTabProps {
  customerName: string
  customerAge: string
  customerPhone: string
  visitsCount: number
  pendingCount: number
  lastVisitDate: string | null
  historyRows: TreatmentHistoryRow[]
}

export function TreatmentHistoryTab({
  visitsCount,
  pendingCount,
  lastVisitDate,
  historyRows,
}: TreatmentHistoryTabProps) {
  const [search, setSearch] = useState('')
  const [filterDoctor, setFilterDoctor] = useState('all')
  const [filterService, setFilterService] = useState('all')
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'pending' | 'completed'>('all')

  const doctors = Array.from(new Set(historyRows.map((r) => r.doctorName).filter(Boolean))) as string[]
  const services = Array.from(new Set(historyRows.map((r) => r.serviceName).filter(Boolean))) as string[]

  const filteredRows = historyRows.filter((row) => {
    const s = search.toLowerCase()
    
    const matchSearch =
      (row.note && row.note.toLowerCase().includes(s)) ||
      (row.area && row.area.toLowerCase().includes(s)) ||
      (row.material && row.material.toLowerCase().includes(s)) ||
      row.injections.some(inj => 
        (inj.area && inj.area.toLowerCase().includes(s)) ||
        (inj.material && inj.material.toLowerCase().includes(s)) ||
        (inj.note && inj.note.toLowerCase().includes(s))
      )

    const matchDoctor = filterDoctor === 'all' || row.doctorName === filterDoctor
    const matchService = filterService === 'all' || row.serviceName === filterService

    const statusUpper = (row.status || '').toUpperCase()
    const matchTab =
      activeSubTab === 'all' ? true :
      activeSubTab === 'pending' ? statusUpper === 'PENDING' :
      statusUpper !== 'PENDING' && statusUpper !== 'CANCELLED'

    return matchSearch && matchDoctor && matchService && matchTab
  })

  const totalInjections = historyRows.reduce((sum, r) => sum + (r.injections?.length || 0), 0)

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-3 panel:grid-cols-4">
        <StatCard title="جلسات ثبت‌شده" value={toPersianDigits(visitsCount)} tone="bg-brand-50 text-brand" icon="appointment" />
        <StatCard title="در انتظار تأیید" value={toPersianDigits(pendingCount)} tone="bg-warn-bg text-warn" icon="alert" />
        <StatCard title="تزریق‌های ثبت‌شده" value={toPersianDigits(totalInjections)} tone="bg-info-bg text-info" icon="treatment" />
        <StatCard title="آخرین جلسه" value={lastVisitDate ? lastVisitDate : '—'} tone="bg-ok-bg text-ok" icon="calendar" />
      </div>

      <div className="flex w-full flex-col gap-2 rounded-xl border border-line bg-surface p-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="جستجو در شرح اقدام، ماده مصرفی، ناحیه..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-surface"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterService}
            onChange={(e) => setFilterService(e.target.value)}
            className="w-full min-w-[120px] rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand-500 sm:w-auto"
          >
            <option value="all">همه خدمات</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            className="w-full min-w-[120px] rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand-500 sm:w-auto"
          >
            <option value="all">همه پزشکان</option>
            {doctors.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="w-full border-b border-line">
        <div className="flex w-full gap-1 overflow-x-auto scrollbar-none sm:gap-2">
          {[
            { id: 'all', label: 'همه سوابق' },
            { id: 'pending', label: 'در انتظار تأیید' },
            { id: 'completed', label: 'تأیید شده' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
              className={cx(
                'relative shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4',
                activeSubTab === tab.id ? 'text-brand-700' : 'text-ink-3 hover:text-ink'
              )}
            >
              {tab.label}
              {activeSubTab === tab.id && (
                <span className="absolute bottom-0 right-0 left-0 h-0.5 rounded-t bg-brand-700" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-4">
        {filteredRows.length === 0 ? (
          <div className="w-full rounded-xl border border-line bg-surface py-12 text-center text-sm text-ink-3 shadow-sm">
            هیچ سابقه‌ای با این فیلترها یافت نشد.
          </div>
        ) : (
          filteredRows.map((row) => (
            <HistoryCard key={row.id} row={row} />
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, tone, icon }: { title: string; value: string; tone: string; icon: IconName }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 sm:gap-3 sm:px-3.5 sm:py-3">
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-md sm:size-9', tone)}>
        <Icon name={icon} size="compact" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[11px] leading-tight text-ink-3 sm:text-xs">{title}</span>
        <span className="mt-0.5 block truncate text-sm font-bold tabular-nums leading-tight text-ink sm:text-[15px]">
          {value}
        </span>
      </div>
    </div>
  )
}

function HistoryCard({ row }: { row: TreatmentHistoryRow }) {
  const [isOpen, setIsOpen] = useState(true)

  const isPending = row.status.toUpperCase() === 'PENDING'
  const sideBorderColor = isPending ? 'border-r-warn' : 'border-r-ok'
  const badgeColor = isPending ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok'
  const statusLabel = isPending ? 'در انتظار تایید پزشک' : 'تایید شده'

  return (
    <div className={cx(
      "w-full overflow-hidden rounded-xl border border-line border-r-4 bg-surface shadow-sm transition-all",
      sideBorderColor
    )}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full flex-col items-start justify-between gap-3 bg-surface-2/30 p-4 text-right transition-colors hover:bg-surface-2/60 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3">
          <span className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-ink-3 min-w-[50px]">
             <span className="text-[10px] leading-tight mb-0.5">تاریخ</span>
             <span className="text-base font-bold text-ink leading-tight">{toPersianDigits(row.localDate.slice(-2))}</span>
          </span>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-ink sm:text-base">{row.serviceName || 'ویزیت'}</h3>
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', badgeColor)}>
                {isPending && <span className="size-1.5 rounded-full bg-warn" />}
                {statusLabel}
              </span>
              {row.injections && row.injections.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                  {toPersianDigits(row.injections.length)} تزریق
                </span>
              )}
            </div>
            <span className="mt-1 text-xs text-ink-2">
              {row.localTime} • {row.doctorName || 'پزشک نامشخص'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-ink-3">
          <span className={cx('transition-transform duration-200', isOpen && 'rotate-180')}>
            ▼
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-line-2 bg-surface p-5 sm:p-6 flex flex-col gap-5 text-sm">
          
          {row.note && (
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-ink-3 shrink-0">
                <Icon name="info" size="compact" />
                <span className="text-xs">شرح اقدام</span>
              </div>
              <p className="text-ink text-right font-medium">{row.note}</p>
            </div>
          )}

          {/* لیست تزریق‌ها با طراحی فشرده و مرتب */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-ink-3 shrink-0">
              <Icon name="treatment" size="compact" />
              <span className="text-xs">تزریق‌های این جلسه</span>
            </div>
            
            {!row.injections || row.injections.length === 0 ? (
              <p className="text-ink-3 text-right">تزریقی برای این جلسه ثبت نشده است.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {row.injections.map((inj, index) => {
                  const areaLabel = inj.area 
                    ? (INJECTION_AREA_LABELS[inj.area as keyof typeof INJECTION_AREA_LABELS] || inj.area) 
                    : 'نامشخص'
                  const materialLabel = inj.material 
                    ? (INJECTION_MATERIAL_LABELS[inj.material as keyof typeof INJECTION_MATERIAL_LABELS] || inj.material) 
                    : 'نامشخص'
                  const amountLabel = inj.amount
                    ? `${toPersianDigits(inj.amount)} ${inj.amountUnit === 'CC' ? 'سی‌سی' : inj.amountUnit === 'UNIT' ? 'واحد' : inj.amountUnit || ''}`.trim()
                    : null

                  return (
                    <div key={inj.id} className="rounded-lg border border-line-2 bg-surface-2/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* سمت راست: ناحیه و ماده */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <span className="text-xs font-bold text-ink w-12 shrink-0">تزریق {toPersianDigits(index + 1)}</span>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-ink-3">ناحیه:</span>
                          <span className="font-semibold text-ink">{areaLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-ink-3">ماده:</span>
                          <span className="font-semibold text-ink">{materialLabel}</span>
                        </div>
                        {amountLabel && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-ink-3">مقدار:</span>
                            <span className="font-semibold text-ink">{amountLabel}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* سمت چپ: یادداشت تزریق (اگر وجود داشته باشد) */}
                      {inj.note && (
                        <div className="text-xs text-ink-3 truncate sm:max-w-[30%]" title={inj.note}>
                          {inj.note}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-ink-3 shrink-0">
              <Icon name="info" size="compact" />
              <span className="text-xs">توصیه‌های پس از جلسه</span>
            </div>
            {row.recommendations ? (
              <div className="w-full rounded-lg bg-ok-bg/40 p-3 text-ok-800 font-medium text-right">
                {row.recommendations}
              </div>
            ) : (
              <p className="text-ink-3 text-right">توصیه‌ای ثبت نشده است.</p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line-2 pt-4 text-xs text-ink-3">
            <div className="flex items-center gap-1.5">
              <span>هزینه ثبت‌شده: {formatMoney(row.priceAtBooking)}</span>
            </div>
            <button className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-ink">
              <Icon name="download" size="compact" />
              چاپ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}