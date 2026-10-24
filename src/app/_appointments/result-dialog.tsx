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
import { recordResultAction } from './actions'
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

export function ResultDialog({
  appointmentId,
  customerId,
  customerName,
  charged,
  alreadyPaid,
  panel,
  triggerLabel,
}: {
  appointmentId: string
  customerId?: string
  customerName?: string
  charged: bigint
  alreadyPaid: bigint
  panel: 'reception' | 'doctor' | 'admin'
  triggerLabel?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const isClient = useIsClient()

  useEffect(() => {
    if (!isClient || !isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [isClient, isOpen])

  if (!isClient) return null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-700 transition-colors shadow-brand"
      >
        {triggerLabel || 'ثبت نتیجه'}
      </button>

      {isOpen && (
        <ResultDialogContent
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          appointmentId={appointmentId}
          customerId={customerId || ''}
          customerName={customerName || 'مشتری'}
          charged={charged}
          alreadyPaid={alreadyPaid}
          panel={panel}
        />
      )}
    </>
  )
}

function ResultDialogContent({
  isOpen,
  onClose,
  appointmentId,
  customerId,
  customerName,
  charged,
  alreadyPaid,
  panel,
}: {
  isOpen: boolean
  onClose: () => void
  appointmentId: string
  customerId: string
  customerName: string
  charged: bigint
  alreadyPaid: bigint
  panel: 'reception' | 'doctor' | 'admin'
}) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [discount, setDiscount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [note, setNote] = useState('')
  
  const [method, setMethod] = useState<PaymentMethodType>('CASH')
  const [installmentCount, setInstallmentCount] = useState('4')
  const [intervalMonths, setIntervalMonths] = useState('1') 
  const [firstDueDate, setFirstDueDate] = useState<string>(todayLocalDate(realClock()))
  
  const [receiveDate, setReceiveDate] = useState<string>('')
  const [receiveTime, setReceiveTime] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const remaining = charged - alreadyPaid

  const rawAmount = toEnglishDigits(amount.replace(/,/g, ''))
  const rawDiscount = toEnglishDigits(discount.replace(/,/g, ''))
  
  const paidBigInt = rawAmount ? BigInt(rawAmount) * 10n : 0n
  const discountBigInt = rawDiscount ? BigInt(rawDiscount) * 10n : 0n
  
  const finalAmount = remaining - discountBigInt - paidBigInt
  const installmentAmount = Math.floor(Number(finalAmount) / Number(installmentCount || 1))

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const resultOutcome = await recordResultAction(panel, {
        appointmentId,
        note: note || undefined,
      })

      if (!resultOutcome.ok) {
        setError(resultOutcome.message)
        return
      }

      const isInstallmentMode = method === 'INSTALLMENT' || method === 'CHEQUE'

      if (paidBigInt > 0n || discountBigInt > 0n || isInstallmentMode) {
        let paymentOutcome
        if (isInstallmentMode) {
          const amountForAction = paidBigInt > 0n ? paidBigInt : remaining
          paymentOutcome = await recordPaymentWithInstallmentsAction(
            panel,
            appointmentId,
            customerId,
            {
              amount: amountForAction.toString(),
              method: method,
              installmentCount: Number(installmentCount),
              firstDueDate: firstDueDate || todayLocalDate(realClock()),
              installmentInterval: `${intervalMonths}_MONTH`,
              discountAmount: discountBigInt.toString(),
              discountReason: discountReason || null,
              forceInstallment: true,
              note: note || null,
            }
          )
        } else {
          paymentOutcome = await recordPaymentAction(
            panel,
            appointmentId,
            {
              amount: paidBigInt.toString(),
              method: method,
              kind: 'FINAL',
              discountAmount: discountBigInt.toString(),
              discountReason: discountReason || null,
              note: note || null,
            }
          )
        }

        if (!paymentOutcome.ok) {
          setError('نتیجه ثبت شد اما خطا در ثبت پرداخت: ' + paymentOutcome.message)
          return
        }
      }

      onClose()
      window.location.reload()
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 text-right" dir="rtl">
      {/* ۱. گرد کردن شدید گوشه‌های کارت اصلی (rounded-[32px]) */}
      <div className="w-full max-w-[600px] rounded-[32px] bg-surface shadow-3 flex flex-col max-h-[90vh] border border-line/50">
        
        {/* ۲. هدر پررنگ‌تر (bg-brand-100) و خط جداکننده بسیار کم‌رنگ (border-line/40) */}
        <div className="flex items-center justify-between border-b border-line/40 bg-brand-100 px-6 py-4 shrink-0 rounded-t-[32px]">
          <div className="flex items-center gap-2 font-bold text-lg text-brand-900">
             <span className="grid size-8 place-items-center rounded-pill bg-brand-200 text-brand-800">
               <Icon name="confirm" size="card" />
             </span>
             ثبت نتیجه نوبت
          </div>
          <button onClick={onClose} disabled={isPending} className="grid size-8 place-items-center rounded-full hover:bg-brand-200 text-brand-800/70 hover:text-brand-900 transition-colors">
            <Icon name="close" size="card" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 overflow-y-auto overflow-x-visible relative">
           
           <div className="flex flex-col gap-1.5 rounded-xl bg-info-bg/10 p-4 border border-info/20">
             <div className="flex items-center justify-between">
               <span className="font-bold text-ink text-lg">{customerName}</span>
               <Icon name="customers" size="card" className="text-info" />
             </div>
             
             <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-ink-2">مبلغ بدهی:</span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatMoney(remaining)} تومان</span>
             </div>
             
             {(discountBigInt > 0n || paidBigInt > 0n) && (
               <div className="flex flex-col gap-1 border-t border-info/20 pt-2 mt-1">
                 {paidBigInt > 0n && (
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-ink-2">پرداختی:</span>
                     <span className="text-sm font-semibold text-ok tabular-nums">{formatMoney(paidBigInt)} تومان</span>
                   </div>
                 )}
                 {discountBigInt > 0n && (
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-ink-2">تخفیف:</span>
                     <span className="text-sm font-semibold text-danger tabular-nums">{formatMoney(discountBigInt)} تومان</span>
                   </div>
                 )}
                 <div className="flex items-center justify-between border-t border-info/20 pt-1 mt-1">
                   <span className="text-sm font-bold text-ink">مانده نهایی:</span>
                   <span className="text-sm font-bold text-brand-700 tabular-nums">{formatMoney(finalAmount)} تومان</span>
                 </div>
               </div>
             )}
           </div>

           <div className="flex flex-col gap-2">
             <label className="text-sm font-semibold text-ink-2">یادداشت نتیجه (اختیاری)</label>
             <textarea 
               value={note}
               onChange={e => setNote(e.target.value)}
               className="w-full rounded-xl border border-line-2 p-3 text-sm min-h-[60px] bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all" 
               placeholder="مثلا: جلسه چهارم، پوست واکنش خوبی نشان داد."
             ></textarea>
           </div>

           <div className="flex flex-col gap-2">
             <label className="text-sm font-semibold text-ink-2">{ADMIN_DEBTS.paymentDialog.amountLabel}</label>
             <div className="relative">
                <input 
                  type="text" 
                  value={amount} 
                  onChange={e => setAmount(formatNumberWithCommas(e.target.value))} 
                  placeholder="در صورت خالی گذاشتن، به عنوان بدهی ثبت می‌شود"
                  className="w-full rounded-xl border border-line-2 p-3 pl-16 text-left font-bold text-lg text-ink bg-surface focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all" 
                  dir="ltr" 
                />
                <span className="absolute left-4 top-3.5 text-sm text-ink-3">{ADMIN_DEBTS.followUp.toman}</span>
             </div>
             <div className="flex gap-2 justify-end mt-1">
                <button type="button" onClick={() => setAmount(ADMIN_DEBTS.paymentDialog.quickAmount1Label)} className="rounded-full border border-line-2 px-3 py-1 text-xs text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors">{ADMIN_DEBTS.paymentDialog.quickAmount1Label}</button>
                <button type="button" onClick={() => setAmount(ADMIN_DEBTS.paymentDialog.quickAmount2Label)} className="rounded-full border border-line-2 px-3 py-1 text-xs text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors">{ADMIN_DEBTS.paymentDialog.quickAmount2Label}</button>
                <button type="button" onClick={() => setAmount(formatNumberWithCommas(Math.floor(Number(remaining) / 10).toString()))} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700 font-semibold hover:bg-brand-100 transition-colors">{ADMIN_DEBTS.paymentDialog.allAmount}</button>
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
                  className="w-full rounded-xl border border-line-2 p-3 text-left text-sm text-ink bg-surface focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all" 
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
                  className="w-full rounded-xl border border-line-2 p-3 text-sm text-ink bg-surface focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all" 
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
                    <select value={installmentCount} onChange={e => setInstallmentCount(e.target.value)} className="rounded-lg border border-line-2 bg-surface p-2 text-sm text-ink outline-none focus:border-brand">
                      {[2,3,4,5,6,12].map(n => <option key={n} value={n}>{toPersianDigits(n)} {ADMIN_DEBTS.paymentDialog.countUnit}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-ink-3">{ADMIN_DEBTS.paymentDialog.intervalLabel}</label>
                    <select 
                      value={intervalMonths} 
                      onChange={e => setIntervalMonths(e.target.value)} 
                      className="rounded-lg border border-line-2 bg-surface p-2 text-sm text-ink outline-none focus:border-brand"
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
                <div className="mt-2 overflow-hidden rounded-lg border border-line bg-surface">
                  <table className="w-full text-sm text-center">
                    <thead className="bg-surface-2 text-xs text-ink-3">
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
                            <td className="py-2 text-xs tabular-nums">{formatMoney(BigInt(installmentAmount))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
             </div>
           )}

           <div className="grid grid-cols-3 gap-4 mt-2 items-end">
              <div className="flex flex-col gap-2"><label className="text-xs text-ink-3">{ADMIN_DEBTS.paymentDialog.trackingNumber}</label><input type="text" placeholder={ADMIN_DEBTS.paymentDialog.trackingPlaceholder} className="w-full h-[42px] rounded-xl border border-line-2 px-3 text-sm text-ink bg-surface focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all" dir="ltr" /></div>
              <div className="flex flex-col gap-2"><Field label={ADMIN_DEBTS.paymentDialog.receiveDate}><JalaliDatePicker value={receiveDate} onChange={setReceiveDate} /></Field></div>
              <div className="flex flex-col gap-2"><Field label={ADMIN_DEBTS.paymentDialog.receiveTime}><TimePicker value={receiveTime} onChange={setReceiveTime} /></Field></div>
           </div>
           
           {error && (
             <div className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger font-semibold border border-danger/20">
               {error}
             </div>
           )}
        </div>

        {/* ۳. فوتر با گوشه‌های پایینی کاملاً گرد و خط جداکننده بسیار کم‌رنگ */}
        <div className="flex items-center justify-between border-t border-line/40 px-6 py-4 bg-surface-2 rounded-b-[32px] shrink-0">
           
           <button onClick={onClose} disabled={isPending} className="rounded-xl border border-line-2 px-6 py-2.5 text-sm font-semibold text-ink-2 bg-surface hover:bg-surface-3 hover:text-ink transition-colors">
             انصراف
           </button>
           
           <button onClick={handleSubmit} disabled={isPending} className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-700 transition-all shadow-brand ring-1 ring-brand-300 ring-offset-2 disabled:opacity-50">
              {isPending ? 'در حال ثبت...' : (<><Icon name="confirm" size="compact" />ثبت نتیجه</>)}
           </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function MethodBtn({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: IconName, label: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all", active ? "border-brand bg-brand-50 text-brand-700 shadow-sm" : "border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700")}>
       <Icon name={icon} size="card" />
       <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}