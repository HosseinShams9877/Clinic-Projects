/**
 * The booking wizard — the public site's four-step flow, as a full page.
 *
 * Step 1 picks a service, step 2 picks one of the doctors who performs it, step 3
 * picks a day and a time from the slots the real availability engine generated,
 * step 4 takes the name and the mobile the booking is keyed on. The four are one
 * client island because a step's choices are the next step's props, and the submit
 * is a Server Action because a booking is a write and the write runs through
 * `bookPublicAppointment` — the module's own public path, with the same guards the
 * desk's booking has.
 *
 * The island holds no Persian literal and no module barrel: the labels are props the
 * page built from the catalog, and the slots and doctors are what the actions
 * returned. The two formatted lines a service card carries and the two the outcome
 * renders arrive as template strings and are filled here with `renderMessage`,
 * because a function cannot cross the server-client boundary.
 *
 * ## The deposit notice
 *
 * A service whose `depositAmount` is greater than zero cannot be booked online yet —
 * the public site has no payment gateway — so the wizard shows the amount the clinic
 * will ask for *before* the visitor picks a doctor, and offers only the clinic's
 * phone number as the next step. The notice replaces the whole flow rather than
 * appearing beside it: a visitor who cannot complete the booking should not be walked
 * through three more steps to read a sentence about it.
 *
 * ## Why the router is refreshed after a booking
 *
 * A Server Action's `revalidatePath` invalidates the server-side cache, but the
 * client Router keeps the RSC payload it already fetched — so a desk that opens
 * `/reception/appointments` in the same tab sees the grid it saw before the booking.
 * `router.refresh()` discards that payload and re-fetches it, which is what makes the
 * row appear on the next navigation without a full page reload.
 */

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/core/components/button'
import { Field, TextArea, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib/cx'
import {
  asLocalDate,
  asLocalTime,
  formatDate,
  formatMoney,
  isValidMobile,
  normalizeMobile,
  renderMessage,
  toPersianDigits,
  weekdayName,
  type LocalDate,
} from '@/core/localization'
import { jalaliWeekday } from '@/core/localization'
import { weekDays } from '@/modules/appointments'

import {
  bookPublicAppointment,
  fetchDoctorsForService,
  fetchPublicSlots,
  fetchServiceDeposit,
  type PublicBookingResult,
  type PublicDoctorOption,
  type PublicSlot,
} from '@/app/_public/booking-action'

interface WizardProps {
  readonly services: readonly {
    readonly id: string
    readonly name: string
    readonly durationMinutes: number
    readonly depositAmount: bigint
    readonly showPriceOnSite: boolean
  }[]
  readonly steps: {
    readonly service: string
    readonly doctor: string
    readonly time: string
    readonly details: string
  }
  readonly labels: {
    readonly service: string
    readonly doctor: string
    readonly day: string
    readonly time: string
    readonly firstName: string
    readonly lastName: string
    readonly mobile: string
    readonly note: string
  }
  readonly hints: {
    readonly mobile: string
    readonly pickDoctor: string
    readonly pickDay: string
    readonly noSlots: string
    readonly depositRequired: string
  }
  readonly actions: {
    readonly next: string
    readonly back: string
    readonly confirm: string
    readonly submitting: string
  }
  readonly formats: {
    readonly duration: string
    readonly deposit: string
    readonly slotsFailure: string
    readonly doctorsFailure: string
  }
  readonly result: {
    readonly successTitle: string
    readonly success: string
    readonly cycleHint: string
    readonly failure: string
    readonly another: string
  }
  readonly today: LocalDate
  readonly empty: string
  readonly doctorsEmpty: string
  readonly depositNotice: {
    readonly title: string
    readonly body: string
    readonly callAction: string
  }
}

type Step = 'service' | 'doctor' | 'time' | 'details'

const STEP_ORDER: readonly Step[] = ['service', 'doctor', 'time', 'details']

export function BookingWizard(props: WizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('service')
  const [serviceId, setServiceId] = useState<string>('')
  const [doctorId, setDoctorId] = useState<string>('')
  const [doctors, setDoctors] = useState<readonly PublicDoctorOption[]>([])
  const [localDate, setLocalDate] = useState<LocalDate>(props.today)
  const [localTime, setLocalTime] = useState<string>('')
  const [slots, setSlots] = useState<readonly PublicSlot[]>([])
  const [depositAmount, setDepositAmount] = useState<bigint>(0n)
  const [firstName, setFirstName] = useState<string>('')
  const [lastName, setLastName] = useState<string>('')
  const [mobile, setMobile] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [failure, setFailure] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<PublicBookingResult | null>(null)
  const [pending, startTransition] = useTransition()

  if (props.services.length === 0) {
    return <p className="text-sm text-ink-2">{props.empty}</p>
  }

  if (outcome !== null) {
    return (
      <Outcome
        outcome={outcome}
        result={props.result}
        onReset={() => {
          setOutcome(null)
          setStep('service')
          setServiceId('')
          setDoctorId('')
          setDoctors([])
          setLocalTime('')
          setSlots([])
          setDepositAmount(0n)
          setFirstName('')
          setLastName('')
          setMobile('')
          setNote('')
        }}
      />
    )
  }

  const service = props.services.find((row) => row.id === serviceId)
  const doctor = doctors.find((row) => row.id === doctorId)

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator steps={props.steps} step={step} />
      {failure === null ? null : (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3.5 text-sm text-red-700">
          <Icon name="error" size="compact" />
          {failure}
        </p>
      )}
      {step === 'service' && depositAmount === 0n ? (
        <ServiceStep
          labels={props.labels}
          services={props.services}
          serviceId={serviceId}
          formats={props.formats}
          onService={setServiceId}
        />
      ) : null}
      {step === 'service' && depositAmount > 0n ? (
        <DepositNotice
          service={service}
          depositAmount={depositAmount}
          notice={props.depositNotice}
        />
      ) : null}
      {step === 'doctor' && depositAmount === 0n ? (
        <DoctorStep
          labels={props.labels}
          hints={props.hints}
          doctors={doctors}
          doctorId={doctorId}
          empty={props.doctorsEmpty}
          onDoctor={setDoctorId}
        />
      ) : null}
      {step === 'time' && depositAmount === 0n ? (
        <TimeStep
          labels={props.labels}
          hints={props.hints}
          localDate={localDate}
          slots={slots}
          localTime={localTime}
          onDate={(date) => {
            setLocalDate(date)
            setLocalTime('')
            void loadSlots(serviceId, doctorId, date, setSlots, setFailure, props.formats.slotsFailure)
          }}
          onTime={setLocalTime}
        />
      ) : null}
      {step === 'details' && depositAmount === 0n ? (
        <DetailsStep
          labels={props.labels}
          hints={props.hints}
          service={service}
          doctor={doctor}
          localDate={localDate}
          localTime={localTime}
          firstName={firstName}
          lastName={lastName}
          mobile={mobile}
          note={note}
          onFirstName={setFirstName}
          onLastName={setLastName}
          onMobile={setMobile}
          onNote={setNote}
        />
      ) : null}
      {depositAmount > 0n ? null : (
        <div className="flex items-center justify-between gap-3">
          {step === 'service' ? null : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFailure(null)
                setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1] as Step)
              }}
            >
              {props.actions.back}
            </Button>
          )}
          {step === 'details' ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setFailure(null)
                startTransition(async () => {
                  const result = await bookPublicAppointment({
                    serviceId,
                    doctorId,
                    localDate,
                    localTime,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    mobile: normalizeMobile(mobile),
                    note: note.trim(),
                  })
                  if (result.ok) {
                    setOutcome(result)
                    router.refresh()
                    return
                  }
                  setFailure(result.message)
                })
              }}
            >
              {pending ? props.actions.submitting : props.actions.confirm}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canAdvance(step, serviceId, doctorId, localTime)}
              onClick={() => {
                setFailure(null)
                if (step === 'service') {
                  void loadDeposit(serviceId, setDepositAmount, () => {
                    void loadDoctors(serviceId, setDoctors, setFailure, props.formats.doctorsFailure).then(() => {
                      setStep('doctor')
                    })
                  })
                } else if (step === 'doctor') {
                  void loadSlots(serviceId, doctorId, localDate, setSlots, setFailure, props.formats.slotsFailure).then(() => {
                    setStep('time')
                  })
                } else {
                  setStep('details')
                }
              }}
            >
              {props.actions.next}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function canAdvance(step: Step, serviceId: string, doctorId: string, localTime: string): boolean {
  if (step === 'service') return serviceId !== ''
  if (step === 'doctor') return doctorId !== ''
  if (step === 'time') return localTime !== ''
  return true
}

