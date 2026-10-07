/**
 * The two actions a customer's own appointment row offers — cancel and reschedule.
 *
 * The server component renders the rows from the session-scoped read; this island
 * carries the two writes, because a click is a state change and the sentence the
 * module raises comes back onto the same row. The split is `02-architecture.md` §6's:
 * a read and a write are two components and not one that does both.
 *
 * ## Why the row shows only what the state machine permits
 *
 * The state machine is the module's, and this component does not re-derive it. A
 * terminal row — cancelled, rescheduled, completed — offers nothing, so a person
 * cannot press a button the module is certain to refuse.
 *
 * ## Why the actions carry no customer id
 *
 * The row's own `appointmentId` is the only fact the island hands the action, and the
 * action resolves the customer from the session (`09-security.md` §7). A prop named
 * `customerId` on this component would be a prop a parent could pass another person's
 * id to, and the property the panel's isolation rests on is that no such prop exists.
 */

'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/components/button'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { AppointmentStatus } from '@/core/constants'
import { canTransition, CUSTOMER_APPOINTMENTS_PAGE } from '@/modules/appointments'

import {
  cancelOwnAppointmentAction,
  rescheduleOwnAppointmentAction,
  type PanelActionResult,
} from './actions'

/**
 * The statuses that still belong to the person, and so still carry the two actions.
 *
 * Named as a cast rather than typed at the prop, because the row's status arrives as
 * a `string` from the module's read and the state machine is the module's: this
 * component asks it and never re-derives it.
 */
const ACTIONABLE = [AppointmentStatus.Booked, AppointmentStatus.AwaitingArrival] as const

/** A row's status, as the state machine's own type. */
function asStatus(value: string): AppointmentStatus {
  return value as AppointmentStatus
}

/** The row's own props: the id, the status, and the two facts the reschedule starts from. */
export interface OwnAppointmentActionsProps {
  readonly appointmentId: string
  readonly status: string
  /** The day the session currently sits on, so the picker opens on a useful month. */
  readonly currentLocalDate: string
}

/** Cancel and reschedule, as the session's status permits them. */
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

/** «لغو نوبت» — one button, and the sentence its outcome renders. */
function CancelAction({
  appointmentId,
  status,
}: {
  readonly appointmentId: string
  readonly status: string
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (!canTransition(asStatus(status), AppointmentStatus.Cancelled)) return null

  function run() {
    startTransition(async () => {
      const outcome = await cancelOwnAppointmentAction(appointmentId)
      setMessage(outcome.ok ? CUSTOMER_APPOINTMENTS_PAGE.cancelled : outcome.message)
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

/** «جابه‌جایی نوبت» — a day and a time, submitted to the booking path's own guards. */
function RescheduleAction({
  appointmentId,
  status,
  currentDate,
}: {
  readonly appointmentId: string
  readonly status: string
  readonly currentDate: string
}) {
  const [open, setOpen] = useState(false)
  const [localDate, setLocalDate] = useState<string>(currentDate)
  const [localTime, setLocalTime] = useState<string>('')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (!canTransition(asStatus(status), AppointmentStatus.Rescheduled)) return null

  function submit() {
    startTransition(async () => {
      const outcome: PanelActionResult = await rescheduleOwnAppointmentAction({
        appointmentId,
        localDate,
        localTime,
      })
      setMessage(outcome.ok ? CUSTOMER_APPOINTMENTS_PAGE.rescheduled : outcome.message)
      if (outcome.ok) setOpen(false)
    })
  }

  if (!open) {
    return (
      <Button
        variant="neutral"
        size="small"
        leadingIcon="calendar"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {CUSTOMER_APPOINTMENTS_PAGE.actions.reschedule}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <Field label={CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.dateLabel} required>
        <JalaliDatePicker value={localDate} onChange={setLocalDate} name="localDate" />
      </Field>
      <Field label={CUSTOMER_APPOINTMENTS_PAGE.rescheduleForm.timeLabel} required>
        <TextInput
          name="localTime"
          value={localTime}
          onChange={(event) => setLocalTime(event.target.value)}
          inputMode="numeric"
          placeholder="HH:MM"
        />
      </Field>
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
