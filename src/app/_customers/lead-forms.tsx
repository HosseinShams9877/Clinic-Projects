/**
 * The lead cartable's three writers, as the reception desk renders them.
 *
 * The cartable is a read and three writes — a lead is entered, followed up, or lost —
 * and the three are three states of one client component rather than three components,
 * because the three are the row's own affordances and the row is what the desk acts
 * on. A failure the module raised lands on the row that raised it, which is the same
 * answer the day grid's row actions give and for the same reason.
 *
 * ## Why a lost lead asks and a followed one does not
 *
 * «از دست رفته» closes the cartable's row and the report counts it afterwards
 * (`03-data-model.md` §2.1), so the desk confirms it — the row stays, and a person
 * who tapped by mistake is looking at a state the report still holds. «تماس» is the
 * ordinary path and needs no confirmation: a follow-up is a fact the desk just made
 * true, and undoing it is a later follow-up, not a rollback.
 *
 * ## Why the follow-up date is the picker and not a text field
 *
 * The column stores an instant and the desk reads a day, so the day the picker hands
 * the action is a `LocalDate` and the action converts it (`07-localization.md` §6.1:
 * the conversion is the library's, and the second one would be the wrong one). A typed
 * date would be a Gregorian calendar control on a Persian surface, which is the thing
 * the picker exists to keep off the page.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextArea, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { LEADS_PAGE } from '@/app/catalog'
import { realClock } from '@/core/lib/clock'
import { todayLocalDate } from '@/core/localization'
import { cx } from '@/core/lib'

import {
  createLeadAction,
  markLeadLostAction,
  recordFollowUpAction,
  type ActionResult,
  type LeadInput,
} from './actions'
import { ACQUISITION_SOURCE_LABELS } from '@/modules/customers'
import { AcquisitionSource } from '@/core/constants'

/** The panel the desk's three writers resolve, which is the caller's own. */
const PANEL = 'reception' as const

/** The sources the lead form's select offers, from the module's own closed set. */
const SOURCE_OPTIONS = Object.keys(AcquisitionSource).map((key) => ({
  value: AcquisitionSource[key as keyof typeof AcquisitionSource],
  label: ACQUISITION_SOURCE_LABELS[AcquisitionSource[key as keyof typeof AcquisitionSource]],
}))

/* ── The manual-lead form ──────────────────────────────────────────────────── */

/**
 * «ثبت لید دستی» — a person who contacted the clinic, entered from the cartable.
 *
 * The dedupe is the module's and the sentence it raises comes back onto this form: a
 * mobile the file already holds is a customer and not a new lead, and the desk reads
 * that as information rather than as a refusal.
 */
