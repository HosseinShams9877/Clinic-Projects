'use client'

import { useState, useTransition } from 'react'
import { formatDate, dateToLocalDate, toPersianDigits, addLocalMonths, toUtcInstant, fromClockParts, asLocalDate } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'
import { Icon } from '@/core/components/icons'
import { InstallmentPaymentDialog } from '@/app/admin/installments/_components/InstallmentPaymentDialog'
import { EditInstallmentDialog } from '@/app/_payments/EditInstallmentDialog'
import { deleteInstallmentAction } from '@/app/_debts/actions'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pagination } from '@/app/_components/Pagination'

import { FollowUpDialog as AdminFollowUpDialog } from '@/app/admin/debts/_components/FollowUpDialog'
import { FollowUpDialog as ReceptionFollowUpDialog } from '@/app/reception/debts/_components/FollowUpDialog'

function formatToman(value: bigint | number | string) {
  const str = value.toString().replace(/[^\d]/g, '')
  if (!str) return '۰'
  const toman = Math.floor(Number(str) / 10)
  const withCommas = toman.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return toPersianDigits(withCommas)
}

interface InstallmentRow {
  readonly id: string
  readonly sequence: number
  readonly amount: bigint
  readonly paidAmount: bigint
  readonly dueAt: Date
  readonly note: string | null
  readonly type: string
  readonly appointmentId: string
  readonly totalPlanAmount: bigint | null
  readonly totalPlanCount: number | null
  readonly intervalMonths: number | null
  readonly appointment: {
    readonly customer: { readonly id?: string; readonly firstName: string; readonly lastName: string | null; readonly mobile: string } | null
    readonly doctor: { readonly firstName: string; readonly lastName: string | null } | null
    readonly service: { readonly name: string } | null
  }
}

const PAGE_SIZE = 10

