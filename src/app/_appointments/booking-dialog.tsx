/**
 * The booking popup — `02-architecture.md` §219's three-step booking popup, as the
 * reception desk and the doctor's quick-book both use it.
 *
 * ## The shorten-confirm, and why it is a dialog
 *
 * A service whose `durationMinutes` is longer than the doctor's own `slotMinutes`
 * is a service the desk must confirm as a shorter booking: the doctor's own step is
 * the fact the column's cell was drawn against, and a booking that quietly ran past
 * it would be a slot the grid cannot show. The dialog is the one point in the flow
 * where the desk says "yes, in less time" — a "no" leaves the booking un-written.
 *
 * ## The locked slot
 *
 * When the popup opens from a grid cell (a free slot), the day and the time are the
 * facts the desk already chose by clicking. `lockedSlot` carries them, and step 2
 * renders them as read-only facts with a lock badge: the day strip and the time
 * input are shown selected and disabled, and the "next" gate already passes. The
 * desk changes the slot by returning to the grid, not by editing the step.
 *
 * ## The time step offers slots, not free text
 *
 * The step-2 time field is not a `<input type="time">`: the desk picks from the
 * times the day actually holds, not from the times the clock can express. The
 * `freeSlotsByDoctorId` map the page read carries those times, keyed by doctor and
 * sorted ascending; the step renders them as the same kind of button the day strip
 * is made of, and a slot already held by a booking or a block is not in the list
 * because the map is computed from the day's own rows. A locked slot skips the
 * picker and shows the day and the time as read-only facts, because the grid
 * already answered that question.
 *
 * ## Why the doctor survives a service change when the popup is locked
 *
 * A service change clears the doctor on the normal path, because the doctors a
 * service offers are the service's own (a facial is not performed by the same set
 * as a laser). A locked popup — one opened from a grid cell, where the doctor *is*
 * the column the cell sits in — has no such question to ask: the doctor is a fact
 * the grid already settled, and clearing it would silently unbook the very column
 * the desk clicked. The `onChange` therefore keeps the props' own doctor when the
 * popup was opened with one, and only clears it when the doctor is genuinely the
 * desk's to choose.
 *
 * ## Why a new customer is created without a second permission check
 *
 * Step 3 collects a mobile and a name for a customer the file may not hold, and
 * the write path turns that pair into a row through `customers`'s own
 * `createOrFindCustomer` (`src/app/_appointments/support.ts` → `resolveCustomerId`).
 * That function owns the mobile key, the dedupe, and the lead-to-customer
 * conversion, and it is *the* path every booking takes — a popup that created a
 * customer here, in the dialog, would be a popup whose creation a lead-desk booking
 * never made. So the popup's part is to send the pair the write path needs, and
 * nothing more: a mobile alone is not a booking, and a mobile with a name is the
 * pair `createOrFindCustomer` reads.
 *
 * ## The visual language
 *
 * The dialog is the booking flow's own surface, and the design system's tokens are
 * the vocabulary: the brand bar at the top is `bg-brand`, the current step's disc
 * is `bg-brand` with `shadow-brand`, a completed step's disc is `bg-ok-bg` with a
 * check, and a day or a slot that is selected is filled rather than outlined —
 * `bg-brand text-ink-inverse shadow-brand` — so the reader's eye lands on the
 * choice, not on the border around it. The error and the two empty states are
 * cards, not bare sentences: a failure is `bg-danger-bg`, an empty picker is
 * `bg-surface-2`, and both carry an icon the eye can find before it reads.
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
import { LOCKED_SLOT, SLOT_PICKER } from './catalog'
import {
  createBookingAction,
  quickBookAction,
  type ActionResult,
  type BookingInput,
} from './actions'
import { ShortenDialog } from './shorten-dialog'

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

/** The day-and-time pair the popup is opened against, when it is opened from a cell. */
export interface LockedSlot {
  readonly localDate: LocalDate
  readonly localTime: string
}