async function loadDeposit(
  serviceId: string,
  setDepositAmount: (amount: bigint) => void,
  onZero: () => void,
): Promise<void> {
  try {
    const amount = (await fetchServiceDeposit(serviceId)) ?? 0n
    setDepositAmount(amount)
    if (amount === 0n) onZero()
  } catch {
    setDepositAmount(0n)
  }
}

async function loadDoctors(
  serviceId: string,
  setDoctors: (doctors: readonly PublicDoctorOption[]) => void,
  setFailure: (message: string | null) => void,
  failureMessage: string,
): Promise<void> {
  try {
    setDoctors(await fetchDoctorsForService(serviceId))
    setFailure(null)
  } catch {
    setDoctors([])
    setFailure(failureMessage)
  }
}

async function loadSlots(
  serviceId: string,
  doctorId: string,
  localDate: LocalDate,
  setSlots: (slots: readonly PublicSlot[]) => void,
  setFailure: (message: string | null) => void,
  failureMessage: string,
): Promise<void> {
  if (serviceId === '' || doctorId === '') {
    setSlots([])
    return
  }
  try {
    setSlots(await fetchPublicSlots({ serviceId, doctorId, localDate }))
    setFailure(null)
  } catch {
    setSlots([])
    setFailure(failureMessage)
  }
}