export function InstallmentsTable({ 
  rows, 
  panel = 'admin' 
}: { 
  readonly rows: ReadonlyArray<InstallmentRow>
  readonly panel?: 'admin' | 'reception' | 'doctor'
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentPage = Number(searchParams.get('page')) || 1

  const [tempAmounts, setTempAmounts] = useState<Record<string, bigint>>({})
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentRow | null>(null)
  const [followUpRow, setFollowUpRow] = useState<InstallmentRow | null>(null)
  const [isPending, startTransition] = useTransition()

  const FollowUpDialog = panel === 'reception' ? ReceptionFollowUpDialog : AdminFollowUpDialog

  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const paginatedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  if (rows.length === 0) {
    return <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">{ADMIN_INSTALLMENTS.table.empty}</p>
  }

  const handleTempAmountChange = (id: string, amount: bigint | null) => {
    if (amount === null) {
      setTempAmounts(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } else {
      setTempAmounts(prev => ({ ...prev, [id]: amount }))
    }
  }

  const handleDelete = (id: string) => {
    if (!confirm('آیا از حذف این قسط مطمئن هستید؟')) return
    startTransition(async () => {
      const res = await deleteInstallmentAction(panel, id)
      if (res.ok) {
        router.refresh()
      } else {
        alert(res.message)
      }
    })
  }

  const hrefFor = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page > 1) {
      params.set('page', String(page))
    } else {
      params.delete('page')
    }
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }

  // 👈 زمان نیمه‌شب به عنوان LocalTime (برای toUtcInstant)
  const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

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
          <table className="w-full min-w-[1250px] table-fixed border-collapse text-sm text-right">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2/50 text-ink-3">
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.customer}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.doctor}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.service}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.dueDate}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.daysRemaining}</th>
                <th className="px-4 py-3 font-semibold text-start">مبلغ کل بدهی</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.amount}</th>
                <th className="px-4 py-3 font-semibold text-start w-[8%]">{ADMIN_INSTALLMENTS.table.columns.stage}</th>
                <th className="px-4 py-3 font-semibold text-start">{ADMIN_INSTALLMENTS.table.columns.progress}</th>
                <th className="px-4 py-3 font-semibold text-start w-[18%]">{ADMIN_INSTALLMENTS.table.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => {
                const customer = row.appointment.customer
                const doctorName = row.appointment.doctor ? `${row.appointment.doctor.firstName} ${row.appointment.doctor.lastName ?? ''}`.trim() : '—'
                const serviceName = row.appointment.service?.name ?? '—'
                
                const totalInstallments = row.totalPlanCount || 1
                const totalAmount = row.totalPlanAmount || row.amount
                const currentTempAmount = tempAmounts[row.id]
                const perInstallmentAmount = currentTempAmount !== undefined ? currentTempAmount : row.amount

                const appointmentRows = rows.filter(r => r.appointmentId === row.appointmentId)
                const totalPaidForAppointment = appointmentRows.reduce((sum, r) => sum + r.paidAmount, 0n)
                
                const remainingForAppointment = totalAmount - totalPaidForAppointment
                const paidSoFar = totalPaidForAppointment > totalAmount ? totalAmount : totalPaidForAppointment

                const safePerInstallment = perInstallmentAmount > 0n ? perInstallmentAmount : 1n
                const paidCount = Math.min(
                  totalInstallments,
                  Math.floor(Number(paidSoFar) / Number(safePerInstallment))
                )
                
                // 👈 محاسبه سررسید دقیق در فرانت‌اند
                let due = new Date(row.dueAt)
                
                // اگر قسط هنوز پرداخت نشده، چک کن ببین تاریخ دستی (OVERRIDE) داریم یا نه
                const isUnpaid = paidSoFar === 0n
                const overrideMatch = row.note?.match(/OVERRIDE:(\d{4}-\d{2}-\d{2})/)
                
                if (isUnpaid && overrideMatch && overrideMatch[1]) {
                  // تاریخ جدیدی که کاربر ویرایش کرده رو نمایش بده
                  due = toUtcInstant(asLocalDate(overrideMatch[1]), MIDNIGHT)
                } else if (paidCount > 0 && row.intervalMonths) {
                  // محاسبات عادی برای مرحله بعد (اگر پرداخت شده)
                  const baseLocalDate = dateToLocalDate(row.dueAt)
                  const nextLocalDate = addLocalMonths(baseLocalDate, paidCount * row.intervalMonths)
                  due = toUtcInstant(nextLocalDate, MIDNIGHT)
                }

                const today = realClock()
                const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 3600 * 24))

                const displaySequence = Math.min(
                  totalInstallments,
                  Math.floor(Number(paidSoFar) / Number(safePerInstallment)) + 1
                )

                const progressPercent = totalAmount > 0n 
                  ? Math.min(100, Math.round(Number((paidSoFar * 100n) / totalAmount))) 
                  : 0

                const customerName = customer ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : 'مشتری'

                return (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-bg text-xs font-bold text-info">
                          {customer?.firstName.slice(0, 1)}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-semibold text-ink">{customerName}</span>
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
                    
                    <td className="px-4 py-4 font-semibold text-brand tabular-nums">
                      {formatToman(totalAmount)}
                    </td>

                    <td className="px-4 py-4 font-bold text-ink tabular-nums">{formatToman(perInstallmentAmount)}</td>
                    
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-ink-2 whitespace-nowrap text-xs">
                          {row.type === 'CHEQUE' ? 'چک' : 'قسط'} {toPersianDigits(displaySequence)} {ADMIN_INSTALLMENTS.table.of} {toPersianDigits(totalInstallments)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5 w-32">
                        <span className="text-[10px] text-ink-3">
                          {formatToman(paidSoFar)} {ADMIN_INSTALLMENTS.table.of} {formatToman(totalAmount)} {ADMIN_INSTALLMENTS.table.million}
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken">
                          <div className="h-full bg-brand" style={{ width: `${progressPercent}%` }} />
                        </div>
                        <span className="text-[10px] text-ink-3">{ADMIN_INSTALLMENTS.table.paidPercent} {toPersianDigits(progressPercent)}٪</span>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => {
                            setSelectedInstallment({
                              ...row,
                              amount: perInstallmentAmount,
                            })
                          }} 
                          className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-ink-inverse hover:bg-brand-600 transition-colors whitespace-nowrap shadow-sm"
                        >
                          {ADMIN_INSTALLMENTS.table.payButton}
                        </button>
                        
                        <button 
                          type="button"
                          onClick={() => setFollowUpRow(row)} 
                          className="grid size-7 place-items-center rounded-lg border border-line-2 text-ink-3 hover:bg-surface-2 hover:text-brand transition-colors"
                          title="ثبت پیگیری"
                        >
                          <Icon name="phone" size="compact" />
                        </button>

                        <EditInstallmentDialog 
                          installmentId={row.id}
                          appointmentId={row.appointmentId}
                          customerId={customer?.id || ''}
                          customerName={customerName}
                          remainingAmount={remainingForAppointment}
                          sequence={row.sequence}
                          currentDueDate={dateToLocalDate(due)}
                          currentAmount={perInstallmentAmount}
                          panel={panel}
                          onTempAmountChange={handleTempAmountChange}
                        />

                        <button 
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          disabled={isPending}
                          className="grid size-7 place-items-center rounded-lg border border-line-2 text-ink-3 hover:bg-danger-bg hover:text-danger hover:border-danger transition-colors disabled:opacity-50"
                          title="حذف قسط"
                        >
                          <Icon name="remove" size="compact" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        <div className="border-t border-line px-4 py-3">
          <Pagination page={currentPage} totalPages={totalPages} hrefFor={hrefFor} />
        </div>
      </section>

      {selectedInstallment && (
        <InstallmentPaymentDialog
          isOpen={!!selectedInstallment}
          onClose={() => setSelectedInstallment(null)}
          installmentId={selectedInstallment.id}
          panel={panel}
          customerName={`${selectedInstallment.appointment.customer?.firstName || ''} ${selectedInstallment.appointment.customer?.lastName || ''}`.trim()}
          amountDue={
            (() => {
              const appointmentRows = rows.filter(r => r.appointmentId === selectedInstallment.appointmentId)
              const totalPaid = appointmentRows.reduce((sum, r) => sum + r.paidAmount, 0n)
              const totalAmount = selectedInstallment.totalPlanAmount || selectedInstallment.amount
              const remaining = totalAmount - totalPaid
              return selectedInstallment.amount > remaining ? remaining : selectedInstallment.amount
            })()
          }
          maxTotalRemaining={
            (() => {
              const appointmentRows = rows.filter(r => r.appointmentId === selectedInstallment.appointmentId)
              const totalPaid = appointmentRows.reduce((sum, r) => sum + r.paidAmount, 0n)
              const totalAmount = selectedInstallment.totalPlanAmount || selectedInstallment.amount
              return totalAmount - totalPaid
            })()
          }
          onSuccess={() => {
            if (selectedInstallment) {
              handleTempAmountChange(selectedInstallment.id, null)
            }
            setSelectedInstallment(null)
          }}
        />
      )}

      {followUpRow && (
        <FollowUpDialog
          isOpen={true}
          onClose={() => setFollowUpRow(null)}
          appointmentId={followUpRow.appointmentId}
          customerName={`${followUpRow.appointment.customer?.firstName || ''} ${followUpRow.appointment.customer?.lastName || ''}`.trim()}
          amountDue={followUpRow.amount.toString()}
          panel={panel}
          onSuccess={() => {
            setFollowUpRow(null)
            window.location.reload()
          }}
        />
      )}
    </>
  )
}