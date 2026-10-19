import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { formatNumber, fromUtcInstant } from '@/core/localization'
import { Icon } from '@/core/components/icons'

import { DEBTS_PAGE } from '@/app/catalog'
import { loadDoctorNamesByUserId } from '@/app/_customers/page-data'
import { clinicDebts, readDebtSettings } from '@/modules/debts'
import { listServices } from '@/modules/services'
import { paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { DebtsKpi } from './_components/DebtsKpi'
import { BucketChips } from './_components/BucketChips'
import { asString, bucketCounts, allDebtRows, bucketFromParam, matchesQuery } from './_components/helpers'
import { DebtRowView, Th } from './_components/DebtRowView'

export const metadata: Metadata = { title: 'بدهکاری‌ها' }

const DEBT_COLUMNS = [
  { key: 'customer', width: 'w-[16%]', align: 'start' },
  { key: 'doctor', width: 'w-[10%]', align: 'start' },
  { key: 'service', width: 'w-[12%]', align: 'start' },
  { key: 'due', width: 'w-[10%]', align: 'start' },
  { key: 'status', width: 'w-[10%]', align: 'start' },
  { key: 'balance', width: 'w-[12%]', align: 'start' },
  { key: 'stage', width: 'w-[10%]', align: 'start' },
  { key: 'followUp', width: 'w-[10%]', align: 'start' },
  { key: 'nextFollowUp', width: 'w-[8%]', align: 'start' },
  { key: 'action', width: 'w-[15%]', align: 'start' },
] as const

export default async function AdminDebtsPage({ searchParams }: { searchParams: any }) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  
  const query = asString(params.q)
  const doctorId = asString(params.doctor)
  const bucket = bucketFromParam(params.bucket)
  const now = realClock()

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const settings = await readDebtSettings(tx, session.tenantId)
    const [buckets, collectedRial, services] = await Promise.all([
      clinicDebts({ tx, ctx: session.permissions, now }),
      paymentsThisMonth(tx, session.tenantId, now, settings.utcOffsetMinutes),
      listServices({ tx, ctx: session.permissions }),
    ])
    const rows = allDebtRows(buckets)
    const allDoctorIds = Array.from(new Set(rows.map(r => r.doctorId)))
    
    return {
      buckets,
      collectedRial,
      serviceNames: Object.fromEntries(services.map((service) => [service.id, service.name])),
      doctorNames: await loadDoctorNamesByUserId(tx, session.tenantId, allDoctorIds),
      offset: settings.utcOffsetMinutes,
    } as const
  })

  const today = fromUtcInstant(now, data.offset).localDate
  const allRows = allDebtRows(data.buckets)
  
  const visible = allRows.filter(
    (row) =>
      (doctorId === '' || row.doctorId === doctorId) &&
      (bucket === null || row.bucket === bucket) &&
      matchesQuery(row, query)
  )

  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(visible, page)
  
  // 👈 درست کردن اسم کلیدها
  const over30Count = data.buckets.overdue30?.length ?? 0
  const between1and7Count = data.buckets.overdue7?.length ?? 0

  const uniqueDoctors = Object.entries(data.doctorNames).map(([id, name]) => ({ id, name }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">بدهکاری‌ها</h1>
        <p className="text-sm text-ink-2">سررسیدهای پرداخت‌نشده و نیازمند پیگیری</p>
      </div>
      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-sm text-info border border-info/20">
        <Icon name="info" size="card" />
        <span>کل بدهی کلینیک به بدهی‌های باز است؛ ثبت پرداخت و پیگیری در صفحه پیشخوان انجام می‌شود.</span>
      </div>

      <DebtsKpi
        totalRial={allRows.reduce((total, row) => total + row.balance, 0n)}
        totalDebtors={new Set(allRows.map((row) => row.customerId)).size}
        over30Count={over30Count}
        between1and7Count={between1and7Count}
      />

      <form action="/admin/debts" method="GET" className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 panel:grid-cols-3">
          <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-ink-3">جستجو</label>
             <input type="text" name="q" defaultValue={query} placeholder="نام مشتری، تلفن یا خدمت..." className="rounded-lg border border-line-2 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-ink-3">پزشک</label>
             <select name="doctor" defaultValue={doctorId} className="rounded-lg border border-line-2 px-3 py-2 text-sm">
                <option value="">همه پزشکان</option>
                {uniqueDoctors.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
             </select>
          </div>
          <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-ink-3">بازه مبلغ (تومان)</label>
             <div className="flex items-center gap-2">
                <input type="text" placeholder="از مبلغ" className="w-full rounded-lg border border-line-2 px-3 py-2 text-sm" />
                <span>-</span>
                <input type="text" placeholder="تا مبلغ" className="w-full rounded-lg border border-line-2 px-3 py-2 text-sm" />
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 panel:grid-cols-2">
           <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-3">قدمت سررسید</label>
              <BucketChips
                active={bucket}
                counts={bucketCounts(allRows)}
                total={allRows.length}
                query={query}
                doctorId={doctorId}
              />
           </div>
           <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-3">نوع بدهی</label>
              <div className="flex gap-2">
                 <button type="button" className="rounded-full bg-brand px-6 py-2 text-sm font-semibold text-ink-inverse">همه</button>
                 <button type="button" className="rounded-full border border-line-2 bg-surface px-6 py-2 text-sm font-semibold text-ink-2">قسط</button>
                 <button type="button" className="rounded-full border border-line-2 bg-surface px-6 py-2 text-sm font-semibold text-ink-2">چک</button>
              </div>
           </div>
        </div>
        
        <div className="flex justify-end gap-2 border-t border-line pt-4">
           <a href="/admin/debts" className="rounded-lg border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 flex items-center justify-center">پاک کردن فیلترها</a>
           <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2">
              <Icon name="filter" size="compact" /> اعمال فیلترها
           </button>
        </div>
      </form>

      <section className="flex flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-4 font-bold text-ink">
           <span>لیست بدهکاری‌ها</span>
           <span className="rounded bg-surface-2 px-3 py-1 text-xs text-ink-3">{formatNumber(visible.length)} مورد</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] table-fixed border-collapse text-sm text-right">
            <colgroup>
              {DEBT_COLUMNS.map((column) => (
                <col key={column.key} className={column.width} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-line-2 text-ink-3 bg-surface-2/50">
                {DEBT_COLUMNS.map((column) => (
                  <Th key={column.key} align={column.align}>
                    {column.key === 'customer' && 'مشتری'}
                    {column.key === 'doctor' && 'پزشک'}
                    {column.key === 'service' && 'خدمت'}
                    {column.key === 'due' && 'سررسید'}
                    {column.key === 'status' && 'روزهای گذشته'}
                    {column.key === 'balance' && 'مبلغ'}
                    {column.key === 'stage' && 'مرحله'}
                    {column.key === 'followUp' && 'آخرین پیگیری'}
                    {column.key === 'nextFollowUp' && 'پیگیری بعدی'}
                    {column.key === 'action' && 'عملیات'}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <DebtRowView
                  key={row.appointmentId}
                  row={row}
                  today={today}
                  serviceName={data.serviceNames[row.serviceId ?? ''] ?? null}
                  doctorName={data.doctorNames[row.doctorId] ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        <footer className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink-3">نمایش {formatNumber(slice.length)} مورد</span>
          <Pagination 
            page={page} 
            totalPages={totalPages} 
            hrefFor={(p) => {
              const sp = new URLSearchParams()
              if (query !== '') sp.set('q', query)
              if (doctorId !== '') sp.set('doctor', doctorId)
              if (bucket !== null) sp.set('bucket', bucket)
              if (p > 1) sp.set('page', String(p))
              const qs = sp.toString()
              return qs === '' ? '/admin/debts' : `/admin/debts?${qs}`
            }} 
          />
        </footer>
      </section>
    </div>
  )
}