function StepIndicator({
  steps,
  step,
}: {
  readonly steps: WizardProps['steps']
  readonly step: Step
}) {
  const index = STEP_ORDER.indexOf(step)
  return (
    <ol className="flex items-center gap-2">
      {STEP_ORDER.map((name, position) => (
        <li key={name} className="flex flex-1 items-center gap-2">
          <span
            className={cx(
              'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
              position < index ? 'bg-brand text-white' : position === index ? 'bg-brand-btn text-white' : 'bg-bg text-ink-2',
            )}
          >
            {position < index ? <Icon name="confirm" size="compact" /> : toPersianDigits(position + 1)}
          </span>
          <span className={cx('text-xs font-semibold', position === index ? 'text-ink' : 'text-ink-2')}>
            {steps[name]}
          </span>
          {position < STEP_ORDER.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
        </li>
      ))}
    </ol>
  )
}

function ServiceStep({
  labels,
  services,
  serviceId,
  formats,
  onService,
}: {
  readonly labels: WizardProps['labels']
  readonly services: WizardProps['services']
  readonly serviceId: string
  readonly formats: WizardProps['formats']
  readonly onService: (id: string) => void
}) {
  return (
    <Field label={labels.service}>
      <div className="grid gap-2.5">
        {services.map((service) => (
          <label
            key={service.id}
            className={cx(
              'flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3.5 text-sm transition-colors',
              serviceId === service.id ? 'border-brand bg-brand-50' : 'border-line bg-white hover:border-line-2',
            )}
          >
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-ink">{service.name}</span>
              <span className="text-[11.5px] text-ink-2">
                {renderMessage(formats.duration, {
                  minutes: toPersianDigits(service.durationMinutes),
                })}
                {service.showPriceOnSite && service.depositAmount > 0n
                  ? renderMessage(formats.deposit, { amount: formatMoney(service.depositAmount) })
                  : ''}
              </span>
            </span>
            <input
              type="radio"
              name="service"
              value={service.id}
              checked={serviceId === service.id}
              onChange={() => onService(service.id)}
              className="size-4 accent-brand"
            />
          </label>
        ))}
      </div>
    </Field>
  )
}

function DoctorStep({
  labels,
  hints,
  doctors,
  doctorId,
  empty,
  onDoctor,
}: {
  readonly labels: WizardProps['labels']
  readonly hints: WizardProps['hints']
  readonly doctors: readonly PublicDoctorOption[]
  readonly doctorId: string
  readonly empty: string
  readonly onDoctor: (id: string) => void
}) {
  if (doctors.length === 0) {
    return (
      <Field label={labels.doctor} hint={hints.pickDoctor}>
        <p className="text-sm text-ink-2">{empty}</p>
      </Field>
    )
  }
  return (
    <Field label={labels.doctor} hint={hints.pickDoctor}>
      <div className="grid gap-2.5">
        {doctors.map((doctor) => (
          <label
            key={doctor.id}
            className={cx(
              'flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3.5 text-sm transition-colors',
              doctorId === doctor.id ? 'border-brand bg-brand-50' : 'border-line bg-white hover:border-line-2',
            )}
          >
            <span className="font-semibold text-ink">{doctor.name}</span>
            <input
              type="radio"
              name="doctor"
              value={doctor.id}
              checked={doctorId === doctor.id}
              onChange={() => onDoctor(doctor.id)}
              className="size-4 accent-brand"
            />
          </label>
        ))}
      </div>
    </Field>
  )
}

function TimeStep({
  labels,
  hints,
  localDate,
  slots,
  localTime,
  onDate,
  onTime,
}: {
  readonly labels: WizardProps['labels']
  readonly hints: WizardProps['hints']
  readonly localDate: LocalDate
  readonly slots: readonly PublicSlot[]
  readonly localTime: string
  readonly onDate: (date: LocalDate) => void
  readonly onTime: (time: string) => void
}) {
  const days = weekDays(localDate)
  return (
    <div className="flex flex-col gap-5">
      <Field label={labels.day} hint={hints.pickDay}>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => onDate(day)}
              className={cx(
                'flex flex-col items-center gap-1 rounded-lg border py-2.5 text-center transition-colors',
                localDate === day
                  ? 'border-brand bg-brand-50 text-brand'
                  : 'border-line bg-white text-ink-2 hover:border-line-2',
              )}
            >
              <span className="text-[10px] font-medium">{weekdayName(jalaliWeekday(day))}</span>
              <span className="text-sm font-bold text-ink">
                {toPersianDigits(Number(day.split('-')[2]))}
              </span>
            </button>
          ))}
        </div>
      </Field>
      <Field label={labels.time}>
        {slots.length === 0 ? (
          <p className="text-sm text-ink-2">{hints.noSlots}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 panel:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.time}
                type="button"
                onClick={() => onTime(slot.time)}
                className={cx(
                  'rounded-lg border py-2.5 text-sm font-medium transition-colors',
                  localTime === slot.time
                    ? 'border-brand bg-brand-50 text-brand'
                    : 'border-line bg-white text-ink hover:border-line-2',
                )}
              >
                {toPersianDigits(slot.time)}
              </button>
            ))}
          </div>
        )}
      </Field>
    </div>
  )
}

