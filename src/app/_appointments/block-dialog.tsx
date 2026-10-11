/**
 * The «بستن یک ساعت» popup — closing an empty slot from a day cell.
 *
 * A slot block is the calendar holding a time so the engine does not offer it
 * (`blockHours` in the module). This is the desk's and manager's affordance for it:
 * opened from an empty cell the «+» would otherwise book, it asks a duration and an
 * optional reason and writes the block through `blockHoursAction`. The day and the
 * doctor come from the cell, so neither is typed.
 */

'use client'

import { useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { formatTime, type LocalDate, type LocalTime } from '@/core/localization'

import { BLOCK_POPUP } from './catalog'
import { blockHoursAction, type ActionResult, type BlockInput } from './actions'

export interface BlockDialogProps {
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly doctorId: string
  readonly localDate: LocalDate
  /** The slot the cell sits on, as a stored `HH:mm`. */
  readonly time: string
}

/** The block's default length, in minutes — one slot of the grid's own step. */
const DEFAULT_DURATION = 30

export function BlockDialog(props: BlockDialogProps) {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(String(DEFAULT_DURATION))
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDuration(String(DEFAULT_DURATION))
          setReason('')
          setResult(null)
          setOpen(true)
        }}
        className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-sm border border-line-2 px-2 py-1 text-[11px] text-ink-3 hover:bg-surface-2"
      >
        <Icon name="blocked" size="compact" />
        {BLOCK_POPUP.trigger}
      </button>
    )
  }

  async function submit() {
    setPending(true)
    const input: BlockInput = {
      doctorId: props.doctorId,
      localDate: props.localDate,
      localTime: props.time,
      durationMinutes: Number.parseInt(duration, 10) || DEFAULT_DURATION,
      reason: reason === '' ? undefined : reason,
    }
    const outcome = await blockHoursAction(props.panel, input)
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
            {BLOCK_POPUP.title}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={BLOCK_POPUP.close} onClick={() => setOpen(false)} />
        </header>

        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-ink-2 tabular-nums">{formatTime(props.time as LocalTime)}</p>
          <Field label={BLOCK_POPUP.duration} required>
            <TextInput
              type="number"
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </Field>
          <Field label={BLOCK_POPUP.reason}>
            <TextInput type="text" value={reason} onChange={(event) => setReason(event.target.value)} />
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
            {BLOCK_POPUP.cancel}
          </Button>
          <Button variant="danger" loading={pending} onClick={() => void submit()}>
            {BLOCK_POPUP.save}
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
