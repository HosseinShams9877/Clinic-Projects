'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/core/components/icons'
import { dateToLocalDate, formatDate, formatMoney, toPersianDigits } from '@/core/localization'
import type { DebtRow } from '@/modules/debts'
import { PAYMENT_METHOD_LABELS } from '@/modules/payments/catalog'
import type { PaymentLine, PaymentLineStage } from '@/modules/payments'
import { ADMIN_DEBTS } from '@/app/admin/catalog'

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
}

/** 👈 برچسبِ مرحله‌ی یک خطِ پرداخت — «قسط ۲ از ۴»، «چک»، یا نوعِ خودِ پرداخت. */
function stageLabel(stage: PaymentLineStage, labels: { readonly stageLabel: (current: string, total: string) => string; readonly cheque: string }): string {
  switch (stage.kind) {
    case 'INSTALLMENT':
      return labels.stageLabel(toPersianDigits(stage.sequence), toPersianDigits(stage.total))
    case 'CHEQUE':
      return labels.cheque
    case 'PAYMENT':
      return stage.label
  }
}

export function DebtDetailsDialog({
  isOpen,
  onClose,
  row,
  /** 👈 خط‌های پرداختِ این نوبت — از صفحه‌های گزارشِ مالی پاس داده می‌شود. */
  paymentLines,
}: {
  isOpen: boolean
  onClose: () => void
  row: DebtRow | null
  paymentLines?: readonly PaymentLine[] | null
}) {
  const isClient = useIsClient()

  useEffect(() => {
    if (!isClient || !isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [isClient, isOpen])

  if (!isOpen || !isClient || !row) return null

  const c = ADMIN_DEBTS.detailsDialog
  const totalAmount = row.installmentSequence > 0 ? (row.installmentAmount * BigInt(row.totalInstallments)) : row.charged
  const remainingInstallments = row.totalInstallments - row.paidInstallments
  // 👈 خط‌های پرداختِ همین نوبت — صفحه‌های گزارشِ مالی آن‌ها را از قبل خوانده‌اند.
  const lines = (paymentLines ?? []).filter((line) => line.appointmentId === row.appointmentId)

  return createPortal(
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 text-right" dir="rtl">
      
      {/* کانتینر اصلی با استایل گردی و overflow */}
      <div 
        className="w-full max-w-[500px] bg-surface shadow-3 border border-line/50 flex flex-col max-h-[90vh]"
        style={{ borderRadius: '24px', overflow: 'hidden' }}
      >
        
        {/* هدر پررنگ با گردی بالایی */}
        <div 
          className="flex items-center justify-between border-b border-line/40 bg-brand-100 px-5 py-4 shrink-0 !rounded-t-[24px]"
        >
          <div className="flex items-center gap-2 font-bold text-base text-brand-900">
             <span className="grid size-8 place-items-center rounded-full bg-brand-200 text-brand-800">
               <Icon name="info" size="compact" />
             </span>
             {c.title}
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-brand-200 text-brand-800 hover:text-brand-900 transition-colors">
            <Icon name="close" size="compact" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
           
           <div className="flex flex-col items-center justify-center rounded-2xl bg-info-bg/10 p-5 border border-info/20 text-center">
             <span className="font-bold text-ink text-lg">{row.customerFirstName} {row.customerLastName}</span>
             <span className="text-xs text-ink-2 tabular-nums" dir="ltr">{row.customerMobile}</span>
             <span className="mt-2 text-xs text-ink-3">{c.service}: {row.serviceName ?? c.unknownService}</span>
           </div>

           <div className="overflow-hidden rounded-xl border border-line/50 bg-surface">
             <table className="w-full text-sm border-collapse text-center">
                <tbody className="divide-y divide-line/50">
                   <tr className="bg-surface-2">
                      <td className="py-2.5 px-3 text-ink-3 w-1/2">{c.totalAmount}</td>
                      <td className="py-2.5 px-3 font-bold text-ink tabular-nums">{formatMoney(totalAmount)} {c.toman}</td>
                   </tr>
                   <tr>
                      <td className="py-2.5 px-3 text-ink-3">{c.paidAmount}</td>
                      <td className="py-2.5 px-3 font-semibold text-ok tabular-nums">{formatMoney(row.paid)} {c.toman}</td>
                   </tr>
                   <tr>
                      <td className="py-2.5 px-3 text-ink-3">{c.balance}</td>
                      <td className="py-2.5 px-3 font-bold text-danger tabular-nums">{formatMoney(row.balance)} {c.toman}</td>
                   </tr>
                   <tr>
                      <td className="py-2.5 px-3 text-ink-3">{c.paymentType}</td>
                      <td className="py-2.5 px-3 font-semibold text-ink">{row.totalInstallments > 1 ? c.typeInstallment : c.typeCash}</td>
                   </tr>
                   {row.totalInstallments > 1 && (
                     <>
                       <tr>
                          <td className="py-2.5 px-3 text-ink-3">{c.currentStage}</td>
                          <td className="py-2.5 px-3 font-semibold text-brand-700">
                            {c.stageLabel(toPersianDigits(row.installmentSequence), toPersianDigits(row.totalInstallments))}
                          </td>
                       </tr>
                       <tr>
                          <td className="py-2.5 px-3 text-ink-3">{c.installmentAmount}</td>
                          <td className="py-2.5 px-3 font-semibold text-ink tabular-nums">{formatMoney(row.installmentAmount)} {c.toman}</td>
                       </tr>
                       <tr>
                          <td className="py-2.5 px-3 text-ink-3">{c.remainingInstallments}</td>
                          <td className="py-2.5 px-3 font-semibold text-warn">{c.remainingLabel(toPersianDigits(remainingInstallments))}</td>
                       </tr>
                     </>
                   )}
                   <tr>
                      <td className="py-2.5 px-3 text-ink-3">{c.currentDueDate}</td>
                      <td className="py-2.5 px-3 font-semibold text-ink">{row.dueLocalDate}</td>
                   </tr>
                </tbody>
             </table>
           </div>

           {/* 👈 تفکیکِ اقساط و چک‌های پرداخت‌شده — جدولِ خط‌های پرداخت */}
           <div className="flex flex-col gap-2">
             <div className="flex items-center gap-2 px-1 text-sm font-bold text-ink">
               <Icon name="invoice" size="compact" />
               {c.lines.title}
             </div>
             {lines.length === 0 ? (
               <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-xs text-ink-3">
                 {c.lines.empty}
               </p>
             ) : (
               <div className="overflow-x-auto rounded-xl border border-line/50 bg-surface">
                 <table className="w-full min-w-[440px] table-fixed border-collapse text-center text-xs">
                   <thead>
                     <tr className="border-b border-line/50 bg-surface-2 text-ink-3">
                       <th className="px-2 py-2 font-semibold text-start">{c.lines.columns.customer}</th>
                       <th className="px-2 py-2 font-semibold text-start">{c.lines.columns.stage}</th>
                       <th className="px-2 py-2 font-semibold text-start">{c.lines.columns.amount}</th>
                       <th className="px-2 py-2 font-semibold text-start">{c.lines.columns.date}</th>
                       <th className="px-2 py-2 font-semibold text-start">{c.lines.columns.method}</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-line/50">
                     {lines.map((line) => (
                       <tr key={line.id}>
                         <td className="px-2 py-2 font-semibold text-ink">{line.customerName}</td>
                         <td className="px-2 py-2 text-brand-700 whitespace-nowrap">{stageLabel(line.stage, { stageLabel: c.stageLabel, cheque: c.lines.cheque })}</td>
                         <td className="px-2 py-2 font-semibold text-ink tabular-nums whitespace-nowrap">{formatMoney(line.amount)} {c.toman}</td>
                         <td className="px-2 py-2 text-ink-3 tabular-nums whitespace-nowrap">{formatDate(dateToLocalDate(line.paidAt), 'short')}</td>
                         <td className="px-2 py-2 text-ink-2 whitespace-nowrap">{PAYMENT_METHOD_LABELS[line.method] ?? line.method}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
           </div>
        </div>

        {/* فوتر با گردی پایینی */}
        <div 
          className="flex items-center justify-end gap-2 border-t border-line/40 px-5 py-4 bg-surface-2 shrink-0 !rounded-b-[24px]"
        >
           <button onClick={onClose} className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-700 transition-all shadow-brand ring-1 ring-brand-300 ring-offset-2">
             {c.close}
           </button>
        </div>
      </div>
    </div>,
    document.body
  )
}