function DetailsStep({
  labels,
  hints,
  service,
  doctor,
  localDate,
  localTime,
  firstName,
  lastName,
  mobile,
  note,
  onFirstName,
  onLastName,
  onMobile,
  onNote,
}: {
  readonly labels: WizardProps['labels']
  readonly hints: WizardProps['hints']
  readonly service: WizardProps['services'][number] | undefined
  readonly doctor: PublicDoctorOption | undefined
  readonly localDate: LocalDate
  readonly localTime: string
  readonly firstName: string
  readonly lastName: string
  readonly mobile: string
  readonly note: string
  readonly onFirstName: (value: string) => void
  readonly onLastName: (value: string) => void
  readonly onMobile: (value: string) => void
  readonly onNote: (value: string) => void
}) {
  const deposit = service?.depositAmount ?? 0n
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-line bg-bg p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <SummaryRow label={labels.service} value={service?.name ?? '—'} />
          <SummaryRow label={labels.doctor} value={doctor?.name ?? '—'} />
          <SummaryRow label={labels.day} value={formatDate(localDate, 'long')} />
          <SummaryRow label={labels.time} value={toPersianDigits(localTime)} />
        </dl>
        {deposit > 0n ? (
          <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-2">
            {hints.depositRequired} ({formatMoney(deposit)})
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 panel:grid-cols-2">
        <Field label={labels.firstName}>
          <TextInput
            type="text"
            value={firstName}
            onChange={(event) => onFirstName(event.target.value)}
            autoComplete="given-name"
          />
        </Field>
        <Field label={labels.lastName}>
          <TextInput
            type="text"
            value={lastName}
            onChange={(event) => onLastName(event.target.value)}
            autoComplete="family-name"
          />
        </Field>
      </div>
      <Field label={labels.mobile} hint={hints.mobile}>
        <TextInput
          type="text"
          value={mobile}
          onChange={(event) => onMobile(event.target.value)}
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          aria-invalid={mobile !== '' && !isValidMobile(normalizeMobile(mobile))}
        />
      </Field>
      <Field label={labels.note}>
        <TextArea value={note} onChange={(event) => onNote(event.target.value)} rows={3} />
      </Field>
    </div>
  )
}

function DepositNotice({
  service,
  depositAmount,
  notice,
}: {
  readonly service: WizardProps['services'][number] | undefined
  readonly depositAmount: bigint
  readonly notice: WizardProps['depositNotice']
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-warn/30 bg-warn-bg p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-warn/20 text-warn">
          <Icon name="warning" size="card" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-bold text-ink">{notice.title}</h3>
          <p className="text-sm text-ink-2">
            {renderMessage(notice.body, {
              amount: formatMoney(depositAmount),
            })}
          </p>
          {service === undefined ? null : (
            <p className="mt-1 text-xs text-ink-3">{service.name}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11.5px] text-ink-2">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}

function Outcome({
  outcome,
  result,
  onReset,
}: {
  readonly outcome: PublicBookingResult
  readonly result: WizardProps['result']
  readonly onReset: () => void
}) {
  if (!outcome.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3.5 text-sm text-red-700">
          <Icon name="error" size="compact" />
          {result.failure}
        </p>
        <Button type="button" variant="ghost" onClick={onReset}>
          {result.another}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand">
        <Icon name="success" size="action" />
      </span>
      <h2 className="text-lg font-bold text-ink">{result.successTitle}</h2>
      <p className="text-sm text-ink-2">
        {renderMessage(result.success, {
          day: formatDate(asLocalDate(outcome.localDate), 'long'),
          time: toPersianDigits(outcome.localTime),
        })}
      </p>
      {outcome.cycle === null ? null : (
        <p className="mx-auto w-fit rounded-full bg-bg px-3.5 py-1.5 text-[11.5px] font-medium text-ink-2">
          {renderMessage(result.cycleHint, {
            current: toPersianDigits(outcome.cycle.currentSession),
            total: toPersianDigits(outcome.cycle.totalSessions),
            days: toPersianDigits(outcome.cycle.intervalDays),
          })}
        </p>
      )}
      <Button type="button" variant="ghost" onClick={onReset}>
        {result.another}
      </Button>
    </div>
  )
}

export { asLocalDate as toLocalDate, asLocalTime }