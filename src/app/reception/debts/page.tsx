import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { formatNumber, fromUtcInstant } from '@/core/localization'
import { Icon } from '@/core/components/icons'

import { DEBTS_PAGE } from '@/app/catalog'
import { loadDoctorNamesByUserId } from '@/app/_customers/page-data'
import { clinicDebts, readDebtSettings } from '@/modules/debts'
import { paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { DebtsKpi } from '@/app/admin/debts/_components/DebtsKpi'
import { BucketChips } from '@/app/admin/debts/_components/BucketChips'
import { asString, bucketCounts, allDebtRows, bucketFromParam, matchesQuery } from '@/app/admin/debts/_components/helpers'
import { DebtsTable } from '@/app/_debts/debts-table' // 👈 استفاده از جدول مشترک

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: DEBTS_PAGE.reception.title }

export default async function ReceptionDebtsPage({ searchParams }: { searchParams: any }) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  
  const query = asString(params.q)
  const doctorId = asString(params.doctor)
  const bucket = bucketFromParam(params.bucket)
  const now = realClock()

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const settings = await readDebtSettings(tx, session.tenantId)
    const buckets = await clinicDebts({ tx, ctx: session.permissions, now })
    const rows = allDebtRows(buckets)
    const allDoctorIds = Array.from(new Set(rows.map(r => r.doctorId)))
    
    const serviceNames: Record<string, string> = {}
    rows.forEach(row => {
      if (row.serviceId && row.serviceName) serviceNames[row.serviceId] = row.serviceName
    })

    return {
      buckets,
      serviceNames,
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
  
  const over30Count = data.buckets.overdue30?.length ?? 0
  const between1and7Count = data.buckets.overdue7?.length ?? 0
  const uniqueDoctors = Object.entries(data.doctorNames).map(([id, name]) => ({ id, name }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{DEBTS_PAGE.reception.lead}</p>
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

      <form action="/reception/debts" method="GET" className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-5">
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
        </div>
        
        <div className="flex justify-end gap-2 border-t border-line pt-4">
           <a href="/reception/debts" className="rounded-lg border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 flex items-center justify-center">پاک کردن فیلترها</a>
           <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2">
              <Icon name="filter" size="compact" /> اعمال فیلترها
           </button>
        </div>
      </form>

      {/* 👈 استفاده از DebtsTable و پاس دادن today */}
      <DebtsTable
        rows={slice}
        showActions
        followUpsMap={{}}
        panel="reception"
        today={today}
      />
      
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm">
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
            return qs === '' ? '/reception/debts' : `/reception/debts?${qs}`
          }} 
        />
      </div>
    </div>
  )
}