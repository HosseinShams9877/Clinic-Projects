import type { Metadata } from 'next'
import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { InstallmentsTable } from '@/app/_payments/installments-table'
import { listInstallments } from '@/modules/payments'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'

export const metadata: Metadata = { title: ADMIN_INSTALLMENTS.title }

export default async function ReceptionInstallmentsPage() {
  const session = await requireStaffPanel('reception')
  
  const rows = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    return await listInstallments(tx, session.tenantId)
  })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{ADMIN_INSTALLMENTS.heading}</h1>
        <p className="mt-1 text-sm text-ink-2">{ADMIN_INSTALLMENTS.subtitle}</p>
      </header>
      
      <InstallmentsTable rows={rows} />
    </div>
  )
}