/** The dialog's own props: the column it was opened from, and what it may book. */
export interface BookingDialogProps {
  readonly doctorId?: string
  readonly doctorName?: string
  readonly localDate: LocalDate
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  readonly triggerLabel: string
  readonly variant: 'book' | 'quickBook'
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly defaultServiceId?: string
  readonly defaultTime?: string
  readonly allowedServiceIds?: readonly string[]
  readonly workingWeekdays?: readonly number[]
  readonly doctorsByServiceId?: Readonly<Record<string, readonly DoctorOption[]>>
  /**
   * The free slots of the day, keyed by doctor id, as stored `HH:mm` strings. The
   * time step offers exactly these; a day with none left renders the picker's own
   * empty sentence rather than a free-text field.
   */
  readonly freeSlotsByDoctorId?: Readonly<Record<string, readonly string[]>>
  /**
   * The doctor's own slot step for the day, when they have one. `null` is the
   * default and the dialog behaves exactly as before the override existed.
   */
  readonly slotMinutes?: number | null
  /**
   * The day and the time the popup was opened against, when it was opened from a
   * grid cell. Their presence locks step 2 — the day strip and the time input are
   * shown selected and disabled, and the desk changes the slot by returning to the
   * grid rather than by editing the step.
   */
  readonly lockedSlot?: LockedSlot
  readonly triggerVariant?: ButtonProps['variant']
  readonly triggerSize?: Exclude<ButtonSize, 'icon'>
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
  const [confirmShorten, setConfirmShorten] = useState(false)
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
          setConfirmShorten(false)
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
  const lockedSlot = props.lockedSlot ?? null
  const freeSlots = freeSlotsFor(props, values.doctorId, values.localDate)

  async function submit() {
    const gate = wholeFormError(values)
    if (gate !== null) {
      setResult({ ok: false, message: gate })
      return
    }

    const step = props.slotMinutes ?? service?.durationMinutes ?? 0
    if (step > 0 && service !== undefined && service.durationMinutes > step) {
      setConfirmShorten(true)
      return
    }
    await runSubmit()
  }

