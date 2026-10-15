/**
 * The «ویرایش نوبت» popup — a booking's in-place correction, from a day cell's menu.
 */

'use client'

import { useId, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field } from '@/core/components/form'
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
  readonly servicesByDoctorId?: Readonly<Record<string, readonly string[]>>
  readonly current: {
    readonly doctorId: string
    readonly doctorName: string
    readonly serviceId: string
    readonly localDate: string
    readonly localTime: string
  }
}

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
  const requestRef = useRef(0)

  const offeredServices = servicesForDoctor(
    props.services,
    props.servicesByDoctorId,
    values.doctorId,
  )

  function fetchSlots(doctorId: string, localDate: LocalDate): void {
    if (doctorId === '') {
      setSlotsLoading(false)
      setSlots([])
      return
    }
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
        <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
              <Icon name="edit" size="card" />
            </span>
            {EDIT_POPUP.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={EDIT_POPUP.close}
            onClick={() => setOpen(false)}
          />
        </header>

        <div className="flex flex-col gap-4 px-5 pb-2">
          <Field label={EDIT_POPUP.doctor} required>
            <select
              className={CONTROL_CLASSES}
              value={values.doctorId}
              onChange={(event) => {
                const doctorId = event.target.value
                setValues({ ...values, doctorId, localTime: '' })
                fetchSlots(doctorId, values.localDate)
              }}
            >
              <option value="">{SLOT_PICKER.doctorFirst}</option>
              {props.doctorOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>

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
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
              <Icon name="calendar" size="compact" />
              {EDIT_POPUP.localDate}
            </legend>
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
                    'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-all',
                    day === values.localDate
                      ? 'border-brand bg-brand font-bold text-ink-inverse shadow-brand'
                      : 'border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
                  )}
                >
                  <span
                    className={cx(
                      'text-[11px]',
                      day === values.localDate ? 'text-ink-inverse/80' : 'text-ink-3',
                    )}
                  >
                    {weekdayName(jalaliWeekday(day))}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {toPersianDigits(jalaliParts(day).day)}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {values.doctorId === '' ? (
            <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-3">
              <Icon name="info" size="compact" />
              {SLOT_PICKER.doctorFirst}
            </p>
          ) : slotsLoading ? (
            <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-3">
              <Icon name="info" size="compact" />
              {SLOT_PICKER.loading}
            </p>
          ) : visibleSlots.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                <Icon name="clock" size="compact" />
                {SLOT_PICKER.label}
              </legend>
              <div className="grid grid-cols-3 gap-2 panel:grid-cols-5">
                {visibleSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={slot === values.localTime}
                    onClick={() => setValues({ ...values, localTime: slot })}
                    className={cx(
                      'rounded-md border px-2 py-2.5 text-sm font-semibold tabular-nums transition-all',
                      slot === values.localTime
                        ? 'border-brand bg-brand text-ink-inverse shadow-brand'
                        : 'border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
                    )}
                  >
                    {formatTime(slot as LocalTime)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <p
              className="flex items-center gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn"
              role="status"
            >
              <Icon name="warning" size="compact" />
              {SLOT_PICKER.empty}
            </p>
          )}

          {result !== null && !result.ok ? (
            <p
              className="flex items-center gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
              role="alert"
            >
              <Icon name="error" size="compact" />
              {result.message}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
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