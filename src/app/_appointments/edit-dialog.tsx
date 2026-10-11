/**
 * The «ویرایش نوبت» popup — a booking's in-place correction, from a day cell's menu.
 *
 * Where `BookingDialog` is the three-step create, this is the one-screen edit: the
 * fields a booking already has, changed and saved onto the same row through
 * `updateAppointmentAction`. The doctor select is rendered only when the caller may
 * move the booking between doctors — the manager — because the desk's secretary
 * corrects the service, day, time and duration of the doctor already on the row
 * (the `SECRETARY_EDIT_PRICE` rule's sibling: a secretary does not reassign a doctor).
 *
 * No price field: the module re-snapshots the price from the chosen service, so there
 * is nothing here for a caller to type and the price rule is honoured by construction.
 */

'use client'

import { useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import {
  asLocalDate,
  jalaliParts,
  jalaliWeekday,
  toPersianDigits,
  weekdayName,
  type LocalDate,
} from '@/core/localization'
import { weekDays } from '@/modules/appointments'

import { EDIT_POPUP } from './catalog'
import { updateAppointmentAction, type ActionResult, type EditInput } from './actions'
import type { ServiceOption } from './booking-dialog'

/** One doctor the manager may move a booking to. */
export interface DoctorOption {
  readonly id: string
  readonly name: string
}

export interface EditDialogProps {
  readonly appointmentId: string
  readonly panel: 'reception' | 'doctor' | 'admin'
  /** The services the first field offers — the catalogue the page already read. */
  readonly services: readonly ServiceOption[]
  /** The doctors the manager may reassign to; rendered only when `canChangeDoctor`. */
  readonly doctorOptions: readonly DoctorOption[]
  /** Whether the doctor select is shown — the manager's panel only. */
  readonly canChangeDoctor: boolean
  /** The row's own current values, which the fields open on. */
  readonly current: {
    readonly doctorId: string
    readonly serviceId: string
    readonly localDate: string
    readonly localTime: string
  }
}

/** What the edit form holds while it is open. */
interface EditValues {
  readonly doctorId: string
  readonly serviceId: string
  readonly localDate: LocalDate
  readonly localTime: string
}

export function EditDialog(props: EditDialogProps) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<EditValues>(() => initialValues(props))
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  if (!open) {
    return (
      <Button
        size="small"
        variant="neutral"
        leadingIcon="settings"
        onClick={() => {
          setValues(initialValues(props))
          setResult(null)
          setOpen(true)
        }}
      >
        {EDIT_POPUP.trigger}
      </Button>
    )
  }

  async function submit() {
    setPending(true)
    const input: EditInput = {
      appointmentId: props.appointmentId,
      doctorId: props.canChangeDoctor ? values.doctorId : undefined,
      serviceId: values.serviceId,
      localDate: values.localDate,
      localTime: values.localTime,
    }
    const outcome = await updateAppointmentAction(props.panel, input)
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
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[560px]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {EDIT_POPUP.title}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={EDIT_POPUP.close} onClick={() => setOpen(false)} />
        </header>

        <div className="flex flex-col gap-4 p-5">
          {props.canChangeDoctor ? (
            <Field label={EDIT_POPUP.doctor}>
              <select
                className={CONTROL_CLASSES}
                value={values.doctorId}
                onChange={(event) => setValues({ ...values, doctorId: event.target.value })}
              >
                {props.doctorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label={EDIT_POPUP.service} required>
            <select
              className={CONTROL_CLASSES}
              value={values.serviceId}
              onChange={(event) => setValues({ ...values, serviceId: event.target.value })}
            >
              <option value="">{EDIT_POPUP.chooseService}</option>
              {props.services.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-ink-2">{EDIT_POPUP.localDate}</legend>
            <div className="grid grid-cols-4 gap-2 panel:grid-cols-7">
              {weekDays(asLocalDate(props.current.localDate)).map((day: LocalDate) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={day === values.localDate}
                  onClick={() => setValues({ ...values, localDate: day })}
                  className={cx(
                    'rounded-xs border px-2 py-2 text-xs',
                    day === values.localDate
                      ? 'border-brand bg-brand-50 font-semibold text-brand-700'
                      : 'border-line-2 bg-surface text-ink-2',
                  )}
                >
                  {`${weekdayName(jalaliWeekday(day))} ${toPersianDigits(jalaliParts(day).day)}`}
                </button>
              ))}
            </div>
          </fieldset>

          <Field label={EDIT_POPUP.localTime} required>
            <TextInput
              type="time"
              value={values.localTime}
              onChange={(event) => setValues({ ...values, localTime: event.target.value })}
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
            {EDIT_POPUP.cancel}
          </Button>
          <Button variant="primary" loading={pending} onClick={() => void submit()}>
            {EDIT_POPUP.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The form's opening values, with the stored day branded for the week strip. */
function initialValues(props: EditDialogProps): EditValues {
  return {
    doctorId: props.current.doctorId,
    serviceId: props.current.serviceId,
    localDate: asLocalDate(props.current.localDate),
    localTime: props.current.localTime,
  }
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
