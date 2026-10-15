/**
 * The cycle surfaces' writers, as the desk and the manager render them.
 *
 * ## Why the abandonment is a dialog and the contact result is not
 *
 * «منصرف شد» closes the row and the drop-off report counts it afterwards
 * (`03-data-model.md` §2.4.1 rule 6), so the desk picks a reason from the closed list
 * inside a dialog — the row stays, and a person who tapped by mistake is looking at a
 * state the report still holds. «نتیجه تماس» is the ordinary path and needs no dialog.
 *
 * ## Why the next-session booking opens the booking popup
 *
 * «رزرو جلسه بعدی» is the booking surface's own popup, opened with `continueCycle`
 * set: the service, the customer and the doctor are the course's own, and the desk
 * only chooses the day and the slot. The popup's own `createBookingAction` handles
 * the write, and the `cycleId` it carries is what links the completed session back
 * to its course in the same transaction.
 *
 * ## Why the reason options come from the labels record
 *
 * `ABANDONMENT_REASON_LABELS` is the module's own `Record` over the closed list —
 * the stored value as the key, the Persian sentence as the value. A `Combobox` wants
 * `{ value, label }` pairs, and the record's own entries are exactly those two facts,
 * so `Object.entries` is what builds the select.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field } from '@/core/components/form'
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

/** The panel the desk's writers resolve, which is the caller's own. */
const RECEPTION_PANEL = 'reception' as const

/** The panel the manager's writers resolve, which is the caller's own. */
const ADMIN_PANEL = 'admin' as const

/** The reasons the abandonment form offers, labelled by the module's own catalog. */
const REASON_OPTIONS = Object.entries(ABANDONMENT_REASON_LABELS).map(([value, label]) => ({
  value,
  label,
}))

/* ── The desk's three row actions ───────────────────────────────────────────── */

/**
 * The props a cycle row hands the desk's actions.
 *
 * `doctorsByServiceId` and `freeSlotsByDoctorId` come from the page's own day grid
 * read, and are what the booking popup renders its doctor select and its slot
 * picker from. A page that does not hand them (the cartable) renders the actions
 * without the booking popup's two pickers.
 */
export interface ContactListActionsProps {
  readonly entry: ContactListEntry
  readonly services?: readonly ServiceOption[]
  readonly customers?: readonly CustomerOption[]
  readonly doctorsByServiceId?: Readonly<Record<string, readonly DoctorOption[]>>
  readonly freeSlotsByDoctorId?: Readonly<Record<string, readonly string[]>>
  readonly allowedServiceIds?: readonly string[]
  readonly workingWeekdays?: readonly number[]
  readonly slotMinutes?: number | null
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
}: ContactListActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [contactOn, setContactOn] = useState(false)
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
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