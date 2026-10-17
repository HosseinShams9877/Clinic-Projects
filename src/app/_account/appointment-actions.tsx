// src/app/_account/appointment-actions.tsx

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/core/components/button'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { AppointmentStatus } from '@/core/constants'
import { canTransition, CUSTOMER_APPOINTMENTS_PAGE } from '@/modules/appointments'
import { cx } from '@/core/lib'

import {
  cancelOwnAppointmentAction,
  rescheduleOwnAppointmentAction,
  getAvailableSlotsAction,
  type PanelActionResult,
} from './actions'

const ACTIONABLE = [AppointmentStatus.Booked, AppointmentStatus.AwaitingArrival] as const

function asStatus(value: string): AppointmentStatus {
  return value as AppointmentStatus
}

export interface OwnAppointmentActionsProps {
  readonly appointmentId: string
  readonly status: string
  readonly currentLocalDate: string
}

export function OwnAppointmentActions({
  appointmentId,
  status,
  currentLocalDate,
}: OwnAppointmentActionsProps) {
  const actionable = ACTIONABLE.some((value) => canTransition(asStatus(status), value))
  if (!actionable) return null

  return (
    <div className="flex flex-col gap-3">
      <CancelAction appointmentId={appointmentId} status={status} />
      <RescheduleAction appointmentId={appointmentId} status={status} currentDate={currentLocalDate} />
    </div>
  )
}

function CancelAction({
  appointmentId,
  status,
}: {
  readonly appointmentId: string
  readonly status: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (!canTransition(asStatus(status), AppointmentStatus.Cancelled)) return null

  function run() {
    startTransition(async () => {
      const outcome = await cancelOwnAppointmentAction(appointmentId)
      setMessage(outcome.ok ? CUSTOMER_APPOINTMENTS_PAGE.cancelled : outcome.message)
      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="danger"
        size="small"
        leadingIcon="close"
        disabled={pending}
        onClick={() => {
          if (window.confirm(CUSTOMER_APPOINTMENTS_PAGE.actions.cancelConfirm)) run()
        }}
      >
        {CUSTOMER_APPOINTMENTS_PAGE.actions.cancel}
      </Button>
      {message === null ? null : (
        <p className="text-xs text-danger" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

function RescheduleAction({
  appointmentId,
  status,
  currentDate,
}: {
  readonly appointmentId: string
  readonly status: string
  readonly currentDate: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [localDate, setLocalDate] = useState<string>(currentDate)
  const [localTime, setLocalTime] = useState<string>('')
  const [slots, setSlots] = useState<readonly string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const canReschedule = canTransition(asStatus(status), AppointmentStatus.Rescheduled)

  async function fetchSlots(date: string) {
    setLoadingSlots(true)
    setLocalTime('')
    const outcome = await getAvailableSlotsAction({ appointmentId, localDate: date })
    setLoadingSlots(false)
    if (outcome.ok && 'slots' in outcome) {
      setSlots(outcome.slots)
    } else {
      setSlots([])
    }
  }

  function handleOpen() {
    setOpen(true)
    void fetchSlots(localDate)
  }

  function onDateChange(date: string) {
    setLocalDate(date)
    void fetchSlots(date)
  }

  function submit() {
    startTransition(async () => {
      const outcome: PanelActionResult = await rescheduleOwnAppointmentAction({
        appointmentId,
        localDate,
        localTime,
      })
      setMessage(outcome.ok ? CUSTOMER_APPOINTMENTS_PAGE.rescheduled : outcome.message)
      if (outcome.ok) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  if (!canReschedule) return null

  if (!open) {
    return (
      <Button
        variant="neutral"
        size="small"
        leadingIcon="calendar"
        disabled={pending}
        onClick={handleOpen}
      >
        {CUSTOMER_APPOINTMENTS_PAGE.actions.reschedule}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <Field label={CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.dateLabel} required>
        <JalaliDatePicker value={localDate} onChange={onDateChange} name="localDate" />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">
          {CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.timeLabel}
        </span>
        {loadingSlots ? (
          <p className="text-xs text-ink-3">{CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.loading}</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-ink-3">{CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.noSlots}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => setLocalTime(time)}
                className={cx(
                  'rounded-md border p-2 text-center text-sm transition-colors',
                  localTime === time
                    ? 'border-brand bg-brand-50 font-bold text-brand-700'
                    : 'border-line bg-surface text-ink hover:border-brand-300',
                )}
              >
                {time}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="small"
          disabled={pending || localTime === ''}
          onClick={submit}
        >
          {CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.submit}
        </Button>
        <Button type="button" variant="ghost" size="small" onClick={() => setOpen(false)}>
          <Icon name="close" size="compact" />
        </Button>
      </div>
      {message === null ? null : (
        <p className="text-xs text-danger" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}