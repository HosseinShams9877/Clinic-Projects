'use client'

import { useState, useTransition, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { deleteInstallmentAction } from '@/app/_debts/actions'
import { Icon } from '@/core/components/icons'
import { toPersianDigits, formatMoney } from '@/core/localization'
import { PaymentDialog } from '@/app/admin/debts/_components/PaymentDialog'

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
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
  onTempAmountChange,
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
  onTempAmountChange?: (id: string, amount: bigint | null) => void
}) {
  const isClient = useIsClient()
  const [isOpen, setIsOpen] = useState(false)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  
  const [dueDate, setDueDate] = useState(currentDueDate)
  const [amount, setAmount] = useState(formatNumberWithCommas(Math.floor(Number(currentAmount) / 10)))
  
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // 👈 محاسبه مقدار ورودی و چک کردن محدودیت
  const amountTomanStr = toEnglishDigits(amount.replace(/,/g, '')).replace(/[^\d]/g, '')
  const amountRial = amountTomanStr ? BigInt(amountTomanStr) * 10n : 0n
  const isOverLimit = amountRial > remainingAmount

  const handleSave = () => {
    if (isOverLimit) return // جلوگیری از ذخیره در صورت وجود خطا
    
    startTransition(async () => {
      if (onTempAmountChange) {
        onTempAmountChange(installmentId, amountRial)
      }
      
      setIsOpen(false)
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

  if (!isOpen && !isPaymentDialogOpen) {
    return (
      <button 
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(true)
        }} 
        className="grid size-8 place-items-center rounded-lg border border-line-2 text-ink-3 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
        title="ویرایش قسط"
      >
        <Icon name="edit" size="compact" />
      </button>
    )
  }

  return createPortal(
    <>
      {/* 👈 مودال ویرایش */}
      {isOpen && !isPaymentDialogOpen && (
        <div 
          className="fixed inset-0 z-[50] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 text-right" 
          dir="rtl"
          onClick={() => setIsOpen(false)}
        >
          {/* کانتینر اصلی با استایل گردی و overflow */}
          <div 
            className="w-full max-w-[380px] bg-surface shadow-3 border border-line/50 flex flex-col relative"
            style={{ borderRadius: '24px', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* هدر پررنگ مودال ویرایش */}
            <div 
              className="flex items-center justify-between border-b border-line/40 bg-brand-100 px-5 py-4 shrink-0 !rounded-t-[24px]"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-brand-200 text-brand-800">
                  <Icon name="edit" size="compact" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-brand-900">ویرایش قسط {toPersianDigits(sequence)}</h3>
                </div>
              </div>
              <button 
                onClick={handleDelete} 
                className="text-danger text-xs font-bold hover:underline flex items-center gap-1 bg-surface/50 px-2 py-1 rounded-lg transition-all"
              >
                <Icon name="remove" size="compact" /> حذف قسط
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* 👈 دکمه بازتعریف کل بدهی */}
              <button
                type="button"
                onClick={() => {
                  setIsPaymentDialogOpen(true) // 👈 فقط مودال پرداخت رو باز کن
                }}
                className="w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition-colors flex items-center justify-center gap-2"
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
                      className={`w-full rounded-xl border py-2.5 pl-12 text-left font-bold text-sm text-ink bg-surface focus:outline-none transition-all ${
                        isOverLimit ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger/20' : 'border-line-2 focus:border-brand focus:ring-1 focus:ring-brand/20'
                      }`} 
                      dir="ltr" 
                    />
                    <span className="absolute left-3 top-3 text-[10px] text-ink-3">تومان</span>
                  </div>
                  {isOverLimit && (
                    <p className="mt-1 text-xs font-semibold text-danger">
                      مبلغ نمی‌تواند بیشتر از باقی‌مانده کل بدهی ({formatMoney(remainingAmount)} تومان) باشد.
                    </p>
                  )}
                </Field>
                
                <Field label="تاریخ سررسید این قسط">
                  <JalaliDatePicker value={dueDate} onChange={setDueDate} />
                </Field>
              </div>
            </div>

            {/* فوتر مودال ویرایش */}
            <div className="flex items-center justify-center gap-2 border-t border-line/40 bg-surface-2 px-5 py-3 !rounded-b-[24px]">
              <button 
                onClick={() => setIsOpen(false)} 
                disabled={isPending} 
                className="flex-1 rounded-xl border border-line-2 py-2 text-xs font-semibold text-ink-2 bg-surface hover:bg-surface-3 hover:text-ink disabled:opacity-50 transition-colors"
              >
                انصراف
              </button>
              <button 
                onClick={handleSave} 
                disabled={isPending || isOverLimit} 
                className="flex-1 rounded-xl bg-brand py-2 text-xs font-semibold text-ink-inverse flex items-center justify-center gap-1 hover:bg-brand-700 shadow-brand ring-1 ring-brand-300 ring-offset-2 disabled:opacity-50 transition-all"
              >
                {isPending ? 'در حال ذخیره...' : (<><Icon name="confirm" size="compact" />ذخیره</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👈 مودال پرداخت: مستقل از isOpen */}
     {isPaymentDialogOpen && (
      <PaymentDialog
        isOpen={true}
        onClose={() => setIsPaymentDialogOpen(false)}
        customerId={customerId}
        appointmentId={appointmentId}
        customerName={customerName}
        amountDue={remainingAmount}
        panel={panel}
        mode="edit" // 👈 این خط اضافه بشه
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