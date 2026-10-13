/**
 * The debt surfaces' writers, as the desk renders them.
 *
 * The three staff pages render one row and differ in which writes belong on it. The
 * manager's and the doctor's offer none — the manager's page is read-only oversight
 * and the doctor's is the doctor's own view — and the desk's row carries the three
 * writes the debt list exists to serve: take the money, record the call, honour the
 * date the customer promised.
 *
 * ## Why the payment form is a popover and not a page
 *
 * The receipt is a fact about one row, and the row is what the desk is looking at; a
 * second page would be a second place the three fields live and a second journey back
 * to find the row again. The discount fields are on the same form because a discount
 * is part of the payment and never a separate write (`03-data-model.md` §2.5).
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
 * shows the formatted value and hands the action the digit string. A plain
 * `TextInput` with `inputMode="numeric"` shows `1234567`, which a person has to count
 * the digits of to read; the `MoneyInput` shows `۱٬۲۳۴٬۵۶۷`, which is what the desk
 * reads the figure by.
 *
 * ## Why the follow-up form shows the previous note
 *
 * The desk's next call needs the last call's context, and a row that hides it is a row
 * the desk re-asks the customer about money they already discussed. The previous note
 * is rendered above the new one, with its own date, so the two facts sit beside each
 * other — what was said, and when it was said.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent } from 'react'

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
 * The three things the desk does to a debt on its list.
 *
 * The row carries the balance the three writes are about, and the payment form is
 * pre-filled with it — the desk types the amount the customer handed over, and the
 * discount fields are empty because a discount is the exception and not the rule.
 *
 * The two option lists arrive from the page because the labels are the `payments`
 * module's own, and that barrel is a server-only surface: it writes receipts, and a
 * client component that reached it would pull the writer's graph into the browser
 * bundle. The page reads the module and hands the labels down as strings.
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
            setPaymentOn((prev) => !prev)
            setFollowUpOn(false)
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
            setFollowUpOn((prev) => !prev)
            setPaymentOn(false)
          }}
        >
          {DEBTS_PAGE.actions.followUp}
        </Button>
      </div>

      {paymentOn ? (
        <PaymentForm
          row={row}
          options={options}
          onAnswer={setAnswer}
          onDone={() => setPaymentOn(false)}
        />
      ) : null}

      {followUpOn ? (
        <FollowUpForm row={row} onAnswer={setAnswer} onDone={() => setFollowUpOn(false)} />
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

/**
 * «ثبت دریافت» — the demo's `m-pay`: the amount received, the balance left after it, the
 * method, and (when it does not settle) an optional new due date, all in one form.
 *
 * The remaining-after figure is computed live from the row's balance, and the payment
 * `kind` is derived from it — a payment that clears the balance is `FINAL`, otherwise
 * `PARTIAL` — so the desk never picks it by hand. When a new due date is given on an
 * unsettled balance, the form records the payment and then moves the date, so the two
 * demo fields are one submit.
 *
 * The amount is the `MoneyInput`, whose value is the digit string the action reads and
 * whose display is the formatted Persian amount; the two are the localization layer's
 * own, not this form's.
 */
