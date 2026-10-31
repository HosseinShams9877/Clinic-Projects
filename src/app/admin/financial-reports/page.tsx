import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { realClock } from '@/core/lib/clock'
import { ADMIN_FINANCIAL_REPORTS } from '@/app/catalog'
import { loadFinancialReportData } from '@/app/_financial-reports/report-data'
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

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadFinancialReportData({
      tx,
      ctx: session.permissions,
      now: realClock(),
      scope: 'clinic',
      q,
      doctorId,
      bucket,
    }),
  )

  return (
    <DebtsReportClient
      rows={data.rows}
      uniqueDoctors={data.uniqueDoctors}
      weekDueCount={data.weekDueCount}
      activeDebtorsCount={data.activeDebtorsCount}
      followedTodayCount={data.followedTodayCount}
      awaitingResultCount={data.awaitingResultCount}
      summary={data.summary}
      paymentLines={data.paymentLines}
      basePath="/admin/financial-reports"
      q={q}
      doctorId={doctorId}
      bucket={bucket}
    />
  )
}
