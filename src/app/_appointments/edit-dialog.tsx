/**
 * The «ویرایش نوبت» popup — a booking's in-place correction, from a day cell's menu.
 *
 * ## Why the slots are read for the row's own day too
 *
 * The dialog always reads its slots through `loadFreeSlotsAction`, with the row's
 * own id in `excludeAppointmentId`. That is what keeps the slot the desk is
 * holding in the list: `buildFreeSlots` drops any candidate a row already holds,
 * and the row the desk is editing *is* a row on the day already — without the
 * exclusion, the slot it is holding would vanish from the list it is choosing
 * from. The grid's own `freeSlotsByDoctorId` map cannot do this, because it is
 * computed for every row on the day and has no notion of "except this one".
 *
 * The remote read is issued from the dialog's own opening click and from the two
 * handlers that change its keys (the day strip and the doctor select) — never
 * from an effect. A `setState` inside an effect is what the lint rule
 * `react-hooks/set-state-in-effect` forbids, and the click is where the state
 * change actually originates; the effect is kept only to drop the in-flight
 * request's result once the dialog closes.
 *
 * ## Why the service list is filtered by the chosen doctor
 *
 * The same reason the booking popup filters it: a doctor offers the services the
 * clinic assigned them, not the whole catalogue. The map `servicesByDoctorId`
 * carries the assignment, and the select renders only the ids the chosen doctor
 * holds — the doctor is the column the row sits in, and the service is what that
 * doctor can perform. A doctor the map has no entry for (a doctor assigned
 * nothing) offers the whole catalogue, which is the same fallback the booking
 * popup's `allowedServiceIds` applies.
 */

'use client'

import { useId, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import {
  asLocalDate,
  formatTime,
  jalaliParts,
  jalaliWeekday,
  toPersianDigits,
  weekdayName,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import { weekDays } from '@/modules/appointments'

import { EDIT_POPUP, SLOT_PICKER } from './catalog'
import {
  loadFreeSlotsAction,
  updateAppointmentAction,
  type ActionResult,
  type EditInput,
} from './actions'
import type { ServiceOption } from './booking-dialog'

/** One doctor the manager may move a booking to. */
export interface DoctorOption {
  readonly id: string
  readonly name: string
}

export interface EditDialogProps {
  readonly appointmentId: string
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly services: readonly ServiceOption[]
  readonly doctorOptions: readonly DoctorOption[]
  readonly canChangeDoctor: boolean
  /**
   * The service ids each doctor offers, keyed by doctor id — the same map the
   * booking popup reads. A doctor the map has no entry for offers the whole
   * catalogue (the booking popup's own fallback).
   */
  readonly servicesByDoctorId?: Readonly<Record<string, readonly string[]>>
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
  const [slots, setSlots] = useState<readonly string[] | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const titleId = useId()
  /** The in-flight remote read, so a click that supersedes it can cancel it. */
  const requestRef = useRef(0)

  const offeredServices = servicesForDoctor(props.services, props.servicesByDoctorId, values.doctorId)

  /**
   * The read for the day and doctor the form is on.
   *
   * Called from the opening click and from the two handlers that change its keys.
   * The request id guards against a slower read overwriting a faster one: a read
   * that is no longer the latest is dropped, not applied.
   */
  function fetchSlots(doctorId: string, localDate: LocalDate): void {
    const request = requestRef.current + 1
    requestRef.current = request
    setSlotsLoading(true)
    setSlots(null)
    void loadFreeSlotsAction(
      props.panel,
      doctorId,
      localDate,
      props.appointmentId,
    ).then((outcome) => {
      if (requestRef.current !== request) return
      setSlotsLoading(false)
      setSlots(outcome.ok ? outcome.slots : [])
    })
  }

  if (!open) {
    return (
      <Button
        size="small"
        variant="neutral"
        leadingIcon="settings"
        onClick={() => {
          const initial = initialValues(props)
          setValues(initial)
          setResult(null)
          setSlots(null)
          setOpen(true)
          fetchSlots(initial.doctorId, initial.localDate)
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

  const visibleSlots = slots ?? []

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
                onChange={(event) => {
                  const doctorId = event.target.value
                  setValues({ ...values, doctorId, serviceId: '', localTime: '' })
                  fetchSlots(doctorId, values.localDate)
                }}
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
              {offeredServices.map((option) => (
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
                  onClick={() => {
                    setValues({ ...values, localDate: day, localTime: '' })
                    fetchSlots(values.doctorId, day)
                  }}
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

          {slotsLoading ? (
            <p className="text-xs text-ink-3">{SLOT_PICKER.loading}</p>
          ) : visibleSlots.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-ink-2">{SLOT_PICKER.label}</legend>
              <div className="grid grid-cols-3 gap-2 panel:grid-cols-5">
                {visibleSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={slot === values.localTime}
                    onClick={() => setValues({ ...values, localTime: slot })}
                    className={cx(
                      'rounded-xs border px-2 py-2 text-xs tabular-nums',
                      slot === values.localTime
                        ? 'border-brand bg-brand-50 font-semibold text-brand-700'
                        : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {formatTime(slot as LocalTime)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1 text-sm text-warn" role="status">
                <Icon name="warning" size="compact" />
                {SLOT_PICKER.empty}
              </p>
              <Field label={EDIT_POPUP.localTime} required>
                <TextInput
                  type="time"
                  value={values.localTime}
                  onChange={(event) => setValues({ ...values, localTime: event.target.value })}
                />
              </Field>
            </div>
          )}

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

/**
 * The services the chosen doctor offers — the catalogue filtered by the
 * doctor's own assignment. A doctor with no entry in the map offers the whole
 * catalogue, which is the booking popup's own fallback.
 */
function servicesForDoctor(
  services: readonly ServiceOption[],
  servicesByDoctorId: Readonly<Record<string, readonly string[]>> | undefined,
  doctorId: string,
): readonly ServiceOption[] {
  if (servicesByDoctorId === undefined) return services
  const allowed = servicesByDoctorId[doctorId]
  if (allowed === undefined) return services
  const set = new Set(allowed)
  return services.filter((option) => set.has(option.id))
}

function initialValues(props: EditDialogProps): EditValues {
  return {
    doctorId: props.current.doctorId,
    serviceId: props.current.serviceId,
    localDate: asLocalDate(props.current.localDate),
    localTime: props.current.localTime,
  }
}

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

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}