  async function runSubmit() {
    const gate = wholeFormError(values)
    if (gate !== null) {
      setResult({ ok: false, message: gate })
      return
    }
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
    <>
      <Overlay onClose={() => setOpen(false)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[680px]"
        >
          {/* The brand bar — one hairline that tells the reader this is a booking
              surface before the eye reads a single word. */}
          <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

          <header className="flex items-center justify-between gap-4 px-5 py-4">
            <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
              <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
                <Icon name="appointment" size="card" />
              </span>
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

          <ol className="flex flex-wrap items-center gap-2 px-5 pb-1" aria-hidden="true">
            {stepNames().map((name, index) => {
              const number = (index + 1) as Step
              const reached = step >= number
              const done = step > number
              return (
                <li key={name} className="flex items-center gap-2">
                  {index === 0 ? null : (
                    <span
                      className={cx(
                        'h-[2px] w-[26px] rounded-[2px]',
                        done ? 'bg-brand-300' : 'bg-line-2',
                      )}
                    />
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
                            ? 'bg-brand text-ink-inverse shadow-brand'
                            : 'border border-dashed border-line-2 bg-surface text-ink-3',
                      )}
                    >
                      {done ? <Icon name="confirm" size="compact" /> : formatNumber(number)}
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
                    const keepDoctor = props.doctorId ?? ''
                    setValues({
                      ...values,
                      serviceId: event.target.value,
                      doctorId: keepDoctor,
                      localTime: keepDoctor === '' ? '' : values.localTime,
                    })
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
                        setValues({
                          ...values,
                          doctorId: event.target.value,
                          localTime: '',
                        })
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
                  <legend className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                    <Icon name="calendar" size="compact" />
                    {BOOKING_POPUP.fields.localDate}
                  </legend>
                  <div className="grid grid-cols-4 gap-2 panel:grid-cols-7">
                    {weekdays.map((day: LocalDate) => (
                      <DayButton
                        key={day}
                        day={day}
                        selected={day === values.localDate}
                        disabled={lockedSlot !== null}
                        onSelect={() =>
                          setValues({ ...values, localDate: day, localTime: '' })
                        }
                      />
                    ))}
                  </div>
                </fieldset>

                {lockedSlot !== null ? (
                  <div className="flex flex-col gap-2 rounded-md border border-brand-300 bg-brand-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                        <Icon name="lock" size="compact" />
                        {BOOKING_POPUP.fields.localTime}
                      </span>
                      <span className="rounded-pill bg-brand-100 px-2 py-[3px] text-[11px] font-semibold text-brand-700">
                        {LOCKED_SLOT.badge}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-ink tabular-nums" dir="ltr">
                      {formatTime(values.localTime as LocalTime)}
                    </span>
                    <p className="text-xs text-brand-700">{LOCKED_SLOT.hint}</p>
                  </div>
                ) : values.doctorId === '' ? (
                  <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-3">
                    <Icon name="info" size="compact" />
                    {SLOT_PICKER.doctorFirst}
                  </p>
                ) : freeSlots.length === 0 ? (
                  <p className="flex items-center gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn" role="status">
                    <Icon name="warning" size="compact" />
                    {SLOT_PICKER.empty}
                  </p>
                ) : (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                      <Icon name="clock" size="compact" />
                      {SLOT_PICKER.label}
                    </legend>
                    <div className="grid grid-cols-3 gap-2 panel:grid-cols-5">
                      {freeSlots.map((slot) => (
                        <SlotButton
                          key={slot}
                          time={slot}
                          selected={slot === values.localTime}
                          onSelect={() =>
                            setValues({ ...values, localTime: slot })
                          }
                        />
                      ))}
                    </div>
                  </fieldset>
                )}

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
              <p className="flex items-center gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
                <Icon name="error" size="compact" />
                {result.message}
              </p>
            ) : null}

            {stepError === null ? null : (
              <p className="flex items-center gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
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
                <Button
                  variant="primary"
                  leadingIcon="confirm"
                  loading={pending}
                  onClick={() => void submit()}
                >
                  {BOOKING_POPUP.actions.confirm}
                </Button>
              )}
            </div>
          </footer>
        </div>
      </Overlay>

      {confirmShorten && service !== undefined ? (
        <ShortenDialog
          serviceMinutes={service.durationMinutes}
          slotMinutes={props.slotMinutes ?? service.durationMinutes}
          onConfirm={() => {
            setConfirmShorten(false)
            void runSubmit()
          }}
          onDismiss={() => setConfirmShorten(false)}
        />
      ) : null}
    </>
  )
}

/* ── The three filters ─────────────────────────────────────────────────────── */

function offeredServicesOf(props: BookingDialogProps): readonly ServiceOption[] {
  if (props.doctorId === undefined) {
    if (props.allowedServiceIds === undefined) return props.services
    const allowed = new Set(props.allowedServiceIds)
    return props.services.filter((option) => allowed.has(option.id))
  }
  const allowed = new Set(props.allowedServiceIds ?? [])
  return props.services.filter((option) => allowed.has(option.id))
}

function offeredWeekdaysOf(props: BookingDialogProps): readonly LocalDate[] {
  const all = weekDays(props.localDate)
  if (props.workingWeekdays === undefined) return all
  const allowed = new Set(props.workingWeekdays)
  return all.filter((day) => allowed.has(jalaliWeekday(day)))
}

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

/**
 * The free slots the time step offers, for the doctor and day the popup is on.
 */
function freeSlotsFor(
  props: BookingDialogProps,
  doctorId: string,
  localDate: LocalDate,
): readonly string[] {
  if (doctorId === '') return []
  if (localDate !== props.localDate && props.lockedSlot === undefined) return []
  return props.freeSlotsByDoctorId?.[doctorId] ?? []
}

/* ── The step's own helpers ───────────────────────────────────────────────── */

function stepNames(): readonly string[] {
  return [BOOKING_POPUP.steps.service, BOOKING_POPUP.steps.time, BOOKING_POPUP.steps.customer]
}

function titleForStep(step: Step): 'service' | 'time' | 'customer' {
  if (step === 1) return 'service'
  if (step === 2) return 'time'
  return 'customer'
}

function emptyValues(props: BookingDialogProps): BookingValues {
  return {
    serviceId: props.defaultServiceId ?? '',
    doctorId: props.doctorId ?? '',
    localDate: props.lockedSlot?.localDate ?? props.localDate,
    localTime: props.lockedSlot?.localTime ?? props.defaultTime ?? '',
    customerId: '',
    mobile: '',
    firstName: '',
    lastName: '',
  }
}

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

function wholeFormError(values: BookingValues): string | null {
  if (values.serviceId === '') return BOOKING_POPUP.chooseService
  if (values.doctorId === '') return BOOKING_POPUP.chooseDoctor
  if (!isValidLocalTime(values.localTime)) return BOOKING_POPUP.chooseTime
  if (values.customerId === '' && values.mobile === '') return BOOKING_POPUP.chooseCustomer
  return null
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

function DayButton({
  day,
  selected,
  disabled,
  onSelect,
}: {
  readonly day: LocalDate
  readonly selected: boolean
  readonly disabled: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      className={cx(
        'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-all',
        selected
          ? 'border-brand bg-brand font-bold text-ink-inverse shadow-brand'
          : 'border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
        disabled ? 'cursor-not-allowed opacity-50' : null,
      )}
    >
      <span className={cx('text-[11px]', selected ? 'text-ink-inverse/80' : 'text-ink-3')}>
        {weekdayName(jalaliWeekday(day))}
      </span>
      <span className="text-sm font-bold tabular-nums">
        {toPersianDigits(jalaliParts(day).day)}
      </span>
    </button>
  )
}

function SlotButton({
  time,
  selected,
  onSelect,
}: {
  readonly time: string
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        'rounded-md border px-2 py-2.5 text-sm font-semibold tabular-nums transition-all',
        selected
          ? 'border-brand bg-brand text-ink-inverse shadow-brand'
          : 'border-line-2 bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
      )}
    >
      {formatTime(time as LocalTime)}
    </button>
  )
}

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
          type="text"
          inputMode="search"
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
                  'inline-size-full rounded-md border px-3 py-2 text-start text-sm transition-all',
                  chosen?.id === option.id
                    ? 'border-brand bg-brand-50 shadow-brand'
                    : 'border-line-2 bg-surface hover:border-brand-300 hover:bg-brand-50',
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
        <div className="rounded-md border border-dashed border-line-2 bg-surface-2 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
            
            {BOOKING_POPUP.newCustomer.label}
          </p>
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
        <p className="flex items-center gap-2 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">
          <Icon name="confirm" size="compact" />
          {customerName(chosen)} — {chosen.mobile}
        </p>
      )}
    </>
  )
}

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
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-surface-2 p-4 text-sm">
      <SummaryRow label={BOOKING_POPUP.summary.service} value={service?.name ?? ''} />
      <SummaryRow label={BOOKING_POPUP.summary.doctor} value={doctorName} />
      <SummaryRow label={BOOKING_POPUP.summary.time} value={summaryTime(values)} />
    </dl>
  )
}

function SummaryRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-end font-semibold text-ink">{value}</dd>
    </>
  )
}

function summaryTime(values: BookingValues): string {
  return `${formatDate(values.localDate, 'short')} ${formatTime(values.localTime as LocalTime)}`
}

function customerName(option: CustomerOption): string {
  return option.lastName === null ? option.firstName : `${option.firstName} ${option.lastName}`
}

function searchCustomers(
  customers: readonly CustomerOption[],
  query: string,
): readonly CustomerOption[] {
  const byMobile = normalizeMobile(query)
  const byName = query.trim()
  if (byMobile === '' && byName === '') return []

  return customers
    .filter((option) => {
      const fullName = `${option.firstName} ${option.lastName ?? ''}`.trim()
      const mobileMatch = byMobile !== '' && option.mobile.includes(byMobile)
      const nameMatch = byName !== '' && fullName.includes(byName)
      return mobileMatch || nameMatch
    })
    .slice(0, 6)
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}