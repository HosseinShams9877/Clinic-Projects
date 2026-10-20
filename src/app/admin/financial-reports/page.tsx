import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { realClock } from '@/core/lib/clock'
import { ADMIN_FINANCIAL_REPORTS } from '@/app/catalog'
import { clinicDebts } from '@/modules/debts'
import { loadDoctorNamesByUserId } from '@/app/_customers/page-data'
import type { DebtRow } from '@/modules/debts'
import { DebtsReportClient } from '@/app/_components/DebtsReportClient'

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
    const allRows = Object.values(debts).flat() as DebtRow[]
    const allDoctorIds = Array.from(new Set(allRows.map((d) => d.doctorId).filter(Boolean)))
    return {
      debts,
      doctorNames: await loadDoctorNamesByUserId(tx, session.tenantId, allDoctorIds),
    }
  })

  const uniqueDoctors = Object.entries(data.doctorNames).map(([id, name]) => ({ id, name }))
  const allRows = Object.values(data.debts).flat() as DebtRow[]

  const rows = allRows.filter((row) => {
    if (q) {
      const term = q.toLowerCase()
      const name = `${row.customerFirstName} ${row.customerLastName ?? ''}`.toLowerCase()
      if (!name.includes(term)) return false
    }
    if (doctorId && row.doctorId !== doctorId) {
      return false
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
    <DebtsReportClient
      rows={rows}
      uniqueDoctors={uniqueDoctors}
      weekDueCount={weekDueCount}
      activeDebtorsCount={activeDebtorsCount}
      followedTodayCount={followedTodayCount}
      awaitingResultCount={awaitingResultCount}
      basePath="/admin/financial-reports"
      q={q}
      doctorId={doctorId}
      bucket={bucket}
    />
  )
}