import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { listInstallments } from '@/modules/payments'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'
import { InstallmentsTable } from '@/app/_payments/installments-table'
import { Icon } from '@/core/components/icons'
import { formatMoney, formatNumber } from '@/core/localization'
import { realClock } from '@/core/lib/clock'

export const metadata: Metadata = { title: ADMIN_INSTALLMENTS.title }

// 👈 اضافه شد تا دیتا کش نشه و مبالغ همیشه تازه باشن
export const dynamic = 'force-dynamic'

export default async function ReceptionInstallmentsPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> 
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  
  const q = typeof params.q === 'string' ? params.q : ''
  const doctorId = typeof params.doctor === 'string' ? params.doctor : ''
  const bucket = typeof params.bucket === 'string' ? params.bucket : ''
  const type = typeof params.type === 'string' ? params.type : 'ALL'

  const allRows = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    return await listInstallments(tx, session.tenantId)
  })

  const today = realClock()
  const todayTime = today.getTime()

  const rows = allRows.filter((row) => {
    if (q) {
      const customerName = `${row.appointment.customer?.firstName} ${row.appointment.customer?.lastName ?? ''}`.toLowerCase()
      const mobile = row.appointment.customer?.mobile || ''
      const serviceName = row.appointment.service?.name?.toLowerCase() || ''
      if (!customerName.includes(q.toLowerCase()) && !mobile.includes(q) && !serviceName.includes(q.toLowerCase())) {
        return false
      }
    }

    if (doctorId && row.appointment.doctorId !== doctorId) {
      return false
    }

    if (type !== 'ALL') {
      if (type === 'INSTALLMENT' && row.note === 'CHEQUE') return false
      if (type === 'CHEQUE' && row.note !== 'CHEQUE') return false
    }

    if (bucket) {
      const dueTime = new Date(row.dueAt).getTime()
      const diffDays = Math.ceil((dueTime - todayTime) / (1000 * 3600 * 24))
      
      if (bucket === 'today' && diffDays !== 0) return false
      if (bucket === 'tomorrow' && diffDays !== 1) return false
      if (bucket === 'this_week' && (diffDays < 0 || diffDays > 7)) return false
      if (bucket === 'this_month' && (diffDays < 0 || diffDays > 30)) return false
    }

    return true
  })

  // 👈 دقیقاً مثل ادمین: فقط مبلغ باقی‌مانده رو جمع می‌زنیم
  const totalAmount = rows.reduce((sum, r) => sum + (r.amount - r.paidAmount), 0n)
  
  const todayCount = rows.filter(r => Math.ceil((new Date(r.dueAt).getTime() - todayTime) / (1000 * 3600 * 24)) === 0).length
  const tomorrowCount = rows.filter(r => Math.ceil((new Date(r.dueAt).getTime() - todayTime) / (1000 * 3600 * 24)) === 1).length

  const uniqueDoctorsMap = new Map()
  allRows.forEach(r => {
    if (r.appointment.doctor) {
      uniqueDoctorsMap.set(r.appointment.doctorId, `${r.appointment.doctor.firstName} ${r.appointment.doctor.lastName || ''}`)
    }
  })
  const doctorsList = Array.from(uniqueDoctorsMap.entries())

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{ADMIN_INSTALLMENTS.heading}</h1>
        <p className="text-sm text-ink-2">{ADMIN_INSTALLMENTS.subtitle}</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-sm text-info border border-info/20">
        <Icon name="info" size="card" />
        <span>{ADMIN_INSTALLMENTS.alert}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-bg text-info"><Icon name="calendar" size="card" /></span>
          <span className="flex flex-col items-end"><span className="text-xs text-ink-3">{ADMIN_INSTALLMENTS.kpi.dueToday}</span><span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(todayCount)}</span></span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-bg text-warn"><Icon name="calendar" size="card" /></span>
          <span className="flex flex-col items-end"><span className="text-xs text-ink-3">{ADMIN_INSTALLMENTS.kpi.dueTomorrow}</span><span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(tomorrowCount)}</span></span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-bg text-info"><Icon name="clock" size="card" /></span>
          <span className="flex flex-col items-end"><span className="text-xs text-ink-3">{ADMIN_INSTALLMENTS.kpi.next7Days}</span><span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatNumber(3)}</span></span>
        </div>
        <div className="flex flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok-bg text-ok"><Icon name="debt" size="card" /></span>
          <span className="flex flex-col items-end"><span className="text-xs text-ink-3">{ADMIN_INSTALLMENTS.kpi.totalUpcoming}</span><span className="mt-1 text-lg font-bold text-ink tabular-nums">{formatMoney(totalAmount)}</span></span>
        </div>
      </div>

      <form action="/reception/installments" method="GET" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 panel:grid-cols-3">
           <div className="relative">
             <Icon name="search" size="compact" className="absolute right-3 top-3 text-ink-3" />
             <input type="text" name="q" defaultValue={q} placeholder={ADMIN_INSTALLMENTS.searchPlaceholder} className="w-full rounded-lg border border-line-2 pl-3 pr-9 py-2 text-sm" />
           </div>
           <select name="doctor" defaultValue={doctorId} className="rounded-lg border border-line-2 px-3 py-2 text-sm text-ink-2">
              <option value="">{ADMIN_INSTALLMENTS.allDoctors}</option>
              {doctorsList.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
           </select>
           <select name="type" defaultValue={type} className="rounded-lg border border-line-2 px-3 py-2 text-sm text-ink-2">
              <option value="ALL">{ADMIN_INSTALLMENTS.filterAll}</option>
              <option value="INSTALLMENT">{ADMIN_INSTALLMENTS.filterInstallment}</option>
              <option value="CHEQUE">{ADMIN_INSTALLMENTS.filterCheque}</option>
           </select>
        </div>

        <div className="flex flex-wrap gap-2">
           <button type="submit" name="bucket" value="" className={`rounded-full px-5 py-2 text-sm font-semibold ${bucket === '' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_INSTALLMENTS.filterAll}</button>
           <button type="submit" name="bucket" value="today" className={`rounded-full px-5 py-2 text-sm font-semibold ${bucket === 'today' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_INSTALLMENTS.filterToday}</button>
           <button type="submit" name="bucket" value="tomorrow" className={`rounded-full px-5 py-2 text-sm font-semibold ${bucket === 'tomorrow' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_INSTALLMENTS.filterTomorrow}</button>
           <button type="submit" name="bucket" value="this_week" className={`rounded-full px-5 py-2 text-sm font-semibold ${bucket === 'this_week' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_INSTALLMENTS.filterThisWeek}</button>
           <button type="submit" name="bucket" value="this_month" className={`rounded-full px-5 py-2 text-sm font-semibold ${bucket === 'this_month' ? 'bg-brand text-ink-inverse' : 'border border-line-2 bg-surface text-ink-2'}`}>{ADMIN_INSTALLMENTS.filterThisMonth}</button>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
           <a href="/reception/installments" className="rounded-lg border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 flex items-center justify-center hover:bg-surface-2 transition-colors">{ADMIN_INSTALLMENTS.clearFilters}</a>
           <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-600 transition-colors"><Icon name="filter" size="compact" /> {ADMIN_INSTALLMENTS.applyFilters}</button>
        </div>
      </form>

      {/* 👈 استفاده از همون کامپوننت ادمین همراه با پاس دادن پنل منشی */}
      <InstallmentsTable rows={rows} panel="reception" />
    </div>
  )
}