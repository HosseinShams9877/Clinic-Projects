/**
 * The services catalogue's five writers, as the manager panel renders them.
 *
 * The catalogue is a read and five writes — a service is created, edited,
 * reactivated, deactivated, and assigned its doctors — and the five are one
 * client component because they are one row's own affordances and the row is what
 * the manager acts on. A failure the action returns lands on the row that raised
 * it, which is the same answer the lead cartable gives and for the same reason.
 *
 * ## Why deactivation asks and activation does not
 *
 * «غیرفعال کردن» removes the service from the booking picker the moment it lands
 * (DoD 4), and a manager who tapped by mistake is looking at a picker that no
 * longer offers it — so the row confirms. «فعال کردن» is the reverse and needs no
 * confirmation.
 *
 * ## Why there is no delete button anywhere in this file (DoD 3)
 *
 * The delete path does not exist. No button, no confirm, no sentence, and no
 * action to call — the absence is the invariant.
 *
 * ## Why the money fields are formatted text
 *
 * The column is `BigInt` rials and the person types digits, so the field is a text
 * input with `inputMode="numeric"` and the action parses. The field shows the
 * value as the reader writes it — Persian digits, grouped with `٬` — and the
 * action reads it back through `normalizeDigits`, so the same value typed as
 * `۸۰۰۰۰۰` and as `800000` and as `۸۰۰٬۰۰۰` all arrive as one number.
 *
 * ## Why the edit dialog divides before it shows
 *
 * The row holds Rial and the form types Toman, so the edit dialog divides by
 * `RIAL_PER_TOMAN` before it hands a default to `MoneyInput`. The action multiplies
 * back on the way in, and `formatMoney` divides on the way out; this is the third
 * side of the same triangle, and leaving it out would show the row ten times its
 * price the moment the dialog opened.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { ChangeEvent, FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { SERVICES_PAGE } from '@/app/catalog'
import { cx } from '@/core/lib'
import { RIAL_PER_TOMAN } from '@/core/constants'
import { formatNumber, normalizeDigits } from '@/core/localization'
import { SERVICE_CATEGORY_LABELS } from '@/modules/services'
import { ServiceCategory, isMember } from '@/core/constants'

import {
  activateServiceAction,
  assignServiceDoctorsAction,
  createServiceAction,
  deactivateServiceAction,
  updateServiceAction,
  type ActionResult,
  type ServiceInput,
  type ServiceUpdateInput,
} from './actions'

/** The four categories the new-service form's select offers, from the constants' own set. */
const CATEGORY_OPTIONS = Object.values(ServiceCategory).map((value) => ({
  value,
  label: SERVICE_CATEGORY_LABELS[value],
}))

/* ── The new-service dialog ────────────────────────────────────────────────── */

/**
 * «افزودن خدمت» — the catalogue's one create, opened from the page's own header.
 */
