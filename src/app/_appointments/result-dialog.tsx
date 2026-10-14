/**
 * The «ثبت نتیجه» / «حاضر شد» popup — a completed session, with an optional note
 * about the outcome.
 *
 * Where the row's other actions are one-click transitions, this one opens a dialog
 * because a completion is the appointment's last fact and the note is the one piece
 * of it the desk may want to record for the profile. The dialog is the same shape
 * as `BlockDialog` — a single optional text field and two buttons — because the
 * only thing it asks is the sentence.
 *
 * ## The two callers, and why the trigger is a prop
 *
 * The dialog is called from two places on the row, and the two callers mean the
 * same thing by it:
 *
 * - A real booking that reached `ARRIVED` shows the «ثبت نتیجه» trigger — the desk
 *   is recording the outcome of a session that was performed.
 * - A slot block shows the «حاضر شد» trigger — the block is the receptionist's
 *   "this hour is spoken for", and marking it arrived is the desk's way of closing
 *   it as a completed hour. The block reaches `COMPLETED` in one step (`BOOKED` →
 *   `COMPLETED`, which the transition table permits for exactly this case) because
 *   a block has no `AWAITING_ARRIVAL` or `ARRIVED` stage to walk through: it is not
 *   a customer's visit, it is a closure of the hour.
 *
 * The trigger's label and icon therefore come from the caller, and the rest — the
 * note field, the action, the module's refusal — is the dialog's own.
 *
 * The transition itself is the module's `recordResult`, and the note is stored in
 * the appointment's own `resultNote` column — distinct from `cancelReason` and
 * `noShowReason`, because a completed session is a third outcome and one column
 * shared between three would lose which is which.
 */

'use client'

import { useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'

import { RESULT_POPUP } from './catalog'
import { recordResultAction, type ActionResult } from './actions'

export interface ResultDialogProps {
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly appointmentId: string
  /** The trigger button's label. Defaults to «ثبت نتیجه». */
  readonly triggerLabel?: string
  /** The trigger button's icon. Defaults to `confirm`. `null` removes it. */
  readonly triggerIcon?: IconName | null
}

export function ResultDialog(props: ResultDialogProps) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  if (!open) {
    return (
      <Button
        size="small"
        variant="neutral"
        leadingIcon={props.triggerIcon === null ? undefined : (props.triggerIcon ?? 'confirm')}
        onClick={() => {
          setNote('')
          setResult(null)
          setOpen(true)
        }}
      >
        {props.triggerLabel ?? RESULT_POPUP.trigger}
      </Button>
    )
  }

  async function submit() {
    setPending(true)
    const outcome = await recordResultAction(
      props.panel,
      props.appointmentId,
      note === '' ? undefined : note,
    )
    setPending(false)
    if (outcome.ok) {
      setOpen(false)
      return
    }
    setResult(outcome)
  }

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[460px]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {RESULT_POPUP.title}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={RESULT_POPUP.close} onClick={() => setOpen(false)} />
        </header>

        <div className="flex flex-col gap-4 p-5">
          <Field label={RESULT_POPUP.note}>
            <TextInput
              type="text"
              value={note}
              placeholder={RESULT_POPUP.notePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {result !== null && !result.ok ? (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {result.message}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {RESULT_POPUP.cancel}
          </Button>
          <Button variant="primary" loading={pending} onClick={() => void submit()}>
            {RESULT_POPUP.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The dimmed backdrop a click outside and an Escape both close. */
function Overlay({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
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