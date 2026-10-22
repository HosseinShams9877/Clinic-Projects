'use client'

import { useState, useTransition, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { 
  updateInstallmentAction, 
  deleteInstallmentAction 
} from '@/app/_debts/actions'
import { Icon } from '@/core/components/icons'
import { toPersianDigits, formatMoney } from '@/core/localization'
import { PaymentDialog } from '@/app/admin/debts/_components/PaymentDialog'

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

function toEnglishDigits(value: string) {
  const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return value.replace(/[۰-۹]/g, (d) => String(persianNumbers.indexOf(d)))
}

function formatNumberWithCommas(value: string | number | bigint) {
  const str = value.toString()
  const englishValue = toEnglishDigits(str)
  const numericValue = englishValue.replace(/,/g, '').replace(/[^\d]/g, '')
  if (!numericValue) return ''
  const withCommas = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return toPersianDigits(withCommas)
}

export function EditInstallmentDialog({
  installmentId,
  appointmentId,
  customerId,
  customerName,
  remainingAmount,
  sequence,
  currentDueDate,
  currentAmount,
  panel,
}: {
  installmentId: string
  appointmentId: string
  customerId: string
  customerName: string
  remainingAmount: bigint
  sequence: number
  currentDueDate: string
  currentAmount: string | bigint
  panel: 'reception' | 'admin' | 'doctor'
}) {
  const isClient = useIsClient()
  const [isOpen, setIsOpen] = useState(false)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  
  const [dueDate, setDueDate] = useState(currentDueDate)
  const [amount, setAmount] = useState(formatNumberWithCommas(Math.floor(Number(currentAmount) / 10)))
  
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const handleSave = () => {
    startTransition(async () => {
      const amountRial = BigInt(toEnglishDigits(amount.replace(/,/g, ''))) * 10n
      
      // 👈 چک کردن اینکه مبلغ قسط از کل مانده حساب بیشتر نباشه
      if (amountRial > remainingAmount) {
        return alert(`مبلغ قسط نمی‌تواند بیشتر از کل مانده حساب (${formatMoney(remainingAmount)} تومان) باشد.`)
      }

      const res = await updateInstallmentAction(panel, installmentId, {
        newDueDate: dueDate,
        newAmount: amountRial.toString()
      })
      
      if (res.ok) {
        setIsOpen(false)
        router.refresh()
      } else {
        alert(res.message)
      }
    })
  }

  const handleDelete = () => {
    if (!confirm('آیا از حذف این قسط مطمئن هستید؟')) return
    startTransition(async () => {
      const res = await deleteInstallmentAction(panel, installmentId)
      if (res.ok) {
        setIsOpen(false)
        router.refresh()
      } else {
        alert(res.message)
      }
    })
  }

  if (!isClient) return null

  if (!isOpen) {
    return (
      <button 
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(true)
        }} 
        className="grid size-8 place-items-center rounded-lg border border-line-2 text-ink-3 hover:bg-surface-2 hover:text-brand transition-colors"
        title="ویرایش قسط"
      >
        <Icon name="edit" size="compact" />
      </button>
    )
  }

  return createPortal(
    <>
      <div 
        className="fixed inset-0 z-[50] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-right" 
        dir="rtl"
        onClick={() => setIsOpen(false)}
      >
        <div 
          className="w-full max-w-[380px] rounded-2xl bg-surface p-5 shadow-2xl border border-line flex flex-col gap-4 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand">
                <Icon name="edit" size="compact" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-ink">ویرایش قسط {toPersianDigits(sequence)}</h3>
              </div>
            </div>
            <button 
              onClick={handleDelete} 
              className="text-danger text-xs font-semibold hover:underline flex items-center gap-1"
            >
              <Icon name="remove" size="compact" /> حذف قسط
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              setIsPaymentDialogOpen(true)
            }}
            className="w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="retry" size="compact" />
            بازتعریف کل بدهی باقی‌مانده ({formatNumberWithCommas(Math.floor(Number(remainingAmount) / 10))} تومان)
          </button>

          <div className="flex flex-col gap-3 relative z-10">
            <Field label="مبلغ قسط (تومان)">
              <div className="relative">
                <input 
                  type="text" 
                  value={amount} 
                  onChange={e => setAmount(formatNumberWithCommas(e.target.value))} 
                  className="w-full rounded-lg border border-line-2 py-2 pl-12 text-left font-bold text-sm text-ink focus:border-brand focus:outline-none" 
                  dir="ltr" 
                />
                <span className="absolute left-3 top-2.5 text-[10px] text-ink-3">تومان</span>
              </div>
            </Field>
            <Field label="تاریخ سررسید این قسط">
              <JalaliDatePicker value={dueDate} onChange={setDueDate} />
            </Field>
          </div>

          <div className="flex items-center justify-center gap-2 mt-2 border-t border-line pt-3">
            <button 
              onClick={() => setIsOpen(false)} 
              disabled={isPending} 
              className="flex-1 rounded-lg border border-line-2 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              انصراف
            </button>
            <button 
              onClick={handleSave} 
              disabled={isPending} 
              className="flex-1 rounded-lg bg-brand py-2 text-xs font-semibold text-ink-inverse hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {isPending ? 'در حال ذخیره...' : (<><Icon name="confirm" size="compact" />ذخیره</>)}
            </button>
          </div>
        </div>
      </div>

      {isPaymentDialogOpen && (
        <PaymentDialog
          isOpen={true}
          onClose={() => setIsPaymentDialogOpen(false)}
          customerId={customerId}
          appointmentId={appointmentId}
          customerName={customerName}
          amountDue={remainingAmount}
          panel={panel}
          onSuccess={() => {
            setIsPaymentDialogOpen(false)
            setIsOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  , document.body)
}