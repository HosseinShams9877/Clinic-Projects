import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { realClock } from '@/core/lib/clock'
import { ADMIN_FINANCIAL_REPORTS } from '@/app/catalog'
import { clinicDebts } from '@/modules/debts' // 👈 به clinicDebts تغییر کرد
import { loadDoctorNamesByUserId } from '@/app/_customers/page-data'
import type { DebtRow } from '@/modules/debts'
import { DoctorFinancialReportsClient } from './_components/DoctorFinancialReportsClient'

export const metadata: Metadata = { title: ADMIN_FINANCIAL_REPORTS.title }

export default async function DoctorFinancialReportsPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await requireStaffPanel('doctor')
  const params = await searchParams
  
  const q = typeof params.q === 'string' ? params.q : ''
  const bucket = typeof params.bucket === 'string' ? params.bucket : ''

  const now = realClock()
  
  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    // 👈 همه بدهی‌ها رو می‌گیریم
    const allDebts = await clinicDebts({ tx, ctx: session.permissions, now })
    
    // 👈 فیلتر می‌کنیم فقط مال این دکتر
    const myId = session.permissions.userId
    const debts = {
      overdue30: allDebts.overdue30.filter(r => r.doctorId === myId),
      overdue7: allDebts.overdue7.filter(r => r.doctorId === myId),
      overdue: allDebts.overdue.filter(r => r.doctorId === myId),
      dueSoon: allDebts.dueSoon.filter(r => r.doctorId === myId),
    }

    const allRows = Object.values(debts).flat() as DebtRow[]
    const allDoctorIds = Array.from(new Set(allRows.map((d) => d.doctorId).filter(Boolean)))
    return {
      debts,
      doctorNames: await loadDoctorNamesByUserId(tx, session.tenantId, allDoctorIds),
    }
  })

  const allRows = Object.values(data.debts).flat() as DebtRow[]

  const rows = allRows.filter((row) => {
    if (q) {
      const term = q.toLowerCase()
      const name = `${row.customerFirstName} ${row.customerLastName ?? ''}`.toLowerCase()
      if (!name.includes(term)) return false
    }
    if (bucket) {
      if (bucket === 'past' && row.daysOverdue <= 0) return false
      if (bucket === 'awaiting' && row.daysOverdue > 0) return false
    }
    return true
  })

  const weekDueCount = allRows.filter(r => r.daysOverdue <= 7 && r.daysOverdue > 0).length
  const activeDebtorsCount = new Set(allRows.map(r => r.customerId)).size
  const followedTodayCount = allRows.filter(r => r.lastFollowUp?.at && new Date(r.lastFollowUp.at).toDateString() === now.toDateString()).length
  const awaitingResultCount = allRows.filter(r => !r.lastFollowUp).length

  return (
    <DoctorFinancialReportsClient
      rows={rows}
      weekDueCount={weekDueCount}
      activeDebtorsCount={activeDebtorsCount}
      followedTodayCount={followedTodayCount}
      awaitingResultCount={awaitingResultCount}
      basePath="/doctor/financial-reports"
      q={q}
      bucket={bucket}
    />
  )
}