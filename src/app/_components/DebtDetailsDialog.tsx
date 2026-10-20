'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/core/components/icons'
import { formatMoney, toPersianDigits } from '@/core/localization'
import type { DebtRow } from '@/modules/debts'
import { ADMIN_DEBTS } from '@/app/admin/catalog'

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
}

export function DebtDetailsDialog({
  isOpen,
  onClose,
  row,
}: {
  isOpen: boolean
  onClose: () => void
  row: DebtRow | null
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

  return createPortal(
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-right" dir="rtl">
      <div className="w-full max-w-[500px] rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between border-b border-line px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 font-bold text-base text-ink">
             <Icon name="info" size="compact" />
             {c.title}
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-surface-2 text-ink-3 transition-colors">
            <Icon name="close" size="compact" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
           <div className="flex flex-col items-center justify-center rounded-xl bg-info-bg/30 p-4 border border-info/10 text-center">
             <span className="font-bold text-ink text-lg">{row.customerFirstName} {row.customerLastName}</span>
             <span className="text-xs text-ink-2">{row.customerMobile}</span>
             <span className="mt-2 text-xs text-ink-3">{c.service}: {row.serviceName ?? c.unknownService}</span>
           </div>

           <table className="w-full text-sm border-collapse border border-line text-center">
              <tbody className="divide-y divide-line">
                 <tr className="bg-surface-2">
                    <td className="py-2 px-3 text-ink-3 w-1/2">{c.totalAmount}</td>
                    <td className="py-2 px-3 font-bold text-ink tabular-nums">{formatMoney(totalAmount)} {c.toman}</td>
                 </tr>
                 <tr>
                    <td className="py-2 px-3 text-ink-3">{c.paidAmount}</td>
                    <td className="py-2 px-3 font-semibold text-ok tabular-nums">{formatMoney(row.paid)} {c.toman}</td>
                 </tr>
                 <tr>
                    <td className="py-2 px-3 text-ink-3">{c.balance}</td>
                    <td className="py-2 px-3 font-bold text-danger tabular-nums">{formatMoney(row.balance)} {c.toman}</td>
                 </tr>
                 <tr>
                    <td className="py-2 px-3 text-ink-3">{c.paymentType}</td>
                    <td className="py-2 px-3 font-semibold text-ink">{row.totalInstallments > 1 ? c.typeInstallment : c.typeCash}</td>
                 </tr>
                 {row.totalInstallments > 1 && (
                   <>
                     <tr>
                        <td className="py-2 px-3 text-ink-3">{c.currentStage}</td>
                        <td className="py-2 px-3 font-semibold text-brand">
                          {c.stageLabel(toPersianDigits(row.installmentSequence), toPersianDigits(row.totalInstallments))}
                        </td>
                     </tr>
                     <tr>
                        <td className="py-2 px-3 text-ink-3">{c.installmentAmount}</td>
                        <td className="py-2 px-3 font-semibold text-ink tabular-nums">{formatMoney(row.installmentAmount)} {c.toman}</td>
                     </tr>
                     <tr>
                        <td className="py-2 px-3 text-ink-3">{c.remainingInstallments}</td>
                        <td className="py-2 px-3 font-semibold text-warn">{c.remainingLabel(toPersianDigits(remainingInstallments))}</td>
                     </tr>
                   </>
                 )}
                 <tr>
                    <td className="py-2 px-3 text-ink-3">{c.currentDueDate}</td>
                    <td className="py-2 px-3 font-semibold text-ink">{row.dueLocalDate}</td>
                 </tr>
              </tbody>
           </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 bg-surface-2 rounded-b-2xl shrink-0">
           <button onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-brand-600 transition-colors">
             {c.close}
           </button>
        </div>
      </div>
    </div>,
    document.body
  )
}