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
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/core/components/button'
import type { ComboboxOption } from '@/core/components/combobox'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { DEBTS_PAGE } from '@/app/catalog'
import { realClock } from '@/core/lib/clock'
import { todayLocalDate } from '@/core/localization'
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
  const [rescheduleOn, setRescheduleOn] = useState(false)

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
            setRescheduleOn(false)
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
            setRescheduleOn(false)
          }}
        >
          {DEBTS_PAGE.actions.followUp}
        </Button>
        <Button
          size="small"
          variant="ghost"
          leadingIcon="calendar"
          onClick={() => {
            setAnswer(null)
            setRescheduleOn((prev) => !prev)
            setPaymentOn(false)
            setFollowUpOn(false)
          }}
        >
          {DEBTS_PAGE.actions.reschedule}
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

      {rescheduleOn ? (
        <RescheduleForm row={row} onAnswer={setAnswer} onDone={() => setRescheduleOn(false)} />
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

/**
 * «ثبت پرداخت» — the amount the customer handed over, and a discount when there is one.
 *
 * The two selects are the closed lists' own keys, and the labels come from the module's
 * catalog — the two sets are the receipt's, and the form is not a second place they are
 * spelled.
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
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [note, setNote] = useState('')
  const formId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (method === null || kind === null || amount === '') return
    onAnswer(null)
    startTransition(async () => {
      const outcome = await recordPaymentAction(RECEPTION_PANEL, row.appointmentId, {
        amount,
        method,
        kind,
        discountAmount,
        discountReason: discountReason === '' ? null : discountReason,
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
      id={formId}
      className="flex w-full flex-col gap-3 rounded-sm border border-line-2 bg-surface-2 p-3 panel:min-w-80"
      onSubmit={submit}
    >
      <Field label={DEBTS_PAGE.actions.amount} required>
        <TextInput
          name="amount"
          value={amount}
          inputMode="numeric"
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-3 panel:flex-row">
        <Field label={DEBTS_PAGE.actions.method} required className="flex-1">
          <Combobox
            name="method"
            value={method}
            onChange={setMethod}
            options={options.method}
            placeholder={DEBTS_PAGE.actions.method}
            emptyMessage={DEBTS_PAGE.actions.methodEmpty}
          />
        </Field>
        <Field label={DEBTS_PAGE.actions.kind} required className="flex-1">
          <Combobox
            name="kind"
            value={kind}
            onChange={setKind}
            options={options.kind}
            placeholder={DEBTS_PAGE.actions.kind}
            emptyMessage={DEBTS_PAGE.actions.kindEmpty}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3 panel:flex-row">
        <Field label={DEBTS_PAGE.actions.discountAmount} className="flex-1">
          <TextInput
            name="discountAmount"
            value={discountAmount}
            inputMode="numeric"
            onChange={(event) => setDiscountAmount(event.target.value)}
          />
        </Field>
        <Field label={DEBTS_PAGE.actions.discountReason} className="flex-1">
          <TextInput
            name="discountReason"
            value={discountReason}
            onChange={(event) => setDiscountReason(event.target.value)}
          />
        </Field>
      </div>
      <Field label={DEBTS_PAGE.actions.note}>
        <TextInput name="note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="small"
          variant="primary"
          loading={pending}
          disabled={method === null || kind === null || amount === ''}
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

/** «ثبت پیگیری» — the call the desk just made, and the day it promised to try again. */
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (nextContactAt === null) return
    onAnswer(null)
    startTransition(async () => {
      const outcome = await recordFollowUpAction(RECEPTION_PANEL, row.appointmentId, {
        nextContactAt,
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
      className="flex flex-col gap-3 rounded-sm border border-line-2 bg-surface-2 p-3 panel:min-w-72"
      onSubmit={submit}
    >
      <Field label={DEBTS_PAGE.actions.nextContactAt} required>
        <JalaliDatePicker value={nextContactAt} onChange={setNextContactAt} min={today()} />
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

/** «تغییر سررسید» — the date the customer promised, which the module stores as an override. */
function RescheduleForm({
  row,
  onAnswer,
  onDone,
}: {
  readonly row: DebtRow
  readonly onAnswer: (answer: ActionResult | null) => void
  readonly onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [dueDate, setDueDate] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dueDate === null) return
    onAnswer(null)
    startTransition(async () => {
      const outcome = await rescheduleDueDateAction(RECEPTION_PANEL, row.appointmentId, {
        dueDate,
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
      className="flex flex-col gap-3 rounded-sm border border-line-2 bg-surface-2 p-3 panel:min-w-72"
      onSubmit={submit}
    >
      <Field label={DEBTS_PAGE.actions.dueDate} required>
        <JalaliDatePicker value={dueDate} onChange={setDueDate} min={today()} />
      </Field>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="small"
          variant="primary"
          loading={pending}
          disabled={dueDate === null}
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

/* ── The pieces the forms share ────────────────────────────────────────────── */

/** A form's answer: nothing while the form is clean, a sentence once the action returned. */
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
