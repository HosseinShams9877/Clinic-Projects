'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { 
  updateInstallmentAction, 
  updateFutureInstallmentsAction, 
  deleteInstallmentAction 
} from '@/app/_debts/actions'
import { Icon } from '@/core/components/icons'
import { toPersianDigits } from '@/core/localization'
import { PaymentDialog } from '@/app/admin/debts/_components/PaymentDialog'

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
  const [isOpen, setIsOpen] = useState(false)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'single' | 'future'>('single')
  
  const [dueDate, setDueDate] = useState(currentDueDate)
  const [amount, setAmount] = useState(formatNumberWithCommas(Math.floor(Number(currentAmount) / 10)))
  
  const [futureAmount, setFutureAmount] = useState(formatNumberWithCommas(Math.floor(Number(currentAmount) / 10)))
  const [futureInterval, setFutureInterval] = useState('1')
  
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSave = () => {
    startTransition(async () => {
      let res
      
      if (activeTab === 'single') {
        const amountRial = (BigInt(toEnglishDigits(amount.replace(/,/g, ''))) * 10n).toString()
        res = await updateInstallmentAction(panel, installmentId, {
          newDueDate: dueDate,
          newAmount: amountRial
        })
      } else {
        const futureAmountRial = (BigInt(toEnglishDigits(futureAmount.replace(/,/g, ''))) * 10n).toString()
        res = await updateFutureInstallmentsAction(panel, appointmentId, sequence, {
          newAmount: futureAmountRial,
          newIntervalMonths: Number(futureInterval)
        })
      }
      
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

  // دکمه‌ای که توی جدول دیده میشه
  if (!isOpen && !isPaymentDialogOpen) {
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
    <>
      {/* 👈 مودال ویرایش فقط زمانی رندر میشه که isOpen true باشه و مودال پرداخت باز نباشه */}
      {isOpen && !isPaymentDialogOpen && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-right" 
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

            {/* دکمه بازتعریف */}
            <button
              type="button"
              onClick={() => {
                setIsPaymentDialogOpen(true)
                setIsOpen(false) // 👈 همزمان مودال ویرایش بسته میشه
              }}
              className="w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="retry" size="compact" />
              بازتعریف کل بدهی باقی‌مانده ({formatNumberWithCommas(Math.floor(Number(remainingAmount) / 10))} تومان)
            </button>

            <div className="flex w-full border-b border-line">
              <button
                onClick={() => setActiveTab('single')}
                className={`flex-1 py-2 text-xs font-semibold ${activeTab === 'single' ? 'text-brand border-b-2 border-brand' : 'text-ink-3'}`}
              >
                ویرایش همین قسط
              </button>
              <button
                onClick={() => setActiveTab('future')}
                className={`flex-1 py-2 text-xs font-semibold ${activeTab === 'future' ? 'text-brand border-b-2 border-brand' : 'text-ink-3'}`}
              >
                ویرایش اقساط باقی‌مانده
              </button>
            </div>

            {activeTab === 'single' ? (
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
            ) : (
              <div className="flex flex-col gap-3 relative z-10">
                <p className="text-xs text-ink-3 leading-relaxed">
                  با این کار، مبلغ و فاصله زمانی اقساط بعدی (از قسط {toPersianDigits(sequence + 1)} به بعد) تغییر می‌کند.
                </p>
                <Field label="مبلغ جدید برای اقساط بعدی (تومان)">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={futureAmount} 
                      onChange={e => setFutureAmount(formatNumberWithCommas(e.target.value))} 
                      className="w-full rounded-lg border border-line-2 py-2 pl-12 text-left font-bold text-sm text-ink focus:border-brand focus:outline-none" 
                      dir="ltr" 
                    />
                    <span className="absolute left-3 top-2.5 text-[10px] text-ink-3">تومان</span>
                  </div>
                </Field>
                <Field label="فاصله زمانی بین اقساط">
                  <select 
                    value={futureInterval} 
                    onChange={e => setFutureInterval(e.target.value)}
                    className="w-full rounded-lg border border-line-2 py-2 px-3 text-sm"
                  >
                    <option value="1">هر ۱ ماه</option>
                    <option value="2">هر ۲ ماه</option>
                    <option value="3">هر ۳ ماه</option>
                    <option value="6">هر ۶ ماه</option>
                  </select>
                </Field>
              </div>
            )}

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
      )}

      {/* 👈 مودال پرداخت */}
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
            router.refresh()
          }}
        />
      )}
    </>
  )
}