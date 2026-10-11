/**
 * «اعلام مرخصی» — the doctor's own leave-request form, on their dashboard.
 *
 * A client component because the two date fields and the reason are one form's state
 * and the module's answer is a sentence the same form renders. The request goes to the
 * manager's approval queue through `requestLeaveAction`; on success the fields clear and
 * the form shows the done sentence.
 */

'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'

import { DOCTOR_DASHBOARD } from '@/app/doctor/catalog'
import { requestLeaveAction, type ActionResult } from '@/app/doctor/actions'

export function LeaveForm() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [answer, setAnswer] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const outcome: ActionResult = await requestLeaveAction({ startDate, endDate, reason })
      if (outcome.ok) {
        setStartDate('')
        setEndDate('')
        setReason('')
        setAnswer({ ok: true, message: DOCTOR_DASHBOARD.leave.sent })
        return
      }
      setAnswer({ ok: false, message: outcome.message })
    })
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-ink">{DOCTOR_DASHBOARD.leave.title}</h2>
        <p className="text-sm text-ink-2">{DOCTOR_DASHBOARD.leave.lead}</p>
      </div>
      <div className="flex flex-col gap-3 panel:flex-row panel:items-end">
        <Field label={DOCTOR_DASHBOARD.leave.from} className="flex-1">
          <TextInput value={startDate} dir="ltr" inputMode="numeric" placeholder="1405-07-01" onChange={(event) => setStartDate(event.target.value)} />
        </Field>
        <Field label={DOCTOR_DASHBOARD.leave.to} className="flex-1">
          <TextInput value={endDate} dir="ltr" inputMode="numeric" placeholder="1405-07-03" onChange={(event) => setEndDate(event.target.value)} />
        </Field>
        <Field label={DOCTOR_DASHBOARD.leave.reason} className="flex-1">
          <TextInput value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Button variant="primary" loading={pending} onClick={submit}>
          {DOCTOR_DASHBOARD.leave.submit}
        </Button>
      </div>
      {answer === null ? null : (
        <p
          className={answer.ok ? 'flex items-center gap-1 text-sm text-ok' : 'flex items-center gap-1 text-sm text-danger'}
          role="alert"
          aria-live="polite"
        >
          <Icon name={answer.ok ? 'confirm' : 'error'} size="compact" />
          {answer.message}
        </p>
      )}
    </section>
  )
}
