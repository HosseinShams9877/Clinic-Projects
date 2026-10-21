'use client'

import { useState, useEffect, useTransition, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { formatMoney, todayLocalDate, toPersianDigits } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { TimePicker } from '@/core/components/date-picker/TimePicker'
import { Field } from '@/core/components/form'
import { recordPaymentAction, recordPaymentWithInstallmentsAction } from '@/app/_debts/actions'
import { ADMIN_DEBTS } from '@/app/admin/catalog'

type PaymentMethodType = 'CASH' | 'POS' | 'CARD_TO_CARD' | 'ONLINE' | 'CHEQUE' | 'INSTALLMENT'

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
}

function toEnglishDigits(value: string) {
  const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return value.replace(/[۰-۹]/g, (d) => String(persianNumbers.indexOf(d)))
}

function formatNumberWithCommas(value: string) {
  const englishValue = toEnglishDigits(value)
  const numericValue = englishValue.replace(/,/g, '').replace(/[^\d]/g, '')
  if (!numericValue) return ''
  const withCommas = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return toPersianDigits(withCommas)
}

export function PaymentDialog({ 
  isOpen, onClose, customerId, appointmentId, customerName, amountDue, onSuccess 
}: { 
  isOpen: boolean, onClose: () => void, customerId: string, appointmentId: string,
  customerName: string, amountDue: bigint | string, onSuccess: () => void 
}) {
  const router = useRouter()
  const isClient = useIsClient()
  
  const initialAmount = typeof amountDue === 'bigint' ? amountDue.toString() : amountDue
  
  // 👈 اصلاح ۱: تبدیل ریال به تومان برای نمایش در اینپوت
  const initialAmountInToman = Math.floor(Number(initialAmount) / 10).toString()

  const [amount, setAmount] = useState(formatNumberWithCommas(initialAmountInToman))
  const [discount, setDiscount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  
  const [method, setMethod] = useState<PaymentMethodType>('CASH')
  const [installmentCount, setInstallmentCount] = useState('4')
  const [intervalMonths, setIntervalMonths] = useState('1') 
  const [firstDueDate, setFirstDueDate] = useState<string>(todayLocalDate(realClock()))
  
  const [receiveDate, setReceiveDate] = useState<string>('')
  const [receiveTime, setReceiveTime] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isClient || !isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [isClient, isOpen])

  if (!isOpen || !isClient) return null

  const rawAmountToman = toEnglishDigits(amount.replace(/,/g, ''))
  const rawDiscountToman = toEnglishDigits(discount.replace(/,/g, ''))
  
  const baseAmount = BigInt(initialAmount)
  
  // 👈 اصلاح ۲: تبدیل مقادیر تومانِ اینپوت به ریال برای محاسبات دیتابیس
  const amountRialBigInt = rawAmountToman ? BigInt(rawAmountToman) * 10n : 0n
  const discountRialBigInt = rawDiscountToman ? BigInt(rawDiscountToman) * 10n : 0n
  
  const finalAmountRial = baseAmount - discountRialBigInt
  const installmentAmountRial = Math.floor(Number(finalAmountRial) / Number(installmentCount || 1))

  const handleSubmit = () => {
    startTransition(async () => {
      let dbMethod = method
      if (method === 'INSTALLMENT' || method === 'CHEQUE') {
        dbMethod = 'CASH'
      }

      // 👈 اصلاح ۳: ارسال مقادیر ریالی به اکشن‌ها
      const submitAmount = amountRialBigInt.toString()
      const submitDiscount = discountRialBigInt.toString()

      if (method === 'INSTALLMENT' || method === 'CHEQUE') {
        const res = await recordPaymentWithInstallmentsAction(
          'reception',
          appointmentId,
          customerId,
          {
            amount: submitAmount,
            method: dbMethod,
            installmentCount: Number(installmentCount),
            firstDueDate: firstDueDate || todayLocalDate(realClock()),
            installmentInterval: `${intervalMonths}_MONTH`,
            discountAmount: submitDiscount,
            discountReason: discountReason || null,
            forceInstallment: true,
          }
        )
        if (res.ok) {
          onSuccess()
          router.refresh()
        } else {
          alert(res.message)
        }
      } else {
        if (submitDiscount && submitDiscount !== '0') {
          const res = await recordPaymentAction(
            'reception',
            appointmentId,
            {
              amount: submitAmount,
              method: dbMethod,
              kind: 'FINAL',
              discountAmount: submitDiscount,
              discountReason: discountReason || null,
              note: null,
            }
          )
          if (res.ok) {
            onSuccess()
            router.refresh()
          } else {
            alert(res.message)
          }
        } else {
          const res = await recordPaymentWithInstallmentsAction(
            'reception',
            appointmentId,
            customerId,
            {
              amount: finalAmountRial.toString(),
              method: dbMethod,
              installmentCount: 1,
              firstDueDate: firstDueDate || todayLocalDate(realClock()),
              installmentInterval: '1_MONTH',
            }
          )
          if (res.ok) {
            onSuccess()
            router.refresh()
          } else {
            alert(res.message)
          }
        }
      }
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-right" dir="rtl">
      <div className="w-full max-w-[600px] rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4 shrink-0">
          <div className="flex items-center gap-2 font-bold text-lg text-ink">
             <Icon name="payment" size="card" />
             {ADMIN_DEBTS.paymentDialog.title}
          </div>
          <button onClick={onClose} disabled={isPending} className="grid size-8 place-items-center rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors">
            <Icon name="close" size="card" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 overflow-y-auto overflow-x-visible relative">
           
           <div className="flex flex-col gap-1.5 rounded-xl bg-info-bg/30 p-4 border border-info/10">
             <div className="flex items-center justify-between">
               <span className="font-bold text-ink text-lg">{customerName}</span>
               <Icon name="customers" size="card" className="text-info" />
             </div>
             
             <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-ink-2">مبلغ بدهی:</span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatMoney(baseAmount)} تومان</span>
             </div>
             
             {discountRialBigInt > 0n && (
               <>
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-ink-2">تخفیف:</span>
                   <span className="text-sm font-semibold text-danger tabular-nums">{formatMoney(discountRialBigInt)} تومان</span>
                 </div>
                 <div className="flex items-center justify-between border-t border-info/20 pt-1 mt-1">
                   <span className="text-sm font-bold text-ink">مانده نهایی:</span>
                   <span className="text-sm font-bold text-brand tabular-nums">{formatMoney(finalAmountRial)} تومان</span>
                 </div>
               </>
             )}
           </div>

           <div className="flex flex-col gap-2">
             <label className="text-sm font-semibold text-ink-2">{ADMIN_DEBTS.paymentDialog.amountLabel}</label>
             <div className="relative">
                <input 
                  type="text" 
                  value={amount} 
                  onChange={e => setAmount(formatNumberWithCommas(e.target.value))} 
                  className="w-full rounded-xl border border-line-2 p-3 pl-16 text-left font-bold text-lg text-ink focus:border-brand focus:outline-none" 
                  dir="ltr" 
                />
                <span className="absolute left-4 top-3.5 text-sm text-ink-3">{ADMIN_DEBTS.followUp.toman}</span>
             </div>
             <div className="flex gap-2 justify-end mt-1">
                <button type="button" onClick={() => setAmount(ADMIN_DEBTS.paymentDialog.quickAmount1Label)} className="rounded-full border border-line-2 px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">{ADMIN_DEBTS.paymentDialog.quickAmount1Label}</button>
                <button type="button" onClick={() => setAmount(ADMIN_DEBTS.paymentDialog.quickAmount2Label)} className="rounded-full border border-line-2 px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">{ADMIN_DEBTS.paymentDialog.quickAmount2Label}</button>
                {/* 👈 اصلاح ۴: دکمه "همه مبلغ" هم باید تومان را بفرستد */}
                <button type="button" onClick={() => setAmount(formatNumberWithCommas(initialAmountInToman))} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700 font-semibold hover:bg-brand-100">{ADMIN_DEBTS.paymentDialog.allAmount}</button>
             </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-ink-2">تخفیف (تومان)</label>
                <input 
                  type="text" 
                  value={discount}
                  onChange={e => setDiscount(formatNumberWithCommas(e.target.value))}
                  placeholder="۰"
                  className="w-full rounded-xl border border-line-2 p-3 text-left text-sm text-ink focus:border-brand focus:outline-none" 
                  dir="ltr"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-ink-2">دلیل تخفیف</label>
                <input 
                  type="text" 
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  placeholder="مثلا: تخفیف وفاداری"
                  className="w-full rounded-xl border border-line-2 p-3 text-sm text-ink focus:border-brand focus:outline-none" 
                />
              </div>
           </div>

           <div className="flex flex-col gap-3">
             <label className="text-sm font-semibold text-ink-2">{ADMIN_DEBTS.paymentDialog.methodLabel}</label>
             <div className="grid grid-cols-3 gap-3">
                <MethodBtn active={method === 'CASH'} onClick={() => setMethod('CASH')} icon="cash" label={ADMIN_DEBTS.paymentDialog.methods.CASH} />
                <MethodBtn active={method === 'POS'} onClick={() => setMethod('POS')} icon="payment" label={ADMIN_DEBTS.paymentDialog.methods.POS} />
                <MethodBtn active={method === 'CARD_TO_CARD'} onClick={() => setMethod('CARD_TO_CARD')} icon="debt" label={ADMIN_DEBTS.paymentDialog.methods.CARD_TO_CARD} />
                <MethodBtn active={method === 'ONLINE'} onClick={() => setMethod('ONLINE')} icon="externalLink" label={ADMIN_DEBTS.paymentDialog.methods.ONLINE} />
                <MethodBtn active={method === 'CHEQUE'} onClick={() => setMethod('CHEQUE')} icon="invoice" label={ADMIN_DEBTS.paymentDialog.methods.CHEQUE} />
                <MethodBtn active={method === 'INSTALLMENT'} onClick={() => setMethod('INSTALLMENT')} icon="calendar" label={ADMIN_DEBTS.paymentDialog.methods.INSTALLMENT} />
             </div>
           </div>

           {(method === 'CHEQUE' || method === 'INSTALLMENT') && (
             <div className="rounded-xl border border-line-2 bg-surface-2 p-4 flex flex-col gap-4 mt-2">
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ink-3">{method === 'CHEQUE' ? ADMIN_DEBTS.paymentDialog.chequeCount : ADMIN_DEBTS.paymentDialog.installmentCount}</label>
                    <select value={installmentCount} onChange={e => setInstallmentCount(e.target.value)} className="rounded-lg border border-line-2 bg-surface p-2 text-sm text-ink outline-none">
                      {[2,3,4,5,6,12].map(n => <option key={n} value={n}>{toPersianDigits(n)} {ADMIN_DEBTS.paymentDialog.countUnit}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ink-3">{ADMIN_DEBTS.paymentDialog.intervalLabel}</label>
                    <select 
                      value={intervalMonths} 
                      onChange={e => setIntervalMonths(e.target.value)} 
                      className="rounded-lg border border-line-2 bg-surface p-2 text-sm text-ink outline-none"
                    >
                      <option value="1">هر ۱ ماه</option>
                      <option value="2">هر ۲ ماه</option>
                      <option value="3">هر ۳ ماه</option>
                      <option value="6">هر ۶ ماه</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Field label={ADMIN_DEBTS.paymentDialog.firstDueDate}><JalaliDatePicker value={firstDueDate} onChange={setFirstDueDate} /></Field>
                  </div>
                </div>
                <div className="mt-2 overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-sm text-center">
                    <thead className="bg-surface-3 text-xs text-ink-3">
                      <tr><th className="py-2">{ADMIN_DEBTS.paymentDialog.preview.step}</th><th className="py-2">{ADMIN_DEBTS.paymentDialog.preview.dueDate}</th><th className="py-2">{ADMIN_DEBTS.paymentDialog.preview.amount}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line text-ink-2">
                      {Array.from({ length: Math.min(Number(installmentCount), 4) }).map((_, i) => {
                        let displayDate = '---'
                        if (firstDueDate) {
                          const [yStr, mStr, dStr] = firstDueDate.split('-')
                          if (yStr !== undefined && mStr !== undefined && dStr !== undefined) {
                            let y = Number(yStr)
                            let m = Number(mStr) + (i * Number(intervalMonths))
                            while (m > 12) { m -= 12; y += 1; }
                            displayDate = `${y}/${String(m).padStart(2, '0')}/${String(Number(dStr)).padStart(2, '0')}`
                          }
                        }

                        return (
                          <tr key={i} className="bg-surface">
                            <td className="py-2 text-xs">{toPersianDigits(i + 1)} {ADMIN_DEBTS.paymentDialog.of} {toPersianDigits(installmentCount)}</td>
                            <td className="py-2 text-xs tabular-nums">{toPersianDigits(displayDate)}</td>
                            <td className="py-2 text-xs tabular-nums">{formatMoney(BigInt(installmentAmountRial))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
             </div>
           )}

           <div className="grid grid-cols-3 gap-4 mt-2 items-end">
              <div className="flex flex-col gap-2"><label className="text-xs text-ink-3">{ADMIN_DEBTS.paymentDialog.trackingNumber}</label><input type="text" placeholder={ADMIN_DEBTS.paymentDialog.trackingPlaceholder} className="w-full h-[42px] rounded-xl border border-line-2 px-3 text-sm text-ink focus:border-brand focus:outline-none" dir="ltr" /></div>
              <div className="flex flex-col gap-2"><Field label={ADMIN_DEBTS.paymentDialog.receiveDate}><JalaliDatePicker value={receiveDate} onChange={setReceiveDate} /></Field></div>
              <div className="flex flex-col gap-2"><Field label={ADMIN_DEBTS.paymentDialog.receiveTime}><TimePicker value={receiveTime} onChange={setReceiveTime} /></Field></div>
           </div>

           <div className="flex flex-col gap-2 mt-2">
             <label className="text-sm font-semibold text-ink-2">{ADMIN_DEBTS.paymentDialog.note}</label>
             <textarea className="w-full rounded-xl border border-line-2 p-3 text-sm min-h-[60px] focus:border-brand focus:outline-none" placeholder={ADMIN_DEBTS.paymentDialog.notePlaceholder}></textarea>
           </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4 bg-surface-2 rounded-b-2xl shrink-0">
           <button onClick={onClose} disabled={isPending} className="rounded-xl border border-line-2 px-6 py-2.5 text-sm font-semibold text-ink-2 hover:bg-surface hover:text-ink transition-colors">
             {ADMIN_DEBTS.paymentDialog.cancel}
           </button>
           <button onClick={handleSubmit} disabled={isPending} className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-50">
              {isPending ? ADMIN_DEBTS.paymentDialog.saving : (<><Icon name="confirm" size="compact" />{ADMIN_DEBTS.paymentDialog.submit}</>)}
           </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function MethodBtn({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: IconName, label: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-colors", active ? "border-brand bg-brand-50 text-brand-700 shadow-sm" : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2")}>
       <Icon name={icon} size="card" />
       <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}