/**
 * The debt surfaces' writers, as the desk renders them.
 *
 * The three staff pages render one row and differ in which writes belong on it. The
 * manager's and the doctor's offer none — the manager's page is read-only oversight
 * and the doctor's is the doctor's own view — and the desk's row carries the two
 * writes the debt list exists to serve: take the money, record the call.
 *
 * ## Why the two forms are dialogs and not inline panels
 *
 * The receipt is a fact about one row, and the row is what the desk is looking at —
 * but a form rendered inline under the row's buttons pushes the rest of the table
 * down and makes the desk scroll to see the fields it just opened. The dialog is
 * the shell's own overlay: one panel, one backdrop, one close button, and the row
 * stays where it was. The two forms are the only writes the desk's row carries, and
 * both open in the same shell so the desk learns one interaction and reuses it.
 *
 * ## Why the due date is the picker and not a text field
 *
 * The column stores an instant and the desk reads a day, so the day the picker hands
 * the action is a `LocalDate` and the action converts it — the library's conversion,
 * and a second one would be the one that lands on the wrong day.
 *
 * ## Why the amount is the `MoneyInput` and not a `TextInput`
 *
 * `06-constants.md` §6: money on screen is Toman, in Persian digits, with the `٬`
 * thousands separator. The desk types a number, not a formatted string; the input
 * shows the formatted value and hands the action the digit string.
 *
 * ## Why the follow-up form shows the previous note
 *
 * The desk's next call needs the last call's context, and a row that hides it is a
 * row the desk re-asks the customer about money they already discussed. The
 * previous note is rendered above the new one, with its own date, so the two facts
 * sit beside each other — what was said, and when it was said.
 */

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

/** The panel the desk's writers resolve, which is the caller's own. */
const RECEPTION_PANEL = 'reception' as const

/** The payment form's two closed lists, as the page hands them to the row. */
export interface PaymentOptions {
  readonly method: readonly ComboboxOption[]
  readonly kind: readonly ComboboxOption[]
}

/**
 * The two things the desk does to a debt on its list, as two dialog triggers.
 */
export function DebtRowActions({
  row,
  options,
}: {
  readonly row: DebtRow
  readonly options: PaymentOptions
}) {
  const [answer, setAnswer] = useState<ActionResult | null>(null)
  const [paymentOn, setPaymentOn] = useState(false)
  const [followUpOn, setFollowUpOn] = useState(false)

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
        <FollowUpDialog row={row} onAnswer={setAnswer} onClose={() => setFollowUpOn(false)} />
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

/**
 * «ثبت دریافت» — the amount received, the balance left after it, the method, and
 * (when it does not settle) an optional new due date, all in one dialog.
 */
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

/**
 * «ثبت پیگیری» — the call the desk just made, the day it promised to try again, and
 * the note the next call reads back.
 */
function FollowUpDialog({
  row,
  onAnswer,
  onClose,
}: {
  readonly row: DebtRow
  readonly onAnswer: (answer: ActionResult | null) => void
  readonly onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const formId = useId()
  const titleId = useId()

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
      <form id={formId} className="flex flex-col gap-4 px-5 pb-4" onSubmit={submit}>
        <PreviousFollowUp row={row} />
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

/**
 * The shell's own dialog: one backdrop, one panel, one close button.
 */
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

/**
 * The previous follow-up, as the two facts the desk reads before the new call.
 */
function PreviousFollowUp({ row }: { readonly row: DebtRow }) {
  if (row.lastFollowUp === null) return null
  if (row.lastFollowUp.note === null) return null
  const at = formatDate(dateToLocalDate(row.lastFollowUp.at), 'short')
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line-2 bg-surface-2 px-3 py-2 text-xs">
      <span className="font-semibold text-ink-2">{DEBTS_PAGE.actions.previousFollowUp}</span>
      <span className="text-ink-3">{at}</span>
      <p className="whitespace-pre-line text-ink">{row.lastFollowUp.note}</p>
    </div>
  )
}

/* ── The pieces the dialogs share ──────────────────────────────────────────── */

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