export function NewLeadDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const titleId = useId()

  if (!open) {
    return (
      <Button variant="primary" leadingIcon="customer" onClick={() => setOpen(true)}>
        {LEADS_PAGE.newLead.title}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input: LeadInput = {
      mobile: asFormString(event.currentTarget, 'mobile'),
      firstName: asFormString(event.currentTarget, 'firstName'),
      lastName: asFormString(event.currentTarget, 'lastName') || undefined,
      acquisitionSource: asFormString(event.currentTarget, 'acquisitionSource') || undefined,
      note: asFormString(event.currentTarget, 'note') || undefined,
    }
    startTransition(async () => {
      const outcome: ActionResult = await createLeadAction(PANEL, input)
      if (outcome.ok) {
        setOpen(false)
        return
      }
      setAnswer(outcome)
    })
  }

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {LEADS_PAGE.newLead.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={LEADS_PAGE.actions.cancel}
            onClick={() => setOpen(false)}
          />
        </header>

        <p className="px-6 pt-6 text-sm text-ink-2">{LEADS_PAGE.newLead.lead}</p>

        <form id={NEW_LEAD_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={LEADS_PAGE.newLead.firstName} required className="flex-1">
              <TextInput name="firstName" />
            </Field>
            <Field label={LEADS_PAGE.newLead.lastName} className="flex-1">
              <TextInput name="lastName" />
            </Field>
          </div>

          <Field label={LEADS_PAGE.newLead.mobile} required>
            <TextInput name="mobile" type="tel" inputMode="tel" />
          </Field>

          <Field label={LEADS_PAGE.newLead.source}>
            <Combobox
              name="acquisitionSource"
              value={null}
              onChange={() => {}}
              options={SOURCE_OPTIONS}
              placeholder={LEADS_PAGE.newLead.source}
              emptyMessage={LEADS_PAGE.newLead.sourceEmpty}
            />
          </Field>

          <Field label={LEADS_PAGE.newLead.note}>
            <TextArea name="note" rows={3} placeholder={LEADS_PAGE.newLead.notePlaceholder} />
          </Field>

          <FormAnswer answer={answer} />
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {LEADS_PAGE.actions.cancel}
          </Button>
          <Button type="submit" form={NEW_LEAD_FORM_ID} variant="primary" loading={pending}>
            {LEADS_PAGE.newLead.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the footer's submit button refers to, so the form and its button are one. */
const NEW_LEAD_FORM_ID = 'new-lead-form'

/* ── The row's own three actions ───────────────────────────────────────────── */

/** The row's own props: the lead the desk is acting on. */
export interface LeadRowActionsProps {
  readonly leadId: string
  /** The lead's status, which decides whether «تماس» and «از دست رفته» belong. */
  readonly status: string | null
}

/**
 * The three things the desk does to a row, as the state permits them.
 *
 * A converted or lost lead is closed, and the two actions a closed row would offer are
 * the two the module would refuse; the component renders neither, which is the honest
 * answer rather than a button the desk taps and reads a sentence about.
 */
export function LeadRowActions({ leadId, status }: LeadRowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [askingLost, setAskingLost] = useState(false)
  const [followUpOn, setFollowUpOn] = useState(false)
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)

  const closed = status === 'CONVERTED' || status === 'LOST'

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

  if (closed) return null

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
            setFollowUpOn((prev) => !prev)
          }}
        >
          {LEADS_PAGE.actions.followUp}
        </Button>
        <Link href={`/reception/appointments`} label={LEADS_PAGE.actions.book} icon="appointment" />

        {askingLost ? (
          <span className="flex items-center gap-2">
            <Button
              size="small"
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => markLeadLostAction(PANEL, leadId), () => setAskingLost(false))
              }
            >
              {LEADS_PAGE.actions.lostConfirmYes}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={pending}
              onClick={() => setAskingLost(false)}
            >
              {LEADS_PAGE.actions.cancel}
            </Button>
          </span>
        ) : (
          <Button
            size="small"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setAnswer(null)
              setAskingLost(true)
            }}
          >
            {LEADS_PAGE.actions.lost}
          </Button>
        )}
      </div>

      {followUpOn ? (
        <div className="flex flex-col gap-2 rounded-sm border border-line-2 bg-surface-2 p-3">
          <Field label={LEADS_PAGE.actions.nextContactAt}>
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
                  () => recordFollowUpAction(PANEL, leadId, nextContactAt ?? ''),
                  () => setFollowUpOn(false),
                )
              }
            >
              {LEADS_PAGE.actions.confirm}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={pending}
              onClick={() => setFollowUpOn(false)}
            >
              {LEADS_PAGE.actions.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {askingLost ? (
        <p className="text-xs text-ink-2">{LEADS_PAGE.actions.lostConfirm}</p>
      ) : null}

      <FormAnswer answer={answer} />
    </div>
  )
}

/* ── The pieces the two forms share ────────────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/**
 * A form's answer: nothing while the form is clean, a sentence once the action returned.
 *
 * The tone is the outcome's own and not a guess from the text, because the cartable's
 * three forms each have their own sentences and a comparison against them would be a
 * fourth place those sentences are spelled.
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

/** One link styled as the row's small action, because the row's «نوبت» is a route. */
function Link({
  href,
  label,
  icon,
}: {
  readonly href: string
  readonly label: string
  readonly icon: Parameters<typeof Icon>[0]['name']
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-xs border border-line-2 bg-surface px-3 py-2 text-sm font-semibold text-ink-2 no-underline hover:bg-surface-2"
    >
      <Icon name={icon} size="compact" />
      {label}
    </a>
  )
}

/** One field's value from a submitted form, or '' when the field was absent. */
function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement ? value.value : ''
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}

/**
 * The day the follow-up picker will not go before, as a `LocalDate` string.
 *
 * A follow-up in the past is a note about a call that already happened, which is not
 * what the field is for; the picker's own `min` keeps the desk on days it can still
 * call, and the value is a plain string because the picker's boundary is the string.
 */
/** The day the follow-up picker will not go before, as the `LocalDate` string it takes. */
function today(): string {
  return todayLocalDate(realClock())
}
