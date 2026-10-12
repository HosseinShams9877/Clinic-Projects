/**
 * The booking popup — `02-architecture.md` §219's three-step booking popup, as the
 * reception desk and the doctor's quick-book both use it.
 *
 * The three steps are the ones `10-testing-strategy.md` line 308 names for the
 * public site — service → day and time → name and mobile — in the desk's own order.
 * The two surfaces share an engine and differ in who is typing: the public page
 * (Phase 8) asks a customer, this one asks the desk, and the desk's version already
 * knows the doctor and the day from the column it was opened from.
 *
 * ## Why the steps are the module's own vocabulary
 *
 * Step one is the service, because a service is what carries the duration and the
 * price the module's `BookArgs` needs. Step two is the day and the time, offered as
 * the week the grid is already on — a Jalali week starting on شنبه. Step three is
 * the person, found by the mobile that is their identity.
 *
 * ## The three filters, and why they are props
 *
 * Three things a page that opens this popup may already know:
 *
 * - `allowedServiceIds`: the services the column's doctor offers. When given, step
 *   one's `<select>` shows only those — a service a doctor does not perform does not
 *   appear in their column's popup.
 * - `workingWeekdays`: the weekdays (0=شنبه … 6=جمعه) the column's doctor works. When
 *   given, step two's week strip renders only those days.
 * - `doctorsByServiceId`: the doctors who offer each service, for the header's
 *   «ثبت نوبت» button. When given, step two's doctor field becomes a `<select>`
 *   filtered by the chosen service instead of a read-only text input.
 *
 * Every one of them is optional; a caller that omits all three gets the pre-filter
 * popup the dialog had before, which is what the doctor's own quick-book still uses.
 *
 * ## Why the time is a free-form input and not a slot list
 *
 * The slot engine (`generateSlots`) speaks a `SlotDay` the desk has not assembled
 * yet. The popup offers the whole working day and lets the module be the authority on
 * what it accepts. A slot list lands with the public booking page.
 *
 * ## What is deliberately not here
 *
 * The price and the deposit. They are read from the service row inside the action's
 * transaction and never cross this boundary, because the `SECRETARY_EDIT_PRICE`
 * toggle is off by default.
 */

'use client'

import { useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import type { ButtonProps, ButtonSize } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'
import {
  formatDate,
  formatNumber,
  formatTime,
  isValidLocalTime,
  jalaliParts,
  jalaliWeekday,
  normalizeMobile,
  toPersianDigits,
  weekdayName,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import { weekDays } from '@/modules/appointments'

import { BOOKING_POPUP } from '@/app/catalog'
import {
  createBookingAction,
  quickBookAction,
  type ActionResult,
  type BookingInput,
} from './actions'

/** One service the first step offers, as the page read it. */
export interface ServiceOption {
  readonly id: string
  readonly name: string
  readonly durationMinutes: number
}

/** The shape of the row the third step's customer search returns. */
export interface CustomerOption {
  readonly id: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
}

/** One doctor the popup's own doctor select may offer. */
export interface DoctorOption {
  readonly id: string
  readonly name: string
}

/** The dialog's own props: the column it was opened from, and what it may book. */
export interface BookingDialogProps {
  /**
   * Which doctor the booking is for, when the caller already knows it (a grid column).
   * Optional: a caller that opens the popup without a doctor (the header's «ثبت نوبت»
   * button, which lets the user pick from a service) omits it, and step two's doctor
   * field becomes a `<select>` fed by `doctorsByServiceId`.
   */
  readonly doctorId?: string
  /** The doctor's name, when `doctorId` is given. */
  readonly doctorName?: string
  /** The day the grid is showing, as the week strip's anchor. */
  readonly localDate: LocalDate
  readonly services: readonly ServiceOption[]
  /** The customers the desk can pick, searched by mobile or name. */
  readonly customers: readonly CustomerOption[]
  /** The button's own label — «نوبت جدید» at the desk, the doctor's shortcut at home. */
  readonly triggerLabel: string
  /** Which action the confirm step calls. */
  readonly variant: 'book' | 'quickBook'
  /** The panel the action resolves, which is the caller's own. */
  readonly panel: 'reception' | 'doctor' | 'admin'
  /** A service preselected on open. Optional. */
  readonly defaultServiceId?: string
  /** A time preselected on open, as a stored `HH:mm`. Optional. */
  readonly defaultTime?: string
  /**
   * The services the doctor offers. When given, step one's `<select>` shows only
   * those. When omitted, every service in `services` is offered.
   */
  readonly allowedServiceIds?: readonly string[]
  /**
   * The weekdays (0=شنبه … 6=جمعه) the doctor works. When given, step two's week
   * strip renders only those days. When omitted, every day of the week is offered.
   */
  readonly workingWeekdays?: readonly number[]
  /**
   * The doctors who offer each service, for a popup that has no preselected doctor.
   * When given, step two's doctor field becomes a `<select>` filtered by the chosen
   * service. When omitted, the field is a read-only text input.
   */
  readonly doctorsByServiceId?: Readonly<Record<string, readonly DoctorOption[]>>
  /** The trigger button's variant; defaults to the desk's soft chip. */
  readonly triggerVariant?: ButtonProps['variant']
  /** The trigger button's size; defaults to small. */
  readonly triggerSize?: Exclude<ButtonSize, 'icon'>
  /** The trigger's leading icon, or `null` for none; defaults to `appointment`. */
  readonly triggerIcon?: IconName | null
}

/** The three steps, as the progress strip numbers them. */
type Step = 1 | 2 | 3

/** What the dialog holds across the steps. */
interface BookingValues {
  readonly serviceId: string
  readonly doctorId: string
  readonly localDate: LocalDate
  readonly localTime: string
  readonly customerId: string
  readonly mobile: string
  readonly firstName: string
  readonly lastName: string
}

/**
 * The popup. A client component because the three steps are three states of one
 * form, and the module's answer is a sentence the same form renders.
 */
export function BookingDialog(props: BookingDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [values, setValues] = useState<BookingValues>(emptyValues(props))
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  if (!open) {
    return (
      <Button
        variant={props.triggerVariant ?? 'soft'}
        size={props.triggerSize ?? 'small'}
        leadingIcon={props.triggerIcon === null ? undefined : (props.triggerIcon ?? 'appointment')}
        onClick={() => {
          setStep(1)
          setResult(null)
          setValues(emptyValues(props))
          setOpen(true)
        }}
      >
        {props.triggerLabel}
      </Button>
    )
  }

  const service = props.services.find((option) => option.id === values.serviceId)
  const offeredServices = offeredServicesOf(props)
  const weekdays = offeredWeekdaysOf(props)
  const doctorChoices = doctorsForChosenService(props, values.serviceId)

  async function submit() {
    if (values.doctorId === '') return
    setPending(true)
    const input: BookingInput = {
      doctorId: values.doctorId,
      serviceId: values.serviceId,
      localDate: values.localDate,
      localTime: values.localTime,
      customerId: values.customerId === '' ? undefined : values.customerId,
      mobile: values.mobile,
      firstName: values.firstName,
      lastName: values.lastName === '' ? undefined : values.lastName,
    }
    const outcome =
      props.variant === 'quickBook'
        ? await quickBookAction(props.panel, input)
        : await createBookingAction(props.panel, input)
    setPending(false)
    if (outcome.ok) {
      setOpen(false)
      return
    }
    setResult(outcome)
  }

  const stepError = stepErrorMessage(step, values, props)

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[680px]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {BOOKING_POPUP.titles[titleForStep(step)]}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={BOOKING_POPUP.actions.close}
            onClick={() => setOpen(false)}
          />
        </header>

        <ol className="flex flex-wrap items-center gap-2 p-5 pb-0" aria-hidden="true">
          {stepNames().map((name, index) => {
            const number = (index + 1) as Step
            const reached = step >= number
            const done = step > number
            return (
              <li key={name} className="flex items-center gap-2">
                {index === 0 ? null : (
                  <span className="h-[2px] w-[26px] rounded-[2px] bg-line-2" />
                )}
                <span
                  className={cx(
                    'flex items-center gap-2 text-sm',
                    reached ? 'font-bold text-ink' : 'text-ink-3',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-7 shrink-0 place-items-center rounded-pill text-xs font-bold',
                      done
                        ? 'bg-ok-bg text-ok'
                        : number === step
                          ? 'bg-brand text-ink-inverse'
                          : 'bg-surface-sunken text-ink-3',
                    )}
                  >
                    {formatNumber(number)}
                  </span>
                  {name}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="flex flex-col gap-4 p-5">
          {step === 1 ? (
            <Field label={BOOKING_POPUP.fields.service} required>
              <select
                className={CONTROL_CLASSES}
                value={values.serviceId}
                onChange={(event) => {
                  setValues({ ...values, serviceId: event.target.value, doctorId: '' })
                  setResult(null)
                }}
              >
                <option value="">{BOOKING_POPUP.chooseService}</option>
                {offeredServices.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {step === 2 ? (
            <>
              {doctorChoices === null ? (
                <Field label={BOOKING_POPUP.fields.doctor}>
                  <input
                    className={CONTROL_CLASSES}
                    type="text"
                    value={props.doctorName ?? ''}
                    readOnly
                  />
                </Field>
              ) : (
                <Field label={BOOKING_POPUP.fields.doctor} required>
                  <select
                    className={CONTROL_CLASSES}
                    value={values.doctorId}
                    onChange={(event) => {
                      setValues({ ...values, doctorId: event.target.value })
                      setResult(null)
                    }}
                  >
                    <option value="">{BOOKING_POPUP.chooseDoctor}</option>
                    {doctorChoices.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold text-ink-2">
                  {BOOKING_POPUP.fields.localDate}
                </legend>
                <div className="grid grid-cols-4 gap-2 panel:grid-cols-7">
                  {weekdays.map((day: LocalDate) => (
                    <DayButton
                      key={day}
                      day={day}
                      selected={day === values.localDate}
                      onSelect={() => setValues({ ...values, localDate: day })}
                    />
                  ))}
                </div>
              </fieldset>
              <Field label={BOOKING_POPUP.fields.localTime} required>
                <TextInput
                  type="time"
                  value={values.localTime}
                  onChange={(event) => {
                    setValues({ ...values, localTime: event.target.value })
                    setResult(null)
                  }}
                />
              </Field>
              {service === undefined ? null : (
                <p className="text-xs text-ink-3">
                  {service.name} — {BOOKING_POPUP.duration} {formatNumber(service.durationMinutes)}
                </p>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <CustomerSearch
                customers={props.customers}
                selectedId={values.customerId}
                mobile={values.mobile}
                firstName={values.firstName}
                lastName={values.lastName}
                onChange={(patch) => setValues({ ...values, ...patch })}
              />
              <Summary
                values={values}
                service={service}
                doctorName={doctorNameOf(props, values, doctorChoices)}
              />
            </>
          ) : null}

          {result !== null && !result.ok ? (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {result.message}
            </p>
          ) : null}

          {stepError === null ? null : (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {stepError}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {BOOKING_POPUP.actions.close}
          </Button>
          <div className="flex gap-2">
            {step > 1 ? (
              <Button
                variant="neutral"
                onClick={() => setStep((step - 1) as Step)}
                disabled={pending}
              >
                {BOOKING_POPUP.actions.back}
              </Button>
            ) : null}
            {step < 3 ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (stepErrorMessage(step, values, props) === null) setStep((step + 1) as Step)
                }}
              >
                {BOOKING_POPUP.actions.next}
              </Button>
            ) : (
              <Button variant="primary" loading={pending} onClick={() => void submit()}>
                {BOOKING_POPUP.actions.confirm}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </Overlay>
  )
}

/* ── The three filters ─────────────────────────────────────────────────────── */

/**
 * The services step one offers.
 *
 * With `allowedServiceIds` given, only those services appear — the services a
 * doctor's own column is bookable for. Without it, every service in `services` is
 * offered, which is the header's own popup.
 */
function offeredServicesOf(props: BookingDialogProps): readonly ServiceOption[] {
  if (props.allowedServiceIds === undefined) return props.services
  const allowed = new Set(props.allowedServiceIds)
  return props.services.filter((option) => allowed.has(option.id))
}

/**
 * The days step two's week strip renders.
 *
 * With `workingWeekdays` given, only days whose `jalaliWeekday(day)` is in the list
 * appear — a doctor's working days. Without it, every day of the current Jalali week
 * is offered, which is the header's own popup and the doctor's home.
 */
function offeredWeekdaysOf(props: BookingDialogProps): readonly LocalDate[] {
  const all = weekDays(props.localDate)
  if (props.workingWeekdays === undefined) return all
  const allowed = new Set(props.workingWeekdays)
  return all.filter((day) => allowed.has(jalaliWeekday(day)))
}

/**
 * The doctors step two's field offers, or `null` when the field is a read-only name.
 *
 * `null` has two cases and they are the same case to the renderer: no
 * `doctorsByServiceId` map was given (the doctor's own quick-book and any other
 * single-doctor caller), or `doctorId` was locked by the caller (a grid column). In
 * both the field shows the doctor's name and not a `<select>`. A map given with no
 * chosen service yet yields an empty list, and step two cannot be reached without a
 * service, so the field is only ever rendered with a chosen service and a populated
 * list.
 */
function doctorsForChosenService(
  props: BookingDialogProps,
  serviceId: string,
): readonly DoctorOption[] | null {
  if (props.doctorsByServiceId === undefined) return null
  if (props.doctorId !== undefined) {
    const locked = props.doctorsByServiceId[serviceId] ?? []
    const onlyThis = locked.filter((option) => option.id === props.doctorId)
    return onlyThis.length === 0 && props.doctorName !== undefined
      ? [{ id: props.doctorId, name: props.doctorName }, ...onlyThis]
      : onlyThis
  }
  return props.doctorsByServiceId[serviceId] ?? []
}

/** The doctor's name for the summary, as the chosen or locked doctor. */
function doctorNameOf(
  props: BookingDialogProps,
  values: BookingValues,
  doctorChoices: readonly DoctorOption[] | null,
): string {
  if (doctorChoices !== null) {
    const chosen = doctorChoices.find((option) => option.id === values.doctorId)
    if (chosen !== undefined) return chosen.name
  }
  return props.doctorName ?? ''
}

/* ── The step's own helpers ───────────────────────────────────────────────── */

/** The three steps' names, in order, for the progress strip. */
function stepNames(): readonly string[] {
  return [BOOKING_POPUP.steps.service, BOOKING_POPUP.steps.time, BOOKING_POPUP.steps.customer]
}

/** The key the step's title is keyed by. */
function titleForStep(step: Step): 'service' | 'time' | 'customer' {
  if (step === 1) return 'service'
  if (step === 2) return 'time'
  return 'customer'
}

/** The empty state a fresh popup and a reopened one both start from. */
function emptyValues(props: BookingDialogProps): BookingValues {
  return {
    serviceId: props.defaultServiceId ?? '',
    doctorId: props.doctorId ?? '',
    localDate: props.localDate,
    localTime: props.defaultTime ?? '',
    customerId: '',
    mobile: '',
    firstName: '',
    lastName: '',
  }
}

/**
 * The sentence for a step that is not finished, or `null` when it is.
 *
 * The steps gate themselves rather than letting the server refuse them, because the
 * server's refusal would be a sentence about a row that was never written and the
 * person's own answer is "you have not chosen a service yet".
 */
function stepErrorMessage(
  step: Step,
  values: BookingValues,
  props: BookingDialogProps,
): string | null {
  if (step === 1 && values.serviceId === '') return BOOKING_POPUP.chooseService
  if (step === 2) {
    if (!isValidLocalTime(values.localTime)) return BOOKING_POPUP.chooseTime
    if (props.doctorsByServiceId !== undefined && values.doctorId === '') {
      return BOOKING_POPUP.chooseDoctor
    }
    if (offeredServicesOf(props).length === 0) return BOOKING_POPUP.noServices
  }
  if (step === 3) {
    if (values.customerId === '' && values.mobile === '') return BOOKING_POPUP.chooseCustomer
  }
  return null
}

/**
 * The overlay — a dimmed backdrop that closes on a click outside and on Escape.
 *
 * Clicks inside the panel do not close, because the panel is where the form is;
 * `stopPropagation` on the panel's own handler keeps the backdrop's handler from
 * being the one that answers it.
 */
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

/** One day of the Jalali week strip. */
function DayButton({
  day,
  selected,
  onSelect,
}: {
  readonly day: LocalDate
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        'rounded-xs border px-2 py-2 text-xs',
        selected
          ? 'border-brand bg-brand-50 font-semibold text-brand-700'
          : 'border-line-2 bg-surface text-ink-2',
      )}
    >
      {`${weekdayName(jalaliWeekday(day))} ${toPersianDigits(jalaliParts(day).day)}`}
    </button>
  )
}

/** The third step's customer search, with the new-customer branch. */
function CustomerSearch({
  customers,
  selectedId,
  mobile,
  firstName,
  lastName,
  onChange,
}: {
  readonly customers: readonly CustomerOption[]
  readonly selectedId: string
  readonly mobile: string
  readonly firstName: string
  readonly lastName: string
  readonly onChange: (patch: Partial<BookingValues>) => void
}) {
  const matches = mobile === '' ? [] : searchCustomers(customers, mobile)
  const chosen =
    selectedId === '' ? null : customers.find((option) => option.id === selectedId) ?? null

  return (
    <>
      <Field label={BOOKING_POPUP.fields.customerSearch} required>
        <TextInput
          type="tel"
          inputMode="tel"
          value={mobile}
          placeholder={BOOKING_POPUP.fields.mobile}
          onChange={(event) => {
            onChange({ mobile: event.target.value, customerId: '' })
          }}
        />
      </Field>

      {matches.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {matches.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    customerId: option.id,
                    mobile: option.mobile,
                    firstName: option.firstName,
                    lastName: option.lastName ?? '',
                  })
                }
                className={cx(
                  'inline-size-full rounded-xs border px-3 py-2 text-start text-sm',
                  chosen?.id === option.id
                    ? 'border-brand bg-brand-50'
                    : 'border-line-2 bg-surface hover:bg-surface-2',
                )}
              >
                <span className="font-semibold text-ink">{customerName(option)}</span>
                <span className="text-ink-3"> {option.mobile}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen === null ? (
        <div className="rounded-sm border border-line-2 bg-surface-2 p-4">
          <p className="text-sm font-semibold text-ink-2">{BOOKING_POPUP.newCustomer.label}</p>
          <p className="mt-1 text-xs text-ink-3">{BOOKING_POPUP.newCustomer.lead}</p>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-4 panel:flex-row">
              <Field label={BOOKING_POPUP.fields.firstName} required className="flex-1">
                <TextInput
                  type="text"
                  value={firstName}
                  onChange={(event) => onChange({ firstName: event.target.value })}
                />
              </Field>
              <Field label={BOOKING_POPUP.fields.lastName} className="flex-1">
                <TextInput
                  type="text"
                  value={lastName}
                  onChange={(event) => onChange({ lastName: event.target.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-sm bg-ok-bg px-3 py-2 text-sm text-ok">
          {customerName(chosen)} — {chosen.mobile}
        </p>
      )}
    </>
  )
}

/** The summary the third step shows before the row is written. */
function Summary({
  values,
  service,
  doctorName,
}: {
  readonly values: BookingValues
  readonly service: ServiceOption | undefined
  readonly doctorName: string
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-sm bg-surface-2 p-4 text-sm">
      <SummaryRow label={BOOKING_POPUP.summary.service} value={service?.name ?? ''} />
      <SummaryRow label={BOOKING_POPUP.summary.doctor} value={doctorName} />
      <SummaryRow label={BOOKING_POPUP.summary.time} value={summaryTime(values)} />
    </dl>
  )
}

/** One row of the summary. */
function SummaryRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-end font-semibold text-ink">{value}</dd>
    </>
  )
}

/** The time the summary shows, as the grid renders it. */
function summaryTime(values: BookingValues): string {
  return `${formatDate(values.localDate, 'short')} ${formatTime(values.localTime as LocalTime)}`
}

/** A customer's full name, joined the way the product writes it. */
function customerName(option: CustomerOption): string {
  return option.lastName === null ? option.firstName : `${option.firstName} ${option.lastName}`
}

/**
 * The customers a search matches, by mobile first and then name.
 *
 * Mobile is compared after `normalizeMobile`, because the two are stored normalised
 * and a typed space or a Persian-zero would otherwise miss a row that is there. The
 * list is short — the page read the tenant's customers — and the search is client
 * side because the third step is one state of one form.
 */
function searchCustomers(
  customers: readonly CustomerOption[],
  query: string,
): readonly CustomerOption[] {
  const normalised = normalizeMobile(query)
  if (normalised === '') return []
  return customers
    .filter((option) => option.mobile.includes(normalised) || option.firstName.includes(query))
    .slice(0, 6)
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}