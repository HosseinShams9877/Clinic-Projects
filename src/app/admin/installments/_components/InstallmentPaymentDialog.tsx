'use client'

import { useState, useEffect, useTransition, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Icon } from '@/core/components/icons'
import { formatMoney, todayLocalDate, toPersianDigits } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { TimePicker } from '@/core/components/date-picker/TimePicker'
import { Field } from '@/core/components/form'
import { recordInstallmentPaymentAction } from '@/app/_debts/actions'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'

type PaymentMethodType = 'CASH' | 'POS' | 'CARD_TO_CARD' | 'ONLINE'

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

function formatNumberWithCommas(value: string) {
  const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  const english = value.replace(/[۰-۹]/g, (d) => String(persianNumbers.indexOf(d)))
  const numericValue = english.replace(/,/g, '').replace(/[^\d]/g, '')
  if (!numericValue) return ''
  return toPersianDigits(numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
}

export function InstallmentPaymentDialog({ 
  isOpen, 
  onClose, 
  installmentId,
  customerName, 
  amountDue, 
  maxTotalRemaining, // 👈 پراپ جدید
  onSuccess 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  installmentId: string,
  customerName: string, 
  amountDue: bigint | string, 
  maxTotalRemaining: bigint, // 👈 باقی‌مانده کل بدهی
  onSuccess: () => void 
}) {
  const router = useRouter()
  const isClient = useIsClient()
  
  const amountDueToman = Math.floor(Number(amountDue) / 10).toString()
  const [amount, setAmount] = useState(formatNumberWithCommas(amountDueToman))
  const [error, setError] = useState<string | null>(null)
  
  const [method, setMethod] = useState<PaymentMethodType>('CASH')
  const [receiveDate, setReceiveDate] = useState<string>('')
  const [receiveTime, setReceiveTime] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isClient || !isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [isClient, isOpen])

  if (!isOpen || !isClient) return null

  // 👈 محاسبه لحظه‌ای برای قرمز کردن اینپوت
  const rawDigits = amount.replace(/[^\d۰-۹]/g, '')
  const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  const englishDigits = rawDigits.replace(/[۰-۹]/g, (d) => String(persianNumbers.indexOf(d)))
  const enteredAmountRial = englishDigits ? BigInt(englishDigits) * 10n : 0n
  
  const maxAllowed = BigInt(amountDue)
  const maxTotal = maxTotalRemaining > 0n ? BigInt(maxTotalRemaining) : 0n
  
  // شرط AND: مبلغ نباید بیشتر از مبلغ قسط و نه بیشتر از باقی‌مانده کل باشه
  const isOverLimit = enteredAmountRial > maxAllowed || (maxTotal > 0n && enteredAmountRial > maxTotal)

  const handleSubmit = () => {
    setError(null)
    if (isOverLimit) {
      return setError(`مبلغ وارد شده نمی‌تواند بیشتر از سقف مجاز باشد.`)
    }
    
    startTransition(async () => {
      if (!englishDigits) {
        return setError('مبلغ را وارد کنید')
      }
      
      const amountRial = enteredAmountRial.toString()

      const res = await recordInstallmentPaymentAction(
        'admin',
        installmentId,
        {
          amount: amountRial,
          method,
          receiveDate: receiveDate || todayLocalDate(realClock()),
          receiveTime: receiveTime || '10:00',
        }
      )

      if (res.ok) {
        onSuccess()
        router.refresh()
      } else {
        setError(res.message)
      }
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-right" dir="rtl">
      <div className="w-full max-w-[500px] rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[95vh]">
        
        <div className="flex items-center justify-between border-b border-line px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 font-bold text-base text-ink">
             <Icon name="payment" size="compact" />
             {ADMIN_INSTALLMENTS.payment.title}
          </div>
          <button onClick={onClose} disabled={isPending} className="grid size-8 place-items-center rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors">
            <Icon name="close" size="compact" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
           
           <div className="flex items-center justify-between rounded-xl bg-info-bg/30 p-3 border border-info/10">
             <div className="flex flex-col gap-0.5">
                <span className="font-bold text-ink text-sm">{customerName}</span>
                <span className="text-xs text-ink-2">{ADMIN_INSTALLMENTS.payment.amountDue} {formatMoney(BigInt(amountDue))} {ADMIN_INSTALLMENTS.payment.toman}</span>
             </div>
             <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-bg text-info">
                <Icon name="customers" size="compact" />
             </span>
           </div>

           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_INSTALLMENTS.payment.amount}</label>
             <div className="relative">
                <input 
                  type="text" 
                  value={amount}
                  onChange={e => setAmount(formatNumberWithCommas(e.target.value))}
                  // 👈 قرمز شدن لحظه‌ای در صورت عبور از سقف
                  className={`w-full rounded-lg border p-2 pl-16 text-left font-bold text-lg text-ink focus:outline-none transition-colors ${
                    isOverLimit ? 'border-danger text-danger focus:border-danger' : 'border-line-2 focus:border-brand'
                  }`} 
                  dir="ltr"
                />
                <span className="absolute left-4 top-3 text-sm text-ink-3">{ADMIN_INSTALLMENTS.payment.toman}</span>
             </div>
             {isOverLimit && (
               <p className="text-xs font-semibold text-danger mt-1">
                 مبلغ وارد شده بیشتر از سقف مجاز است.
               </p>
             )}
           </div>

           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_INSTALLMENTS.payment.method}</label>
             <div className="grid grid-cols-4 gap-2">
                <button type="button" onClick={() => setMethod('CASH')} className={cx("flex flex-col items-center justify-center gap-1 rounded-lg border p-2", method === 'CASH' ? "border-brand bg-brand-50 text-brand-700" : "border-line-2 bg-surface text-ink-2")}>
                   <Icon name="cash" size="compact" />
                   <span className="text-[10px] font-semibold">{ADMIN_INSTALLMENTS.payment.cash}</span>
                </button>
                <button type="button" onClick={() => setMethod('POS')} className={cx("flex flex-col items-center justify-center gap-1 rounded-lg border p-2", method === 'POS' ? "border-brand bg-brand-50 text-brand-700" : "border-line-2 bg-surface text-ink-2")}>
                   <Icon name="payment" size="compact" />
                   <span className="text-[10px] font-semibold">{ADMIN_INSTALLMENTS.payment.pos}</span>
                </button>
                <button type="button" onClick={() => setMethod('CARD_TO_CARD')} className={cx("flex flex-col items-center justify-center gap-1 rounded-lg border p-2", method === 'CARD_TO_CARD' ? "border-brand bg-brand-50 text-brand-700" : "border-line-2 bg-surface text-ink-2")}>
                   <Icon name="debt" size="compact" />
                   <span className="text-[10px] font-semibold">{ADMIN_INSTALLMENTS.payment.cardToCard}</span>
                </button>
                <button type="button" onClick={() => setMethod('ONLINE')} className={cx("flex flex-col items-center justify-center gap-1 rounded-lg border p-2", method === 'ONLINE' ? "border-brand bg-brand-50 text-brand-700" : "border-line-2 bg-surface text-ink-2")}>
                   <Icon name="externalLink" size="compact" />
                   <span className="text-[10px] font-semibold">{ADMIN_INSTALLMENTS.payment.online}</span>
                </button>
             </div>
           </div>

           <div className="grid grid-cols-3 gap-3 mt-1">
              <div className="flex flex-col gap-1.5 col-span-3">
                <label className="text-xs text-ink-3">{ADMIN_INSTALLMENTS.payment.trackingNumber}</label>
                <input type="text" placeholder={ADMIN_INSTALLMENTS.payment.trackingPlaceholder} className="rounded-lg border border-line-2 p-2 text-sm" dir="ltr" />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <Field label={ADMIN_INSTALLMENTS.payment.receiveDate}>
                  <JalaliDatePicker value={receiveDate} onChange={setReceiveDate} />
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <Field label={ADMIN_INSTALLMENTS.payment.receiveTime}>
                  <TimePicker value={receiveTime} onChange={setReceiveTime} />
                </Field>
              </div>
           </div>

           <div className="flex flex-col gap-1.5 mt-1">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_INSTALLMENTS.payment.note}</label>
             <textarea className="w-full rounded-lg border border-line-2 p-2 text-sm min-h-[60px] focus:border-brand focus:outline-none" placeholder={ADMIN_INSTALLMENTS.payment.notePlaceholder}></textarea>
           </div>

           {error && (
             <div className="rounded-lg bg-danger-bg p-3 text-sm font-semibold text-danger border border-danger/20">
               {error}
             </div>
           )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 bg-surface-2 rounded-b-2xl shrink-0">
           <button onClick={onClose} disabled={isPending} className="rounded-lg border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-surface hover:text-ink transition-colors">
             {ADMIN_INSTALLMENTS.payment.cancel}
           </button>
           <button 
             onClick={handleSubmit} 
             // 👈 غیرفعال شدن دکمه در صورت وجود خطا
             disabled={isPending || isOverLimit}
             className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-50"
           >
              {isPending ? ADMIN_INSTALLMENTS.payment.saving : (
                <>
                  <Icon name="confirm" size="compact" />
                  {ADMIN_INSTALLMENTS.payment.submit}
                </>
              )}
           </button>
        </div>
      </div>
    </div>,
    document.body
  )
}