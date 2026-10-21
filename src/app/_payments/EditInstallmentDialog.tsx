'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { updateInstallmentAction } from '@/app/_debts/actions'
import { Icon } from '@/core/components/icons'
import { toPersianDigits } from '@/core/localization'

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
  currentDueDate,
  currentAmount,
  panel,
}: {
  installmentId: string
  currentDueDate: string
  currentAmount: string | bigint
  panel: 'reception' | 'admin' | 'doctor'
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  // 👈 مقدار ریالی که از جدول میاد رو تقسیم بر 10 می‌کنیم تا به تومان تبدیل بشه و توی اینپوت نمایش داده بشه
  const initialAmountRial = currentAmount.toString()
  const initialAmountToman = Math.floor(Number(initialAmountRial) / 10).toString()

  const [dueDate, setDueDate] = useState(currentDueDate)
  const [amount, setAmount] = useState(formatNumberWithCommas(initialAmountToman))
  
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSubmit = () => {
    startTransition(async () => {
      const rawAmountToman = toEnglishDigits(amount.replace(/,/g, ''))
      
      // 👈 مقدار تومانی که تایپ شده رو ضرب در 10 می‌کنیم تا به ریال تبدیل بشه و به دیتابیس بره
      const amountRial = rawAmountToman ? (BigInt(rawAmountToman) * 10n).toString() : '0'
      
      const res = await updateInstallmentAction(panel, installmentId, {
        newDueDate: dueDate,
        newAmount: amountRial
      })
      
      if (res.ok) {
        setIsOpen(false)
        router.refresh()
      } else {
        alert(res.message)
      }
    })
  }

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

  return (
    <div 
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[15vh] p-4 text-right" 
      dir="rtl"
      onClick={() => setIsOpen(false)}
    >
      <div 
        className="w-full max-w-[340px] rounded-2xl bg-surface p-4 shadow-2xl border border-line flex flex-col gap-3 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <div className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand">
            <Icon name="edit" size="compact" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-ink">ویرایش قسط / چک</h3>
            <p className="text-[10px] text-ink-3">تاریخ و مبلغ را تغییر دهید</p>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 relative z-10">
          <Field label="مبلغ قسط (تومان)">
            <div className="relative">
              <input 
                type="text" 
                value={amount} 
                onChange={e => setAmount(formatNumberWithCommas(e.target.value))} 
                className="w-full rounded-lg border border-line-2 py-2 pl-12 text-left font-bold text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all" 
                dir="ltr" 
              />
              <span className="absolute left-3 top-2.5 text-[10px] text-ink-3">تومان</span>
            </div>
          </Field>

          <Field label="تاریخ سررسید جدید">
            <JalaliDatePicker value={dueDate} onChange={setDueDate} />
          </Field>
        </div>

        <div className="flex items-center justify-center gap-2 mt-1 border-t border-line pt-3">
          <button 
            onClick={() => setIsOpen(false)} 
            disabled={isPending}
            className="flex-1 rounded-lg border border-line-2 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={isPending}
            className="flex-1 rounded-lg bg-brand py-2 text-xs font-semibold text-ink-inverse hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {isPending ? 'در حال ذخیره...' : (<><Icon name="confirm" size="compact" />ذخیره</>)}
          </button>
        </div>
      </div>
    </div>
  )
}