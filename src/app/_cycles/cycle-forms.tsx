/**
 * The cycle surfaces' writers, as the desk and the manager render them.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextArea } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { CYCLES_PAGE } from '@/app/catalog'
import { realClock } from '@/core/lib/clock'
import { todayLocalDate, type LocalDate } from '@/core/localization'
import { cx } from '@/core/lib'
import { ABANDONMENT_REASON_LABELS } from '@/modules/cycles'
import type { ContactListEntry } from '@/modules/cycles'

import {
  abandonCycleAction,
  completeCycleAction,
  recordContactResultAction,
  type ActionResult,
  type AbandonCycleInput,
} from './actions'
import {
  BookingDialog,
  type CustomerOption,
  type DoctorOption,
  type ServiceOption,
} from '../_appointments/booking-dialog'

const RECEPTION_PANEL = 'reception' as const
const ADMIN_PANEL = 'admin' as const

const REASON_OPTIONS = Object.entries(ABANDONMENT_REASON_LABELS).map(([value, label]) => ({
  value,
  label,
}))


export function RecordContactDialog({
  isOpen,
  onClose,
  entry,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  entry: ContactListEntry
  onSuccess: () => void
}) {
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const titleId = useId()

  const [contactMethod, setContactMethod] = useState<'PHONE' | 'SMS'>('PHONE')
  const [result, setResult] = useState('PROMISE_TO_PAY')
  const [note, setNote] = useState('')
  const [promiseDate, setPromiseDate] = useState<string | null>(null)
  const [createReminder, setCreateReminder] = useState(true)

  if (!isOpen || typeof document === 'undefined') return null

   const handleSubmit = () => {
    if (nextContactAt === null) return
    startTransition(async () => {
      const outcome = await recordContactResultAction(RECEPTION_PANEL, entry.id, {
        nextContactAt: nextContactAt,
        promiseDate: promiseDate, // 👈 پاس دادن تاریخ وعده
        note: note,               // 👈 پاس دادن توضیحات
        result: result,           // 👈 پاس دادن نتیجه
        contactMethod: contactMethod,
      })
      
      if (outcome.ok) {
        onSuccess()
        onClose()
      } else {
        alert(outcome.message)
      }
    })
  }
  return createPortal(
    <div 
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm text-right" 
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[500px] rounded-2xl bg-surface shadow-2xl flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4 shrink-0 rounded-t-2xl bg-gradient-to-l from-brand-50 to-surface">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand text-white shadow-sm">
              <Icon name="phone" size="card" />
            </span>
            <div>
              <h2 id={titleId} className="text-base font-bold text-ink">
                ثبت تماس
              </h2>
              <p className="text-xs text-ink-2 mt-0.5">{entry.customerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-danger transition-colors">
            <Icon name="close" size="compact" />
          </button>
        </div>
        
        <div className="p-5 flex flex-col gap-4">
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-ink">روش تماس</label>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setContactMethod('PHONE')} 
                className={cx('flex-1 rounded-lg border px-3 py-2 text-sm transition-colors', contactMethod === 'PHONE' ? 'border-brand bg-brand-50 text-brand-700 font-semibold' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2')}
              >
                تماس تلفنی
              </button>
              <button 
                type="button" 
                onClick={() => setContactMethod('SMS')} 
                className={cx('flex-1 rounded-lg border px-3 py-2 text-sm transition-colors', contactMethod === 'SMS' ? 'border-brand bg-brand-50 text-brand-700 font-semibold' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2')}
              >
                پیامک
              </button>
            </div>
          </div>

          <Field label="نتیجه تماس">
            <select 
              value={result} 
              onChange={e => setResult(e.target.value)}
              className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-sm"
            >
              <option value="PROMISE_TO_PAY">وعده پرداخت</option>
              <option value="NO_ANSWER">تماس شد؛ پاسخ نداد</option>
              <option value="SMS_SENT">پیامک ارسال شد</option>
              <option value="DISCOUNT_REQUEST">درخواست تخفیف</option>
              <option value="PROMISE_TOMORROW">قول پرداخت تا فردا</option>
              <option value="AWAITING_REVIEW">در انتظار بررسی</option>
            </select>
          </Field>

          <Field label="توضیحات و یادداشت">
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="توضیحات اضافه..."
              className="w-full resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="تاریخ وعده پرداخت (اختیاری)">
              <JalaliDatePicker value={promiseDate} onChange={setPromiseDate} />
            </Field>
            <Field label={CYCLES_PAGE.actions.nextContactAt} required>
              <JalaliDatePicker value={nextContactAt} onChange={setNextContactAt} min={today()} />
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input 
              type="checkbox" 
              checked={createReminder} 
              onChange={e => setCreateReminder(e.target.checked)}
              className="size-4 rounded border-line-2 text-brand focus:ring-brand"
            />
            <span className="text-sm font-semibold text-ink">ایجاد یادآور برای این پیگیری</span>
          </label>

        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-4 shrink-0 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {CYCLES_PAGE.actions.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending || nextContactAt === null}>
            {isPending ? 'در حال ثبت...' : CYCLES_PAGE.actions.confirm}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ── The desk's three row actions ───────────────────────────────────────────── */

