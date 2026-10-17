// src/app/_debts/debts-forms.tsx

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import type { ComboboxOption } from '@/core/components/combobox'
import { Combobox } from '@/core/components/combobox'
import { Field, MoneyInput, TextArea } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { DEBTS_PAGE, RECEPTION_DEBTS } from '@/app/catalog'
import { realClock } from '@/core/lib/clock'
import { formatDate, formatMoney, dateToLocalDate, todayLocalDate } from '@/core/localization'
import type { DebtRow } from '@/modules/debts'

import {
  recordFollowUpAction,
  recordPaymentAction,
  rescheduleDueDateAction,
  type ActionResult,
} from './actions'

const RECEPTION_PANEL = 'reception' as const

export interface PaymentOptions {
  readonly method: readonly ComboboxOption[]
  readonly kind: readonly ComboboxOption[]
}

type FollowUpRecord = {
  readonly id: string
  readonly note: string | null
  readonly createdAt: Date
  readonly createdBy: { readonly firstName: string; readonly lastName: string | null } | null
}

export function DebtRowActions({
  row,
  options,
  followUps = [],
}: {
  readonly row: DebtRow
  readonly options: PaymentOptions
  readonly followUps?: readonly FollowUpRecord[]
}) {
  const [answer, setAnswer] = useState<ActionResult | null>(null)
  const [paymentOn, setPaymentOn] = useState(false)
  const [followUpOn, setFollowUpOn] = useState(false)
  const [historyOn, setHistoryOn] = useState(false)

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="primary"
          leadingIcon="payment"
          onClick={() => {
            setAnswer(null)
            setPaymentOn(true)
          }}
        >
          {DEBTS_PAGE.actions.payment}
        </Button>
        <Button
          size="small"
          variant="neutral"
          leadingIcon="message"
          onClick={() => {
            setAnswer(null)
            setFollowUpOn(true)
          }}
        >
          {DEBTS_PAGE.actions.followUp}
        </Button>
      </div>

      {paymentOn ? (
        <PaymentDialog
          row={row}
          options={options}
          onAnswer={setAnswer}
          onClose={() => setPaymentOn(false)}
        />
      ) : null}

      {followUpOn ? (
        <FollowUpDialog
          row={row}
          previousFollowUps={followUps}
          onViewAllHistory={() => setHistoryOn(true)}
          onAnswer={setAnswer}
          onClose={() => setFollowUpOn(false)}
        />
      ) : null}

      {historyOn ? (
        <HistoryDialog followUps={followUps} onClose={() => setHistoryOn(false)} />
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

function PaymentDialog({
  row,
  options,
  onAnswer,
  onClose,
}: {
  readonly row: DebtRow
  readonly options: PaymentOptions
  readonly onAnswer: (answer: ActionResult | null) => void
  readonly onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [amountDigits, setAmountDigits] = useState('')
  const [method, setMethod] = useState<string | null>(null)
  const [newDueDate, setNewDueDate] = useState<string | null>(null)
  const formId = useId()
  const titleId = useId()

  const amountRial = amountDigits === '' ? 0n : BigInt(amountDigits)
  const remaining = row.balance - amountRial
  const settles = remaining <= 0n

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (method === null || amountDigits === '') return
    onAnswer(null)
    startTransition(async () => {
      const outcome = await recordPaymentAction(RECEPTION_PANEL, row.appointmentId, {
        amount: amountDigits,
        method,
        kind: settles ? 'FINAL' : 'PARTIAL',
        discountAmount: '',
        discountReason: null,
        note: null,
      })
      if (!outcome.ok) {
        onAnswer(outcome)
        return
      }
      if (!settles && newDueDate !== null) {
        const due = await rescheduleDueDateAction(RECEPTION_PANEL, row.appointmentId, {
          dueDate: newDueDate,
        })
        if (!due.ok) {
          onAnswer(due)
          return
        }
      }
      onClose()
    })
  }

  return (
    <Dialog onClose={onClose} titleId={titleId} title={DEBTS_PAGE.actions.payment}>
      <form id={formId} className="flex flex-col gap-4 px-5 pb-4" onSubmit={submit}>
        <Field label={DEBTS_PAGE.actions.amount} required>
          <MoneyInput name="amount" value={amountDigits} onChange={setAmountDigits} />
        </Field>

        <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm">
          <span className="text-ink-3">{RECEPTION_DEBTS.pay.remainingAfter}</span>
          <span className="font-semibold text-ink tabular-nums">
            {formatMoney(settles ? 0n : remaining)}
          </span>
        </div>

        <Field label={DEBTS_PAGE.actions.method} required>
          <Combobox
            name="method"
            value={method}
            onChange={setMethod}
            options={options.method}
            placeholder={DEBTS_PAGE.actions.method}
            emptyMessage={DEBTS_PAGE.actions.methodEmpty}
          />
        </Field>

        {settles ? null : (
          <Field label={RECEPTION_DEBTS.pay.newDueDate}>
            <JalaliDatePicker value={newDueDate} onChange={setNewDueDate} min={today()} />
          </Field>
        )}
      </form>

      <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {DEBTS_PAGE.actions.cancel}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          loading={pending}
          disabled={method === null || amountDigits === ''}
        >
          {DEBTS_PAGE.actions.confirm}
        </Button>
      </footer>
    </Dialog>
  )
}

function FollowUpDialog({
  row,
  previousFollowUps,
  onViewAllHistory,
  onAnswer,
  onClose,
}: {
  readonly row: DebtRow
  readonly previousFollowUps: readonly FollowUpRecord[]
  readonly onViewAllHistory: () => void
  readonly onAnswer: (answer: ActionResult | null) => void
  readonly onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const formId = useId()
  const titleId = useId()

  const lastFollowUp = previousFollowUps[0]

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (nextContactAt === null) return
    onAnswer(null)
    startTransition(async () => {
      const outcome = await recordFollowUpAction(RECEPTION_PANEL, row.appointmentId, {
        nextContactAt,
        note: note === '' ? null : note,
      })
      if (outcome.ok) {
        onClose()
        return
      }
      onAnswer(outcome)
    })
  }

  return (
    <Dialog onClose={onClose} titleId={titleId} title={DEBTS_PAGE.actions.followUp}>
      <div className="flex flex-col gap-4 px-5 pb-4">
        {lastFollowUp && (
          <div className="flex flex-col gap-2 rounded-md border border-line-2 bg-surface-2 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-2">
                {DEBTS_PAGE.actions.previousFollowUp}
              </span>
              <span className="text-ink-3">
                {formatDate(dateToLocalDate(lastFollowUp.createdAt), 'short')}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-ink">
              {lastFollowUp.note ?? DEBTS_PAGE.actions.noNote}
            </p>
            <span className="text-ink-3">
              {lastFollowUp.createdBy
                ? `${lastFollowUp.createdBy.firstName} ${lastFollowUp.createdBy.lastName ?? ''}`.trim()
                : DEBTS_PAGE.actions.systemUser}
            </span>

            {previousFollowUps.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="small"
                className="mt-2 w-fit text-xs"
                onClick={onViewAllHistory}
              >
                {DEBTS_PAGE.actions.viewAllHistory}
              </Button>
            )}
          </div>
        )}

        <form id={formId} className="flex flex-col gap-4" onSubmit={submit}>
          <Field label={DEBTS_PAGE.actions.nextContactAt} required>
            <JalaliDatePicker value={nextContactAt} onChange={setNextContactAt} min={today()} />
          </Field>
          <Field label={DEBTS_PAGE.actions.followUpNote}>
            <TextArea
              name="note"
              value={note}
              rows={3}
              placeholder={DEBTS_PAGE.actions.followUpNotePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </form>
      </div>

      <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {DEBTS_PAGE.actions.cancel}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          loading={pending}
          disabled={nextContactAt === null}
        >
          {DEBTS_PAGE.actions.confirm}
        </Button>
      </footer>
    </Dialog>
  )
}

function HistoryDialog({
  followUps,
  onClose,
}: {
  readonly followUps: readonly FollowUpRecord[]
  readonly onClose: () => void
}) {
  const titleId = useId()

  return (
    <Dialog onClose={onClose} titleId={titleId} title={DEBTS_PAGE.actions.historyTitle}>
      <div className="max-h-[60vh] overflow-y-auto px-5 pb-6">
        <ul className="flex flex-col gap-3">
          {followUps.map((followUp) => (
            <li key={followUp.id} className="rounded-md border border-line-2 bg-surface-2 p-3 text-sm">
              <p className="whitespace-pre-wrap text-ink">
                {followUp.note ?? DEBTS_PAGE.actions.noNote}
              </p>
              <div className="mt-2 flex items-center justify-between border-t border-line-2 pt-2 text-xs text-ink-3">
                <span>
                  {followUp.createdBy
                    ? `${followUp.createdBy.firstName} ${followUp.createdBy.lastName ?? ''}`.trim()
                    : DEBTS_PAGE.actions.systemUser}
                </span>
                <span>{formatDate(dateToLocalDate(followUp.createdAt), 'short')}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
}

function Dialog({
  children,
  onClose,
  titleId,
  title,
}: {
  readonly children: ReactNode
  readonly onClose: () => void
  readonly titleId: string
  readonly title: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3"
        style={{ width: '100%', maxWidth: '800px' }}
        onClick={stopPropagation}
      >
        <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
            {title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={DEBTS_PAGE.actions.cancel}
            onClick={onClose}
          />
        </header>

        {children}
      </div>
    </div>
  )
}

function FormAnswer({ answer }: { readonly answer: ActionResult | null }) {
  if (answer === null || answer.ok) return null
  return (
    <p className="flex items-center gap-1 text-sm text-danger" role="alert" aria-live="polite">
      <Icon name="error" size="compact" />
      {answer.message}
    </p>
  )
}

function today(): string {
  return todayLocalDate(realClock())
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}