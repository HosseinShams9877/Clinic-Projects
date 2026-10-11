/**
 * «اعلام مرخصی» — the doctor's own leave-request, opened from the dashboard header.
 *
 * The demo's dashboard opens leave from a header button into a modal, so this is a
 * trigger plus an overlay dialog rather than an inline card. A client component because
 * the two date fields and the reason are one form's state and the module's answer is a
 * sentence the same form renders. The request goes to the manager's approval queue
 * through `requestLeaveAction`; on success the dialog closes.
 */

'use client'

import { useState, useTransition } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'

import { DOCTOR_DASHBOARD } from '@/app/doctor/catalog'
import { requestLeaveAction, type ActionResult } from '@/app/doctor/actions'

export function LeaveForm() {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [answer, setAnswer] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <Button
        variant="neutral"
        leadingIcon="close"
        onClick={() => {
          setStartDate('')
          setEndDate('')
          setReason('')
          setAnswer(null)
          setOpen(true)
        }}
      >
        {DOCTOR_DASHBOARD.leave.title}
      </Button>
    )
  }

  function submit() {
    startTransition(async () => {
      const outcome: ActionResult = await requestLeaveAction({ startDate, endDate, reason })
      if (outcome.ok) {
        setOpen(false)
        return
      }
      setAnswer({ ok: false, message: outcome.message })
    })
  }

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[520px]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{DOCTOR_DASHBOARD.leave.title}</h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={DOCTOR_DASHBOARD.leave.title} onClick={() => setOpen(false)} />
        </header>

        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-ink-2">{DOCTOR_DASHBOARD.leave.lead}</p>
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={DOCTOR_DASHBOARD.leave.from} className="flex-1">
              <TextInput value={startDate} dir="ltr" inputMode="numeric" placeholder="1405-07-01" onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label={DOCTOR_DASHBOARD.leave.to} className="flex-1">
              <TextInput value={endDate} dir="ltr" inputMode="numeric" placeholder="1405-07-03" onChange={(event) => setEndDate(event.target.value)} />
            </Field>
          </div>
          <Field label={DOCTOR_DASHBOARD.leave.reason}>
            <TextInput value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {answer === null ? null : (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert" aria-live="polite">
              <Icon name="error" size="compact" />
              {answer.message}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {DOCTOR_DASHBOARD.leave.cancel}
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            {DOCTOR_DASHBOARD.leave.submit}
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