export interface ContactListActionsProps {
  readonly entry: ContactListEntry
  readonly services?: readonly ServiceOption[]
  readonly customers?: readonly CustomerOption[]
  readonly doctorsByServiceId?: Readonly<Record<string, readonly DoctorOption[]>>
  readonly freeSlotsByDoctorId?: Readonly<Record<string, readonly string[]>>
  readonly allowedServiceIds?: readonly string[]
  readonly workingWeekdays?: readonly number[]
  readonly slotMinutes?: number | null
  readonly onOpenContactResult: (entry: ContactListEntry) => void
}

export function ContactListActions({
  entry,
  services,
  customers,
  doctorsByServiceId,
  freeSlotsByDoctorId,
  allowedServiceIds,
  workingWeekdays,
  slotMinutes,
  onOpenContactResult,
}: ContactListActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [abandonOn, setAbandonOn] = useState(false)

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="neutral"
          leadingIcon="message"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            onOpenContactResult(entry)
          }}
        >
          {CYCLES_PAGE.actions.contact}
        </Button>

        {services !== undefined && customers !== undefined ? (
          <BookingDialog
            variant="book"
            panel={RECEPTION_PANEL}
            triggerLabel={CYCLES_PAGE.actions.book}
            triggerVariant="primary"
            triggerSize="small"
            triggerIcon="appointment"
            localDate={today() as LocalDate}
            services={services}
            customers={customers}
            doctorsByServiceId={doctorsByServiceId}
            freeSlotsByDoctorId={freeSlotsByDoctorId}
            allowedServiceIds={allowedServiceIds}
            workingWeekdays={workingWeekdays}
            slotMinutes={slotMinutes}
            continueCycle={{
              cycleId: entry.id,
              serviceId: entry.serviceId,
              customerId: entry.customerId,
              doctorId: entry.doctorId,
            }}
          />
        ) : null}

        <Button
          size="small"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setAbandonOn(true)
          }}
        >
          {CYCLES_PAGE.actions.abandon}
        </Button>
      </div>

      {abandonOn ? (
        <AbandonCycleDialog
          cycleId={entry.id}
          panel={RECEPTION_PANEL}
          onDone={() => setAbandonOn(false)}
          onAnswer={setAnswer}
        />
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

/* ── The manager's two row actions ──────────────────────────────────────────── */

export interface OversightActionsProps {
  readonly cycleId: string
  readonly status: string
}

export function OversightActions({ cycleId, status }: OversightActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [askingComplete, setAskingComplete] = useState(false)
  const [abandonOn, setAbandonOn] = useState(false)

  if (status === 'COMPLETED' || status === 'ABANDONED') return null

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {askingComplete ? (
          <span className="flex items-center gap-2">
            <Button
              size="small"
              variant="primary"
              loading={pending}
              onClick={() => {
                startTransition(async () => {
                  const outcome = await completeCycleAction(ADMIN_PANEL, cycleId)
                  if (outcome.ok) {
                    setAskingComplete(false)
                    return
                  }
                  setAnswer(outcome)
                })
              }}
            >
              {CYCLES_PAGE.actions.completeConfirmYes}
            </Button>
            <Button size="small" variant="ghost" disabled={pending} onClick={() => setAskingComplete(false)}>
              {CYCLES_PAGE.actions.cancel}
            </Button>
          </span>
        ) : (
          <Button
            size="small"
            variant="neutral"
            leadingIcon="confirm"
            disabled={pending}
            onClick={() => {
              setAnswer(null)
              setAskingComplete(true)
            }}
          >
            {CYCLES_PAGE.actions.complete}
          </Button>
        )}
        <Button
          size="small"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setAbandonOn(true)
          }}
        >
          {CYCLES_PAGE.actions.abandon}
        </Button>
      </div>

      {askingComplete ? (
        <p className="text-xs text-ink-2">{CYCLES_PAGE.actions.completeConfirm}</p>
      ) : null}

      {abandonOn ? (
        <AbandonCycleDialog
          cycleId={cycleId}
          panel={ADMIN_PANEL}
          onDone={() => setAbandonOn(false)}
          onAnswer={setAnswer}
        />
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

/* ── The dialog the two panels share ────────────────────────────────────────── */

function AbandonCycleDialog({
  cycleId,
  panel,
  onDone,
  onAnswer,
}: {
  readonly cycleId: string
  readonly panel: 'reception' | 'admin'
  readonly onDone: () => void
  readonly onAnswer: (answer: FormAnswer | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState<string | null>(null)
  const titleId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason === null) return
    const input: AbandonCycleInput = { reason: reason as AbandonCycleInput['reason'] }
    onAnswer(null)
    startTransition(async () => {
      const outcome = await abandonCycleAction(panel, cycleId, input)
      if (outcome.ok) {
        onDone()
        return
      }
      onAnswer(outcome)
    })
  }

  return (
    <Overlay onClose={onDone}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-2xl panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6 bg-gradient-to-l from-brand-50 to-surface rounded-t-xl">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-danger text-white shadow-sm">
              <Icon name="remove" size="card" />
            </span>
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {CYCLES_PAGE.actions.abandonTitle}
            </h2>
          </div>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={CYCLES_PAGE.actions.cancel}
            onClick={onDone}
          />
        </header>

        <p className="px-6 pt-6 text-sm text-ink-2">{CYCLES_PAGE.actions.abandonReasonPrompt}</p>

        <form id={ABANDON_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <Field label={CYCLES_PAGE.actions.abandonReason} required>
            <Combobox
              name="reason"
              value={reason}
              onChange={setReason}
              options={REASON_OPTIONS}
              placeholder={CYCLES_PAGE.actions.abandonReason}
              emptyMessage={CYCLES_PAGE.actions.abandonReasonPrompt}
            />
          </Field>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6 bg-surface-2 rounded-b-xl">
          <Button variant="ghost" onClick={onDone} disabled={pending}>
            {CYCLES_PAGE.actions.cancel}
          </Button>
          <Button type="submit" form={ABANDON_FORM_ID} variant="danger" loading={pending} disabled={reason === null}>
            {CYCLES_PAGE.actions.abandonConfirmYes}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

const ABANDON_FORM_ID = 'abandon-cycle-form'

/* ── The pieces the forms share ────────────────────────────────────────────── */

type FormAnswer = { readonly ok: boolean; readonly message: string }

function FormAnswer({ answer }: { readonly answer: FormAnswer | null }) {
  if (answer === null) return null
  return (
    <p
      className={cx('flex items-center gap-1 text-sm', answer.ok ? 'text-ok' : 'text-danger')}
      role="alert"
      aria-live="polite"
    >
      <Icon name={answer.ok ? 'confirm' : 'error'} size="compact" />
      {answer.message}
    </p>
  )
}

function Overlay({
  children,
  onClose,
}: {
  readonly children: ReactNode
  readonly onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="inline-size-full" onClick={stopPropagation} role="presentation">
        {children}
      </div>
    </div>
  )
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}

function today(): string {
  return todayLocalDate(realClock())
}