function PaymentForm({
  row,
  options,
  onAnswer,
  onDone,
}: {
  readonly row: DebtRow
  readonly options: PaymentOptions
  readonly onAnswer: (answer: ActionResult | null) => void
  readonly onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [amountDigits, setAmountDigits] = useState('')
  const [method, setMethod] = useState<string | null>(null)
  const [newDueDate, setNewDueDate] = useState<string | null>(null)
  const formId = useId()

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
      // The demo merges the new due date into m-pay: once the receipt is in, move the
      // promised date if the balance did not clear and the desk named one.
      if (!settles && newDueDate !== null) {
        const due = await rescheduleDueDateAction(RECEPTION_PANEL, row.appointmentId, {
          dueDate: newDueDate,
        })
        if (!due.ok) {
          onAnswer(due)
          return
        }
      }
      onDone()
    })
  }

  return (
    <form
      id={formId}
      className="flex w-full flex-col gap-3 rounded-sm border border-line-2 bg-surface-2 p-3 panel:min-w-80"
      onSubmit={submit}
    >
      <Field label={DEBTS_PAGE.actions.amount} required>
        <MoneyInput
          name="amount"
          value={amountDigits}
          onChange={setAmountDigits}
        />
      </Field>
      <div className="flex items-center justify-between rounded-sm bg-surface px-3 py-2 text-sm">
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
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="small"
          variant="primary"
          loading={pending}
          disabled={method === null || amountDigits === ''}
        >
          {DEBTS_PAGE.actions.confirm}
        </Button>
        <Button type="button" size="small" variant="ghost" disabled={pending} onClick={onDone}>
          {DEBTS_PAGE.actions.cancel}
        </Button>
      </div>
    </form>
  )
}

/**
 * «ثبت پیگیری» — the call the desk just made, the day it promised to try again, and
 * the note the next call reads back.
 *
 * The previous note is rendered above the two fields, with its own date, when the row
 * carries one; a row the desk has never called about shows nothing and the two fields
 * are the whole form. The note is optional — a secretary in a hurry may skip it — and
 * the form's own submit is disabled only while the date is missing, because the date
 * is what the write is about and the note is what the write is *enriched* with.
 */
function FollowUpForm({
  row,
  onAnswer,
  onDone,
}: {
  readonly row: DebtRow
  readonly onAnswer: (answer: ActionResult | null) => void
  readonly onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
  const [note, setNote] = useState('')

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
        onDone()
        return
      }
      onAnswer(outcome)
    })
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-sm border border-line-2 bg-surface-2 p-3 panel:min-w-80"
      onSubmit={submit}
    >
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
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="small"
          variant="primary"
          loading={pending}
          disabled={nextContactAt === null}
        >
          {DEBTS_PAGE.actions.confirm}
        </Button>
        <Button type="button" size="small" variant="ghost" disabled={pending} onClick={onDone}>
          {DEBTS_PAGE.actions.cancel}
        </Button>
      </div>
    </form>
  )
}

/**
 * The previous follow-up, as the two facts the desk reads before the new call: when it
 * was, and what was said on it.
 *
 * Rendered above the two fields and never instead of them, because the desk is about
 * to make a second call and the row's history is what the second call reads first. A
 * row with no follow-up, or a follow-up whose note was skipped, renders nothing — a
 * "no previous note" placeholder above a form that is itself a note would be noise,
 * and the form's own empty state is the placeholder's job.
 */
function PreviousFollowUp({ row }: { readonly row: DebtRow }) {
  if (row.lastFollowUp === null) return null
  if (row.lastFollowUp.note === null) return null
  const at = formatDate(dateToLocalDate(row.lastFollowUp.at), 'short')
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-line-2 bg-surface px-3 py-2 text-xs">
      <span className="font-semibold text-ink-2">{DEBTS_PAGE.actions.previousFollowUp}</span>
      <span className="text-ink-3">{at}</span>
      <p className="whitespace-pre-line text-ink">{row.lastFollowUp.note}</p>
    </div>
  )
}

/* ── The pieces the forms share ────────────────────────────────────────────── */

/**
 * A form's answer, as the sentence the failure became.
 *
 * A success closes the form and revalidates the list, so only a failure reaches the
 * render — and the action's success shape carries no sentence to print.
 */
function FormAnswer({ answer }: { readonly answer: ActionResult | null }) {
  if (answer === null || answer.ok) return null
  return (
    <p className="flex items-center gap-1 text-sm text-danger" role="alert" aria-live="polite">
      <Icon name="error" size="compact" />
      {answer.message}
    </p>
  )
}

/** The day the pickers will not go before, as the `LocalDate` string they take. */
function today(): string {
  return todayLocalDate(realClock())
}