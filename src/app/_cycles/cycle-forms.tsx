/**
 * The cycle surfaces' writers, as the desk and the manager render them.
 *
 * The three pages (`reception/cycles`, `admin/cycles`, `doctor/cycles`) render one row and
 * differ in which writes belong on it, which is why the writers are components in one file
 * and the three pages each pick the ones their panel may offer. The doctor's page offers
 * none — a doctor reads their own courses, and the writes on a course are the desk's and
 * the manager's.
 *
 * ## Why the abandonment is a dialog and the contact result is not
 *
 * «منصرف شد» closes the row and the drop-off report counts it afterwards
 * (`03-data-model.md` §2.4.1 rule 6), so the desk picks a reason from the closed list
 * inside a dialog — the row stays, and a person who tapped by mistake is looking at a
 * state the report still holds. «نتیجه تماس» is the ordinary path and needs no dialog: a
 * contact result is a fact the desk just made true, and undoing it is a later contact
 * result, not a rollback.
 *
 * ## Why the next-session booking reuses the appointments action
 *
 * «رزرو جلسه بعدی» is the appointments surface's own write, and the `cycleId` the form
 * hands the action is what makes the completed session find this course and what takes
 * the course off the list in the same transaction. A second action would be a second
 * scope for one write, and the two would be two requests rather than one.
 *
 * ## Why the contact date is the picker and not a text field
 *
 * The column stores an instant and the desk reads a day, so the day the picker hands the
 * action is a `LocalDate` and the action converts it (`07-localization.md` §6.1: the
 * conversion is the library's, and the second one would be the wrong one).
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { CYCLES_PAGE } from '@/app/catalog'
import { realClock } from '@/core/lib/clock'
import { isValidLocalTime, todayLocalDate } from '@/core/localization'
import { cx } from '@/core/lib'
import { ABANDONMENT_REASON_LABELS } from '@/modules/cycles'
import type { ContactListEntry } from '@/modules/cycles'

import {
  abandonCycleAction,
  completeCycleAction,
  recordContactResultAction,
  type ActionResult,
  type AbandonCycleInput,
  ABANDONMENT_REASONS,
} from './actions'
import { createBookingAction } from '../_appointments/actions'

/** The panel the desk's writers resolve, which is the caller's own. */
const RECEPTION_PANEL = 'reception' as const

/** The panel the manager's writers resolve, which is the caller's own. */
const ADMIN_PANEL = 'admin' as const

/** The reasons the abandonment form offers, labelled by the module's own catalog. */
const REASON_OPTIONS = ABANDONMENT_REASONS.map((key) => ({ value: key, label: ABANDONMENT_REASON_LABELS[key] }))

/* ── The desk's three row actions ───────────────────────────────────────────── */

/** The props a cycle row hands the desk's actions: the entry the desk is acting on. */
export interface ContactListActionsProps {
  readonly entry: ContactListEntry
}

/**
 * The three things the desk does to a course on its list.
 *
 * The row carries the customer and the course, so the booking form is pre-filled from
 * it: the doctor, the service and the customer are the course's own, and the desk only
 * chooses the slot. That is what makes «رزرو جلسه بعدی» a one-step action rather than
 * the booking popup's four fields.
 */