export function NewServiceDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const titleId = useId()

  if (!open) {
    return (
      <Button variant="primary" leadingIcon="services" onClick={() => setOpen(true)}>
        {SERVICES_PAGE.new.title}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input: ServiceInput = {
      name: asFormString(form, 'name'),
      category: asFormString(form, 'category') || undefined,
      price: asFormString(form, 'price'),
      depositAmount: asFormString(form, 'depositAmount') || undefined,
      durationMinutes: asFormString(form, 'durationMinutes'),
      defaultSessions: asFormString(form, 'defaultSessions') || undefined,
      defaultIntervalDays: asFormString(form, 'defaultIntervalDays') || undefined,
      showPriceOnSite: checked(form, 'showPriceOnSite'),
    }
    startTransition(async () => {
      const outcome: ActionResult = await createServiceAction(input)
      if (outcome.ok) {
        setOpen(false)
        return
      }
      setAnswer(outcome)
    })
  }

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[640px]"
      >
        <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
              <Icon name="services" size="card" />
            </span>
            {SERVICES_PAGE.new.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={SERVICES_PAGE.edit.cancel}
            onClick={() => setOpen(false)}
          />
        </header>

        <form id={NEW_SERVICE_FORM_ID} className="flex flex-col gap-4 px-5 pb-2" onSubmit={submit}>
          <Field label={SERVICES_PAGE.new.name} required>
            <TextInput name="name" />
          </Field>

          <Field label={SERVICES_PAGE.new.category}>
            <CategorySelect />
          </Field>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.price} required className="flex-1">
              <MoneyInput name="price" />
            </Field>
            <Field label={SERVICES_PAGE.new.deposit} className="flex-1">
              <MoneyInput name="depositAmount" />
            </Field>
          </div>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.duration} required className="flex-1">
              <TextInput name="durationMinutes" inputMode="numeric" dir="ltr" />
            </Field>
            <Field label={SERVICES_PAGE.new.sessions} className="flex-1">
              <TextInput name="defaultSessions" inputMode="numeric" dir="ltr" />
            </Field>
          </div>

          <Field label={SERVICES_PAGE.new.interval}>
            <TextInput name="defaultIntervalDays" inputMode="numeric" dir="ltr" />
          </Field>

          <Field label={SERVICES_PAGE.new.showPrice}>
            <CheckBox name="showPriceOnSite" />
          </Field>

          {answer === null ? null : <FormAnswer answer={answer} />}
        </form>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {SERVICES_PAGE.edit.cancel}
          </Button>
          <Button type="submit" form={NEW_SERVICE_FORM_ID} variant="primary" loading={pending}>
            {SERVICES_PAGE.new.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the footer's submit button refers to, so the form and its button are one. */
const NEW_SERVICE_FORM_ID = 'new-service-form'

/* ── The row's own four actions ────────────────────────────────────────────── */

/** The row's own fields, as the two dialogs read them back. */
export interface ServiceRowActionsProps {
  readonly service: {
    readonly id: string
    readonly name: string
    readonly category: string
    readonly price: bigint
    readonly depositAmount: bigint
    readonly durationMinutes: number
    readonly defaultSessions: number
    readonly defaultIntervalDays: number
    readonly isActive: boolean
    readonly showPriceOnSite: boolean
    readonly doctorIds: readonly string[]
  }
  readonly doctorOptions: readonly { readonly value: string; readonly label: string }[]
}

export function ServiceRowActions({ service, doctorOptions }: ServiceRowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [askingOff, setAskingOff] = useState(false)

  function run(action: () => Promise<ActionResult>, onOk: () => void) {
    startTransition(async () => {
      const outcome = await action()
      if (outcome.ok) {
        onOk()
        return
      }
      setAnswer(outcome)
    })
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="neutral"
          leadingIcon="edit"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setEditing(true)
          }}
        >
          {SERVICES_PAGE.actions.edit}
        </Button>
        <Button
          size="small"
          variant="neutral"
          leadingIcon="doctor"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setAssigning(true)
          }}
        >
          {SERVICES_PAGE.actions.doctors}
        </Button>
        {service.isActive ? (
          askingOff ? (
            <span className="flex items-center gap-2">
              <Button
                size="small"
                variant="danger"
                loading={pending}
                onClick={() =>
                  run(
                    () => deactivateServiceAction(service.id),
                    () => setAskingOff(false),
                  )
                }
              >
                {SERVICES_PAGE.actions.deactivateConfirmYes}
              </Button>
              <Button
                size="small"
                variant="ghost"
                disabled={pending}
                onClick={() => setAskingOff(false)}
              >
                {SERVICES_PAGE.edit.cancel}
              </Button>
            </span>
          ) : (
            <Button
              size="small"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setAnswer(null)
                setAskingOff(true)
              }}
            >
              {SERVICES_PAGE.actions.deactivate}
            </Button>
          )
        ) : (
          <Button
            size="small"
            variant="primary"
            loading={pending}
            onClick={() => run(() => activateServiceAction(service.id), () => {})}
          >
            {SERVICES_PAGE.actions.activate}
          </Button>
        )}
      </div>

      {askingOff ? (
        <p className="text-xs text-ink-2">{SERVICES_PAGE.actions.deactivateConfirm}</p>
      ) : null}

      {answer === null ? null : <FormAnswer answer={answer} />}

      {editing ? (
        <EditServiceDialog
          service={service}
          onClose={() => setEditing(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setEditing(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}

      {assigning ? (
        <ServiceDoctorsDialog
          service={service}
          doctorOptions={doctorOptions}
          onClose={() => setAssigning(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setAssigning(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}
    </div>
  )
}

/* ── The edit dialog ───────────────────────────────────────────────────────── */

function EditServiceDialog({
  service,
  onClose,
  onDone,
}: {
  readonly service: ServiceRowActionsProps['service']
  readonly onClose: () => void
  readonly onDone: (outcome: ActionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input: ServiceUpdateInput = {
      name: asFormString(form, 'name'),
      category: asFormString(form, 'category') || undefined,
      price: asFormString(form, 'price'),
      depositAmount: asFormString(form, 'depositAmount') || undefined,
      durationMinutes: asFormString(form, 'durationMinutes'),
      defaultSessions: asFormString(form, 'defaultSessions') || undefined,
      defaultIntervalDays: asFormString(form, 'defaultIntervalDays') || undefined,
      showPriceOnSite: checked(form, 'showPriceOnSite'),
    }
    startTransition(async () => onDone(await updateServiceAction(service.id, input)))
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[640px]"
      >
        <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
              <Icon name="edit" size="card" />
            </span>
            {SERVICES_PAGE.edit.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={SERVICES_PAGE.edit.cancel}
            onClick={onClose}
          />
        </header>

        <form id={EDIT_FORM_ID} className="flex flex-col gap-4 px-5 pb-2" onSubmit={submit}>
          <Field label={SERVICES_PAGE.new.name} required>
            <TextInput name="name" defaultValue={service.name} />
          </Field>

          <Field label={SERVICES_PAGE.new.category}>
            <CategorySelect
              defaultValue={
                isMember(ServiceCategory, service.category) ? service.category : null
              }
            />
          </Field>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.price} required className="flex-1">
              <MoneyInput
                name="price"
                defaultValue={Number(service.price / RIAL_PER_TOMAN)}
              />
            </Field>
            <Field label={SERVICES_PAGE.new.deposit} className="flex-1">
              <MoneyInput
                name="depositAmount"
                defaultValue={Number(service.depositAmount / RIAL_PER_TOMAN)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.duration} required className="flex-1">
              <TextInput
                name="durationMinutes"
                inputMode="numeric"
                dir="ltr"
                defaultValue={formatNumber(service.durationMinutes)}
              />
            </Field>
            <Field label={SERVICES_PAGE.new.sessions} className="flex-1">
              <TextInput
                name="defaultSessions"
                inputMode="numeric"
                dir="ltr"
                defaultValue={formatNumber(service.defaultSessions)}
              />
            </Field>
          </div>

          <Field label={SERVICES_PAGE.new.interval}>
            <TextInput
              name="defaultIntervalDays"
              inputMode="numeric"
              dir="ltr"
              defaultValue={formatNumber(service.defaultIntervalDays)}
            />
          </Field>

          <Field label={SERVICES_PAGE.new.showPrice}>
            <CheckBox name="showPriceOnSite" defaultChecked={service.showPriceOnSite} />
          </Field>
        </form>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {SERVICES_PAGE.edit.cancel}
          </Button>
          <Button type="submit" form={EDIT_FORM_ID} variant="primary" loading={pending}>
            {SERVICES_PAGE.edit.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the edit dialog's footer refers to. */
const EDIT_FORM_ID = 'edit-service-form'

/* ── The doctors dialog ────────────────────────────────────────────────────── */

function ServiceDoctorsDialog({
  service,
  doctorOptions,
  onClose,
  onDone,
}: {
  readonly service: ServiceRowActionsProps['service']
  readonly doctorOptions: ServiceRowActionsProps['doctorOptions']
  readonly onClose: () => void
  readonly onDone: (outcome: ActionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(service.doctorIds))
  const titleId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () =>
      onDone(await assignServiceDoctorsAction(service.id, { doctorIds: [...chosen] })),
    )
  }

  return (
    <Overlay onClose={onClose}>
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
              <Icon name="doctor" size="card" />
            </span>
            {SERVICES_PAGE.doctors.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={SERVICES_PAGE.edit.cancel}
            onClick={onClose}
          />
        </header>

        <p className="px-5 pb-2 text-sm text-ink-2">{SERVICES_PAGE.doctors.lead}</p>

        {doctorOptions.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md bg-surface-2 px-5 py-4 text-sm text-ink-3">
            <Icon name="info" size="compact" />
            {SERVICES_PAGE.doctors.none}
          </p>
        ) : (
          <form id={DOCTORS_FORM_ID} className="flex flex-col gap-3 px-5 pb-2" onSubmit={submit}>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{SERVICES_PAGE.doctors.title}</legend>
              {doctorOptions.map((doctor) => (
                <CheckRow
                  key={doctor.value}
                  name="doctorIds"
                  label={doctor.label}
                  checked={chosen.has(doctor.value)}
                  onChange={(next) => {
                    setChosen((prev) => {
                      const nextSet = new Set(prev)
                      if (next) nextSet.add(doctor.value)
                      else nextSet.delete(doctor.value)
                      return nextSet
                    })
                  }}
                />
              ))}
            </fieldset>
          </form>
        )}

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {SERVICES_PAGE.edit.cancel}
          </Button>
          <Button
            type="submit"
            form={DOCTORS_FORM_ID}
            variant="primary"
            loading={pending}
            disabled={doctorOptions.length === 0}
          >
            {SERVICES_PAGE.doctors.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the doctors dialog's footer refers to. */
const DOCTORS_FORM_ID = 'service-doctors-form'

/* ── The pieces the five forms share ───────────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

function FormAnswer({ answer }: { readonly answer: FormAnswer }) {
  if (answer.ok) {
    return (
      <p
        className="flex items-center gap-2 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok"
        role="alert"
        aria-live="polite"
      >
        <Icon name="confirm" size="compact" />
        {answer.message}
      </p>
    )
  }
  return (
    <p
      className="flex items-center gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
      role="alert"
      aria-live="polite"
    >
      <Icon name="error" size="compact" />
      {answer.message}
    </p>
  )
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

/**
 * One category, as the form's own searchable select holds it.
 */
function CategorySelect({ defaultValue = null }: { readonly defaultValue?: string | null }) {
  const [value, setValue] = useState<string | null>(defaultValue)
  return (
    <Combobox
      name="category"
      value={value}
      onChange={setValue}
      options={CATEGORY_OPTIONS}
      placeholder={SERVICES_PAGE.new.category}
      emptyMessage={SERVICES_PAGE.doctors.none}
    />
  )
}

/**
 * A money field: Persian digits, grouped with `٬`, as the reader types.
 *
 * The value the field carries is Persian and grouped, because that is the value the
 * manager should read. The value the action parses is the same one — `normalizeDigits`
 * strips the separators and the Persian digits before `parseBigInt` reads it, so
 * `۸۰۰٬۰۰۰` and `800000` are one number.
 *
 * The «تومان» suffix the field draws is `SERVICES_PAGE.money.unit`, read from the
 * catalogue so the surface has no Persian literal of its own — the same rule the
 * page's sentences follow, held here for the one string this component needs.
 */
function MoneyInput({
  name,
  defaultValue,
}: {
  readonly name: string
  readonly defaultValue?: number
}) {
  const [text, setText] = useState<string>(() =>
    defaultValue === undefined || defaultValue === 0 ? '' : groupAndDigit(defaultValue),
  )

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = normalizeDigits(event.currentTarget.value)
    const digitsOnly = raw.replace(/\D/g, '')
    setText(digitsOnly === '' ? '' : groupAndDigit(Number(digitsOnly)))
  }

  return (
    <div className="relative">
      <TextInput
        name={name}
        inputMode="numeric"
        dir="rtl"
        value={text}
        onChange={onChange}
        className="pe-16 text-end tabular-nums"
      />
      <span
        className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-ink-3"
        aria-hidden="true"
      >
        {SERVICES_PAGE.money.unit}
      </span>
    </div>
  )
}

/**
 * A number as Persian digits grouped with `٬`, which is what the field displays.
 *
 * `formatNumber` is `07-localization.md` §7.1's own formatter and the only one the
 * product allows: it renders Persian digits and groups with the Persian thousands
 * separator, which is exactly what the field needs. A `toLocaleString` here would be
 * the runtime's locale, not the product's, and the lint rule that forbids it is the
 * rule this function exists to obey.
 */
function groupAndDigit(value: number): string {
  return formatNumber(value)
}

/** One checkbox the two forms' boolean fields render, labelled by the enclosing field. */
function CheckBox({
  name,
  defaultChecked,
}: {
  readonly name: string
  readonly defaultChecked?: boolean
}) {
  return (
    <input
      type="checkbox"
      name={name}
      defaultChecked={defaultChecked}
      className="size-4 rounded-xs border border-line-2 accent-brand"
    />
  )
}

/** One labelled checkbox row the doctors dialog renders. */
function CheckRow({
  name,
  label,
  checked,
  onChange,
}: {
  readonly name: string
  readonly label: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-all',
        checked
          ? 'border-brand bg-brand-50 shadow-brand'
          : 'border-line-2 bg-surface hover:border-brand-300 hover:bg-brand-50',
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-4 rounded-xs border border-line-2 accent-brand"
      />
      <span className="text-sm font-semibold text-ink">{label}</span>
    </label>
  )
}

/** One field's value from a submitted form, or '' when the field was absent. */
function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.value : ''
}

/** Whether a checkbox in a submitted form was checked. */
function checked(form: HTMLFormElement, name: string): boolean {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.checked : false
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}