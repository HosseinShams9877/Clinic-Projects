'use client'

import { useState } from 'react'
import { formatMoney, formatPhone, toPersianDigits } from '@/core/localization'
import { cx } from '@/core/lib'
import { ADMIN_DEBTS } from '@/app/admin/catalog'
import type { DebtRow } from '@/modules/debts'
import { PaymentDialog } from '@/app/admin/debts/_components/PaymentDialog'
import { FollowUpDialog } from '@/app/admin/debts/_components/FollowUpDialog'

const DEBT_COLUMNS = [
  { key: 'customer', width: 'w-[14%]', align: 'start' },
  { key: 'doctor', width: 'w-[9%]', align: 'start' },
  { key: 'service', width: 'w-[11%]', align: 'start' },
  { key: 'due', width: 'w-[10%]', align: 'start' },
  { key: 'status', width: 'w-[10%]', align: 'start' },
  { key: 'balance', width: 'w-[11%]', align: 'start' },
  { key: 'stage', width: 'w-[11%]', align: 'start' },
  { key: 'followUp', width: 'w-[10%]', align: 'start' },
  { key: 'nextFollowUp', width: 'w-[8%]', align: 'start' },
  { key: 'action', width: 'w-[16%]', align: 'start' },
] as const

export function DebtsTable({
  rows,
  showActions,
  paymentOptions,
  followUpsMap,
  panel,
  today,
}: {
  rows: readonly DebtRow[]
  showActions: boolean
  paymentOptions?: any
  followUpsMap?: any
  panel: 'admin' | 'reception' | 'doctor'
  today: string 
}) {
  const [selectedPaymentRow, setSelectedPaymentRow] = useState<DebtRow | null>(null)
  const [selectedFollowUpRow, setSelectedFollowUpRow] = useState<DebtRow | null>(null)

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        هیچ بدهی‌ای یافت نشد.
      </p>
    )
  }

  return (
    <>
      <section className="flex flex-col rounded-xl border border-line bg-surface">
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
                  <th
                    key={column.key}
                    scope="col"
                    className={cx(
                      'whitespace-nowrap px-3 py-3 align-middle text-xs font-semibold bg-surface-2/50',
                      column.align === 'end' ? 'text-end' : 'text-start'
                    )}
                  >
                    {column.key === 'customer' && 'مشتری'}
                    {column.key === 'doctor' && 'پزشک'}
                    {column.key === 'service' && 'خدمت'}
                    {column.key === 'due' && 'سررسید'}
                    {column.key === 'status' && 'وضعیت'}
                    {column.key === 'balance' && 'مبلغ'}
                    {column.key === 'stage' && 'مرحله'}
                    {column.key === 'followUp' && 'آخرین پیگیری'}
                    {column.key === 'nextFollowUp' && 'پیگیری بعدی'}
                    {column.key === 'action' && 'عملیات'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.appointmentId} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-3 text-start align-middle">
                     <div className="flex items-center gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-info-bg text-xs font-bold text-info">
                          {row.customerFirstName.slice(0, 1)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold text-ink truncate">{row.customerFirstName} {row.customerLastName}</span>
                          <span className="self-start text-xs text-ink-3 tabular-nums" dir="ltr">{formatPhone(row.customerMobile)}</span>
                        </span>
                      </div>
                  </td>
                  <td className="px-3 py-3 text-start align-middle text-ink-2 truncate">{row.doctorName ?? '—'}</td>
                  <td className="px-3 py-3 text-start align-middle text-ink-2 truncate">{row.serviceName ?? '—'}</td>
                  <td className="px-3 py-3 text-start align-middle text-ink-3 tabular-nums">{row.dueLocalDate}</td>
                  <td className="px-3 py-3 text-start align-middle">
                    {row.daysOverdue > 0 ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill bg-danger-bg px-2 py-1 text-xs font-semibold text-danger tabular-nums">
                        <span className="size-1.5 rounded-full bg-danger"></span>
                        {toPersianDigits(row.daysOverdue)} روز
                      </span>
                    ) : (
                      <span className="inline-flex whitespace-nowrap rounded-pill bg-warn-bg px-2 py-1 text-xs font-semibold text-warn">
                        امروز
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-start align-middle font-bold text-ink tabular-nums">{formatMoney(row.balance)}</td>
                  <td className="px-3 py-3 text-start align-middle">
                    {row.totalInstallments > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-ink-2 whitespace-nowrap text-xs">قسط {toPersianDigits(row.paidInstallments + 1)} از {toPersianDigits(row.totalInstallments)}</span>
                        <span className="text-[10px] text-ink-3">{toPersianDigits(row.paidInstallments)} از {toPersianDigits(row.totalInstallments)} پرداخت شده</span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-start align-middle">
                    {row.lastFollowUp ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-ink-2 whitespace-nowrap">پیگیری شده</span>
                        <span className="text-[10px] text-ink-3 tabular-nums whitespace-nowrap">{new Date(row.lastFollowUp.at).toLocaleDateString('fa-IR')}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-3">بدون پیگیری</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-start align-middle">
                    {row.nextContactAt ? (
                       <span className="inline-flex rounded-pill bg-warn-bg px-2 py-1 text-[10px] font-semibold text-warn tabular-nums">
                         {new Date(row.nextContactAt).toLocaleDateString('fa-IR')}
                       </span>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-start align-middle">
                    <div className="flex flex-row items-center gap-1.5 flex-nowrap">
                      <button 
                        onClick={() => setSelectedFollowUpRow(row)}
                        className="rounded-full border border-line-2 bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-surface-2 transition-colors whitespace-nowrap shadow-sm"
                      >
                        پیگیری
                      </button>
                      <button
                        onClick={() => setSelectedPaymentRow(row)}
                        className="rounded-full bg-[#ba6a73] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap shadow-sm"
                      >
                        ثبت پرداخت
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedPaymentRow && (
  <PaymentDialog
    isOpen={!!selectedPaymentRow}
    onClose={() => setSelectedPaymentRow(null)}
    customerId={selectedPaymentRow.customerId}
    appointmentId={selectedPaymentRow.appointmentId}
    customerName={`${selectedPaymentRow.customerFirstName} ${selectedPaymentRow.customerLastName ?? ''}`.trim()}
    amountDue={selectedPaymentRow.installmentAmount > 0n ? selectedPaymentRow.installmentAmount : selectedPaymentRow.balance}
    installmentId={selectedPaymentRow.installmentId} 
    totalAmountDue={selectedPaymentRow.balance}
    remainingAmount={selectedPaymentRow.balance}   // 👈 فقط این خط اضافه شد
    panel={panel}
    onSuccess={() => setSelectedPaymentRow(null)}
  />
)}

      {selectedFollowUpRow && (
        <FollowUpDialog
          isOpen={!!selectedFollowUpRow}
          onClose={() => setSelectedFollowUpRow(null)}
          appointmentId={selectedFollowUpRow.appointmentId}
          customerName={`${selectedFollowUpRow.customerFirstName} ${selectedFollowUpRow.customerLastName ?? ''}`.trim()}
          amountDue={selectedFollowUpRow.balance}
          panel={panel}
          onSuccess={() => setSelectedFollowUpRow(null)}
        />
      )}
    </>
  )
}