export function ContactListActions({ entry }: ContactListActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [contactOn, setContactOn] = useState(false)
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
  const [bookingOn, setBookingOn] = useState(false)
  const [abandonOn, setAbandonOn] = useState(false)

  function run(action: () => Promise<ActionResult>, onOk: () => void) {
    startTransition(async () => {
      const outcome = await action()
      if (outcome.ok) {
        onOk()
        return
      }
      setAnswer(outcome)
    })
  }

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
            setContactOn((prev) => !prev)
            setBookingOn(false)
          }}
        >
          {CYCLES_PAGE.actions.contact}
        </Button>
        <Button
          size="small"
          variant="primary"
          leadingIcon="appointment"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setBookingOn((prev) => !prev)
            setContactOn(false)
          }}
        >
          {CYCLES_PAGE.actions.book}
        </Button>
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

      {contactOn ? (
        <div className="flex flex-col gap-2 rounded-sm border border-line-2 bg-surface-2 p-3">
          <Field label={CYCLES_PAGE.actions.nextContactAt}>
            <JalaliDatePicker value={nextContactAt} onChange={setNextContactAt} min={today()} />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              variant="primary"
              loading={pending}
              disabled={nextContactAt === null}
              onClick={() =>
                run(
                  () =>
                    recordContactResultAction(RECEPTION_PANEL, entry.id, {
                      nextContactAt: nextContactAt ?? '',
                    }),
                  () => setContactOn(false),
                )
              }
            >
              {CYCLES_PAGE.actions.confirm}
            </Button>
            <Button size="small" variant="ghost" disabled={pending} onClick={() => setContactOn(false)}>
              {CYCLES_PAGE.actions.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {bookingOn ? (
        <BookNextSession entry={entry} onAnswer={setAnswer} onDone={() => setBookingOn(false)} />
      ) : null}

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

/**
 * «رزرو جلسه بعدی» — the course's own facts, and a slot the desk picks.
 *
 * The date is the picker and the time is the text field the booking popup uses for the
 * same field, because the surface has no slot control and the column holds an `HH:mm`
 * string either way.
 */
function BookNextSession({
  entry,
  onAnswer,
  onDone,
}: {
  readonly entry: ContactListEntry
  readonly onAnswer: (answer: FormAnswer | null) => void
  readonly onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [localDate, setLocalDate] = useState<string | null>(null)
  const [localTime, setLocalTime] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (localDate === null || !isValidLocalTime(localTime)) return
    onAnswer(null)
    startTransition(async () => {
      const outcome: ActionResult = await createBookingAction(RECEPTION_PANEL, {
        doctorId: entry.doctorId,
        serviceId: entry.serviceId,
        customerId: entry.customerId,
        cycleId: entry.id,
        localDate,
        localTime,
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
      className="flex flex-col gap-3 rounded-sm border border-line-2 bg-surface-2 p-3"
      onSubmit={submit}
    >
      <div className="flex flex-col gap-3 panel:flex-row">
        <Field label={CYCLES_PAGE.actions.bookDate} required className="flex-1">
          <JalaliDatePicker value={localDate} onChange={setLocalDate} min={today()} />
        </Field>
        <Field label={CYCLES_PAGE.actions.bookTime} required className="flex-1">
          <TextInput
            type="time"
            name="localTime"
            value={localTime}
            onChange={(event) => setLocalTime(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="small" variant="primary" loading={pending} disabled={localDate === null}>
          {CYCLES_PAGE.actions.book}
        </Button>
        <Button type="button" size="small" variant="ghost" disabled={pending} onClick={onDone}>
          {CYCLES_PAGE.actions.cancel}
        </Button>
      </div>
    </form>
  )
}

/* ── The manager's two row actions ──────────────────────────────────────────── */

/** The props a cycle row hands the manager's actions: the course the manager is closing. */
export interface OversightActionsProps {
  readonly cycleId: string
  /** The cycle's status, which decides whether either write belongs on the row. */
  readonly status: string
}

/**
 * The two things the manager does to a course — complete it, or record why it was lost.
 *
 * A course that already ended offers neither: the two are terminal writes, and the
 * module would refuse them. Rendering neither is the honest answer rather than a button
 * the manager taps and reads a sentence about. A bounded course reaches `COMPLETED` on
 * its own, so the completion belongs on the unbounded ones — the row's own total is what
 * the page renders beside it.
 */
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

/** The reason form's own state, so the two panels' abandon dialog is one component. */
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
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {CYCLES_PAGE.actions.abandonTitle}
          </h2>
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

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
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

/** The id the footer's submit button refers to, so the form and its button are one. */
const ABANDON_FORM_ID = 'abandon-cycle-form'

/* ── The pieces the forms share ────────────────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/**
 * A form's answer: nothing while the form is clean, a sentence once the action returned.
 *
 * The tone is the outcome's own and not a guess from the text, because the three forms
 * each have their own sentences and a comparison against them would be a fourth place
 * those sentences are spelled.
 */
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

/** The dimmed backdrop a click outside and an Escape both close. */
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

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}

/**
 * The day the pickers will not go before, as the `LocalDate` string they take.
 *
 * A contact date or a session in the past is not what either field is for; the picker's
 * own `min` keeps the desk on days it can still book, and the value is a plain string
 * because the picker's boundary is the string.
 */
function today(): string {
  return todayLocalDate(realClock())
}
