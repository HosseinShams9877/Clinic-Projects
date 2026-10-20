'use client'

import { useState } from 'react'
import { formatDate, formatMoney, dateToLocalDate, toPersianDigits } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'
import { Icon } from '@/core/components/icons'
import { ReceptionInstallmentPaymentDialog } from './ReceptionInstallmentPaymentDialog'

interface InstallmentRow {
  readonly id: string
  readonly sequence: number
  readonly amount: bigint
  readonly dueAt: Date
  readonly note: string | null
  readonly appointmentId: string
  readonly payments: readonly { readonly amount: bigint }[]
  readonly appointment: {
    readonly customer: {
      readonly firstName: string
      readonly lastName: string | null
      readonly mobile: string
    } | null
    readonly doctor: {
      readonly firstName: string
      readonly lastName: string | null
    } | null
    readonly service: { readonly name: string } | null
  }
}

export function ReceptionInstallmentsClient({ rows }: { rows: readonly InstallmentRow[] }) {
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentRow | null>(null)

  if (rows.length === 0) {
    return <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">{ADMIN_INSTALLMENTS.table.empty}</p>
  }

  return (
    <>
      <section className="flex flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
           <div className="flex items-center gap-2 font-bold text-ink">
              <Icon name="invoice" size="card" />
              {ADMIN_INSTALLMENTS.table.title}
           </div>
           <span className="rounded-pill bg-surface-2 px-3 py-1 text-xs text-ink-3">
              {toPersianDigits(rows.length)} {ADMIN_INSTALLMENTS.table.countSuffix}
           </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm text-right">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2/50 text-ink-3">
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.customer}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.doctor}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.service}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.dueDate}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.daysRemaining}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.amount}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.stage}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.progress}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const customer = row.appointment.customer
                const doctorName = row.appointment.doctor ? `${row.appointment.doctor.firstName} ${row.appointment.doctor.lastName ?? ''}`.trim() : '—'
                const serviceName = row.appointment.service?.name ?? '—'
                
                const due = new Date(row.dueAt)
                const today = realClock()
                const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 3600 * 24))
                
                const parts = row.note?.split(':') || []
                const totalInstallments = Number(parts[1] || 1)
                const totalAmount = BigInt(parts[3] || row.amount)

                const perInstallmentAmount = row.amount
                const paidSoFar = BigInt(row.sequence - 1) * perInstallmentAmount
                const progressPercent = totalAmount > 0n ? Math.min(100, Number((paidSoFar * 100n) / totalAmount)) : 0

                return (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-bg text-xs font-bold text-info">
                          {customer?.firstName.slice(0, 1)}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-semibold text-ink">{customer ? `${customer.firstName} ${customer.lastName ?? ''}` : '—'}</span>
                          <span className="text-xs text-ink-3 tabular-nums" dir="ltr">{customer?.mobile}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-ink-2">{doctorName}</td>
                    <td className="px-4 py-4 text-ink-2">{serviceName}</td>
                    
                    <td className="px-4 py-4 text-ink-3 tabular-nums">
                      {formatDate(dateToLocalDate(due), 'short')}
                    </td>
                    
                    <td className="px-4 py-4">
                      {diffDays === 0 ? (
                        <span className="inline-flex rounded-pill bg-warn-bg px-2 py-1 text-xs font-semibold text-warn items-center gap-1"><span className="size-1.5 rounded-full bg-warn"></span> {ADMIN_INSTALLMENTS.filters.today}</span>
                      ) : diffDays === 1 ? (
                        <span className="inline-flex rounded-pill bg-info-bg px-2 py-1 text-xs font-semibold text-info items-center gap-1"><span className="size-1.5 rounded-full bg-info"></span> {ADMIN_INSTALLMENTS.filters.tomorrow}</span>
                      ) : diffDays > 1 ? (
                        <span className="inline-flex text-xs text-ink-3">{toPersianDigits(diffDays)} {ADMIN_INSTALLMENTS.daysRemainingSuffix}</span>
                      ) : (
                        <span className="inline-flex rounded-pill bg-danger-bg px-2 py-1 text-xs font-semibold text-danger items-center gap-1"><span className="size-1.5 rounded-full bg-danger"></span> {ADMIN_INSTALLMENTS.filters.past}</span>
                      )}
                    </td>
                    
                    <td className="px-4 py-4 font-bold text-ink tabular-nums">{formatMoney(perInstallmentAmount)}</td>
                    
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-ink-2 whitespace-nowrap">{ADMIN_INSTALLMENTS.table.installmentPrefix} {toPersianDigits(row.sequence)} {ADMIN_INSTALLMENTS.table.of} {toPersianDigits(totalInstallments)}</span>
                        <span className="text-xs text-ink-3">{ADMIN_INSTALLMENTS.table.installmentPrefix}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5 w-32">
                        <span className="text-[10px] text-ink-3">{formatMoney(paidSoFar)} {ADMIN_INSTALLMENTS.table.of} {formatMoney(totalAmount)} {ADMIN_INSTALLMENTS.table.million}</span>
                        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken"><div className="h-full bg-brand" style={{ width: `${progressPercent}%` }} /></div>
                        <span className="text-[10px] text-ink-3">{ADMIN_INSTALLMENTS.table.paidPercent} {toPersianDigits(progressPercent)}٪</span>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedInstallment(row)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-600 transition-colors whitespace-nowrap shadow-sm">{ADMIN_INSTALLMENTS.table.payButton}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedInstallment && (
        <ReceptionInstallmentPaymentDialog
          isOpen={!!selectedInstallment}
          onClose={() => setSelectedInstallment(null)}
          installmentId={selectedInstallment.id}
          customerName={`${selectedInstallment.appointment.customer?.firstName || ''} ${selectedInstallment.appointment.customer?.lastName || ''}`.trim()}
          amountDue={selectedInstallment.amount}
          onSuccess={() => setSelectedInstallment(null)}
        />
      )}
    </>
  )
}