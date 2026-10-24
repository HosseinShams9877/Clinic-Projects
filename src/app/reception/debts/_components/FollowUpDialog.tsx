'use client'

import { useState, useEffect, useTransition, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/core/components/icons'
import { formatMoney, todayLocalDate } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { TimePicker } from '@/core/components/date-picker/TimePicker'
import { Field } from '@/core/components/form'
import { recordFollowUpWithDetailsAction } from '@/app/_debts/actions'
import { ADMIN_DEBTS } from '@/app/admin/catalog'

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
}

export function FollowUpDialog({ 
  isOpen, onClose, appointmentId, customerName, amountDue, onSuccess 
}: { 
  isOpen: boolean, onClose: () => void, appointmentId: string,
  customerName: string, amountDue: bigint | string, onSuccess: () => void 
}) {
  const isClient = useIsClient()
  const [contactMethod] = useState<'PHONE' | 'SMS'>('PHONE')
  const [result, setResult] = useState('PROMISE_TO_PAY')
  const [note, setNote] = useState('')
  const [promiseDate, setPromiseDate] = useState<string>('')
  const [promiseTime, setPromiseTime] = useState<string>('')
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>(todayLocalDate(realClock()))
  const [nextFollowUpTime, setNextFollowUpTime] = useState<string>('')
  const [createReminder, setCreateReminder] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isClient || !isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [isClient, isOpen])

  if (!isOpen || !isClient) return null

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await recordFollowUpWithDetailsAction(
        'reception',
        appointmentId,
        {
          contactMethod, result, note, promiseDate, promiseTime,
          nextFollowUpDate, nextFollowUpTime, createReminder,
        }
      )
      if (res.ok) {
        onSuccess()
        window.location.reload()
      } else {
        alert(res.message)
      }
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 text-right" dir="rtl">
      
      {/* کانتینر اصلی با استایل مستقیم برای گردی و پنهان کردن مازاد */}
      <div 
        className="w-full max-w-[500px] bg-surface shadow-3 border border-line/50 flex flex-col max-h-[95vh]"
        style={{ borderRadius: '24px', overflow: 'hidden' }}
      >
        
        {/* هدر با استایل مستقیم و !important برای گردی */}
        <div 
          className="flex items-center justify-between border-b border-line/40 bg-brand-50 px-5 py-4 shrink-0 !rounded-t-[24px]"
        >
          <div className="flex items-center gap-2 font-bold text-base text-brand-900">
             <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-brand-700">
               <Icon name="phone" size="compact" />
             </span>
             {ADMIN_DEBTS.followUp.title}
          </div>
          <button onClick={onClose} disabled={isPending} className="grid size-8 place-items-center rounded-full hover:bg-brand-100 text-brand-800 hover:text-brand-900 transition-colors">
            <Icon name="close" size="compact" />
          </button>
        </div>

        {/* بخش محتوا */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
           <div className="flex items-center justify-between rounded-2xl bg-info-bg/10 p-4 border border-info/20">
             <div className="flex flex-col gap-1">
                <span className="font-bold text-ink text-sm">{customerName}</span>
                <span className="text-xs text-ink-2">{ADMIN_DEBTS.followUp.amountDue} <span className="font-semibold text-ink tabular-nums">{formatMoney(BigInt(amountDue))}</span> {ADMIN_DEBTS.followUp.toman}</span>
             </div>
             <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info/10 text-info">
                <Icon name="customers" size="compact" />
             </span>
           </div>

           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_DEBTS.followUp.resultLabel}</label>
             <select value={result} onChange={e => setResult(e.target.value)} className="w-full rounded-xl border border-line-2 px-3 py-2.5 text-sm text-ink-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 bg-surface transition-all">
                <option value="PROMISE_TO_PAY">{ADMIN_DEBTS.followUp.result.PROMISE_TO_PAY}</option>
                <option value="NO_ANSWER">{ADMIN_DEBTS.followUp.result.NO_ANSWER}</option>
                <option value="SMS_SENT">{ADMIN_DEBTS.followUp.result.SMS_SENT}</option>
                <option value="DISCOUNT_REQUEST">{ADMIN_DEBTS.followUp.result.DISCOUNT_REQUEST}</option>
                <option value="PROMISE_TOMORROW">{ADMIN_DEBTS.followUp.result.PROMISE_TOMORROW}</option>
                <option value="AWAITING_REVIEW">{ADMIN_DEBTS.followUp.result.AWAITING_REVIEW}</option>
             </select>
           </div>

           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-semibold text-ink-3">{ADMIN_DEBTS.followUp.note}</label>
             <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-xl border border-line-2 p-3 text-sm min-h-[60px] bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none transition-all resize-none" placeholder={ADMIN_DEBTS.followUp.notePlaceholder}></textarea>
           </div>

           <div className="grid grid-cols-1 gap-4 border-t border-line/40 pt-4">
             <div className="flex flex-col gap-1.5">
               <label className="text-xs font-semibold text-ink-3">{ADMIN_DEBTS.followUp.promiseDate}</label>
               <div className="grid grid-cols-2 gap-3">
                 <Field label={ADMIN_DEBTS.followUp.promiseDate}><JalaliDatePicker value={promiseDate} onChange={setPromiseDate} /></Field>
                 <Field label={ADMIN_DEBTS.followUp.promiseTime}><TimePicker value={promiseTime} onChange={setPromiseTime} /></Field>
               </div>
             </div>

             <div className="flex flex-col gap-1.5">
               <label className="text-xs font-semibold text-ink-3">{ADMIN_DEBTS.followUp.nextFollowUpDate}</label>
               <div className="grid grid-cols-2 gap-3">
                 <Field label={ADMIN_DEBTS.followUp.nextFollowUpDate}><JalaliDatePicker value={nextFollowUpDate} onChange={setNextFollowUpDate} /></Field>
                 <Field label={ADMIN_DEBTS.followUp.nextFollowUpTime}><TimePicker value={nextFollowUpTime} onChange={setNextFollowUpTime} /></Field>
               </div>
             </div>
           </div>

           <label className="flex items-center gap-2 mt-1 cursor-pointer">
             <input type="checkbox" checked={createReminder} onChange={(e) => setCreateReminder(e.target.checked)} className="size-4 rounded border-line-2 text-brand focus:ring-brand accent-brand" />
             <span className="text-xs text-ink-2">{ADMIN_DEBTS.followUp.reminder}</span>
           </label>
        </div>

        {/* فوتر با استایل مستقیم و !important */}
        <div 
          className="flex items-center justify-end gap-2 border-t border-line/40 px-5 py-4 bg-surface-2 shrink-0 !rounded-b-[24px]"
        >
           <button onClick={onClose} disabled={isPending} className="rounded-xl border border-line-2 px-4 py-2 text-sm font-semibold text-ink-2 bg-surface hover:bg-surface-3 hover:text-ink transition-colors">
             {ADMIN_DEBTS.followUp.cancel}
           </button>
           <button onClick={handleSubmit} disabled={isPending} className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-ink-inverse flex items-center gap-2 hover:bg-brand-700 transition-all shadow-brand ring-1 ring-brand-300 ring-offset-2 disabled:opacity-50">
              {isPending ? ADMIN_DEBTS.followUp.saving : (<><Icon name="confirm" size="compact" />{ADMIN_DEBTS.followUp.submit}</>)}
           </button>
        </div>
      </div>
    </div>,
    document.body
  )
}