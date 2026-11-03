import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { realClock } from '@/core/lib/clock'
import { ADMIN_FINANCIAL_REPORTS } from '@/app/catalog'
import { loadFinancialReportData } from '@/app/_financial-reports/report-data'
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

  // 👈 محدوده‌ی دیدِ پزشک: فقط نوبت‌های خودش («doctorDebts» جای فیلترِ دستی).
  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadFinancialReportData({
      tx,
      ctx: session.permissions,
      now: realClock(),
      scope: 'doctor',
      q,
      doctorId: '',
      bucket,
    }),
  )

  return (
    <DoctorFinancialReportsClient
      rows={data.rows}
      weekDueCount={data.weekDueCount}
      activeDebtorsCount={data.activeDebtorsCount}
      followedTodayCount={data.followedTodayCount}
      awaitingResultCount={data.awaitingResultCount}
      summary={data.summary}
      paymentLines={data.paymentLines}
      followUps={data.followUps}
      basePath="/doctor/financial-reports"
      q={q}
      bucket={bucket}
    />
  )
}
