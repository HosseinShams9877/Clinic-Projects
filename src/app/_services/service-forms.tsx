/**
 * The services catalogue's four writers, as the manager panel renders them.
 *
 * The catalogue is a read and four writes — a service is created, edited, given its
 * doctors, and deactivated or reactivated — and the four are one client component
 * because they are one row's own affordances and the row is what the manager acts on.
 * A failure the action returns lands on the row that raised it, which is the same
 * answer the lead cartable gives and for the same reason.
 *
 * ## Why deactivation asks and activation does not
 *
 * «غیرفعال کردن» removes the service from the booking picker the moment it lands
 * (DoD 4), and a manager who tapped by mistake is looking at a picker that no longer
 * offers it — so the row confirms. «فعال کردن» is the reverse and needs no
 * confirmation: a service that returns is a service the clinic offers again, and
 * taking it back away is another tap.
 *
 * ## Why there is no delete button anywhere in this file (DoD 3)
 *
 * The delete path does not exist. No button, no confirm, no sentence, and no action to
 * call — the absence is the invariant, and a file that renders a delete button would
 * be the surface the module refuses to have.
 *
 * ## Why the money fields are text
 *
 * The column is `BigInt` rials and the person types digits, so the field is a text
 * input with `inputMode="numeric"` and the action parses. A `<input type="number">`
 * would render a Gregorian-stepper control on a Persian surface and would let a
 * browser hand the action a value in scientific notation, which is a price the clinic
 * cannot charge.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { SERVICES_PAGE } from '@/app/catalog'
import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'
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
 *
 * A duplicate name comes back onto the form as the catalogue's own sentence, so the
 * manager reads «یک خدمت با این نام قبلاً ثبت شده است» and renames, rather than
 * discovering a second row on the page.
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
    const input: ServiceInput = {
      name: asFormString(event.currentTarget, 'name'),
      category: asFormString(event.currentTarget, 'category') || undefined,
      price: asFormString(event.currentTarget, 'price'),
      depositAmount: asFormString(event.currentTarget, 'depositAmount') || undefined,
      durationMinutes: asFormString(event.currentTarget, 'durationMinutes'),
      defaultSessions: asFormString(event.currentTarget, 'defaultSessions') || undefined,
      defaultIntervalDays: asFormString(event.currentTarget, 'defaultIntervalDays') || undefined,
      showPriceOnSite: checked(event.currentTarget, 'showPriceOnSite'),
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
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
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

        <form id={NEW_SERVICE_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <Field label={SERVICES_PAGE.new.name} required>
            <TextInput name="name" />
          </Field>

          <Field label={SERVICES_PAGE.new.category}>
            <CategorySelect value={null} onChange={() => {}} />
          </Field>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.price} required className="flex-1">
              <TextInput name="price" inputMode="numeric" dir="ltr" />
            </Field>
            <Field label={SERVICES_PAGE.new.deposit} className="flex-1">
              <TextInput name="depositAmount" inputMode="numeric" dir="ltr" />
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

          <FormAnswer answer={answer} />
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
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
  /** The service the manager is acting on, as the page's own row holds it. */
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
    /** The `User` ids the checkboxes pre-check. */
    readonly doctorIds: readonly string[]
  }
  /** The tenant's own doctors, as the assignment dialog offers them. */
  readonly doctorOptions: readonly { readonly value: string; readonly label: string }[]
}

/**
 * The four things the manager does to a row, as the state permits them.
 *
 * The state column decides which of the two toggles the row renders, because a toggle
 * the row cannot use is a toggle the manager taps and reads a sentence about.
 */
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

      <FormAnswer answer={answer} />

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

/**
 * «ویرایش خدمت» — the row's own fields, prefilled from the page's row.
 *
 * The dialog renders inside the row's cell, which keeps the row the manager is editing
 * in view; the fields are the row's own values and not a second read, so the form and
 * the row cannot disagree about a price the catalogue is showing.
 */
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
  const [category, setCategory] = useState<string | null>(
    isMember(ServiceCategory, service.category) ? service.category : null,
  )
  const titleId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input: ServiceUpdateInput = {
      name: asFormString(event.currentTarget, 'name'),
      category: category ?? undefined,
      price: asFormString(event.currentTarget, 'price'),
      depositAmount: asFormString(event.currentTarget, 'depositAmount') || undefined,
      durationMinutes: asFormString(event.currentTarget, 'durationMinutes'),
      defaultSessions: asFormString(event.currentTarget, 'defaultSessions') || undefined,
      defaultIntervalDays: asFormString(event.currentTarget, 'defaultIntervalDays') || undefined,
      showPriceOnSite: checked(event.currentTarget, 'showPriceOnSite'),
    }
    startTransition(async () => onDone(await updateServiceAction(service.id, input)))
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
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

        <form id={EDIT_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <Field label={SERVICES_PAGE.new.name} required>
            <TextInput name="name" defaultValue={service.name} />
          </Field>

          <Field label={SERVICES_PAGE.new.category}>
            <CategorySelect value={category} onChange={setCategory} />
          </Field>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.price} required className="flex-1">
              <TextInput
                name="price"
                inputMode="numeric"
                dir="ltr"
                defaultValue={toPersianDigits(Number(service.price))}
              />
            </Field>
            <Field label={SERVICES_PAGE.new.deposit} className="flex-1">
              <TextInput
                name="depositAmount"
                inputMode="numeric"
                dir="ltr"
                defaultValue={toPersianDigits(Number(service.depositAmount))}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={SERVICES_PAGE.new.duration} required className="flex-1">
              <TextInput
                name="durationMinutes"
                inputMode="numeric"
                dir="ltr"
                defaultValue={toPersianDigits(service.durationMinutes)}
              />
            </Field>
            <Field label={SERVICES_PAGE.new.sessions} className="flex-1">
              <TextInput
                name="defaultSessions"
                inputMode="numeric"
                dir="ltr"
                defaultValue={toPersianDigits(service.defaultSessions)}
              />
            </Field>
          </div>

          <Field label={SERVICES_PAGE.new.interval}>
            <TextInput
              name="defaultIntervalDays"
              inputMode="numeric"
              dir="ltr"
              defaultValue={toPersianDigits(service.defaultIntervalDays)}
            />
          </Field>

          <Field label={SERVICES_PAGE.new.showPrice}>
            <CheckBox name="showPriceOnSite" defaultChecked={service.showPriceOnSite} />
          </Field>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
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

/**
 * «پزشکان مجاز» — the checkbox group that decides who a service is bookable by.
 *
 * The boxes are the tenant's own doctors and the checked ones are the row's own ids, so
 * the group is a full replacement and the form sends every id it wants kept. An empty
 * clinic — no doctors at all — renders the page's own empty sentence, because the
 * dialog is not the place to invite a doctor.
 */
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
      onDone(
        await assignServiceDoctorsAction(service.id, { doctorIds: [...chosen] }),
      ),
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
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

        <p className="px-6 pt-6 text-sm text-ink-2">{SERVICES_PAGE.doctors.lead}</p>

        {doctorOptions.length === 0 ? (
          <p className="px-6 py-6 text-sm text-ink-3">{SERVICES_PAGE.doctors.none}</p>
        ) : (
          <form id={DOCTORS_FORM_ID} className="flex flex-col gap-3 p-6" onSubmit={submit}>
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

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
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

/* ── The pieces the four forms share ───────────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/**
 * A form's answer: nothing while the form is clean, a sentence once the action returned.
 *
 * The tone is the outcome's own and not a guess from the text, because the catalogue's
 * forms each have their own sentences and a comparison against them would be a fourth
 * place those sentences are spelled.
 */
function FormAnswer({ answer }: { readonly answer: FormAnswer | null }) {
  if (answer === null) return null
  return (
    <p
      className={cx('flex items-center gap-1 text-sm', answer.ok ? 'text-ok' : 'text-danger')}
      role="alert"
      aria-live="polite"
    >
      <Icon name={answer.ok ? 'confirm' : 'error'} size="compact" />
      {answer.message}
    </p>
  )
}

/** The dimmed backdrop a click outside and an Escape both close. */
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
      role="presentation"
    >
      <div className="inline-size-full" onClick={stopPropagation} role="presentation">
        {children}
      </div>
    </div>
  )
}

/** One category, as the form's own searchable select holds it. */
function CategorySelect({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (value: string) => void
}) {
  return (
    <Combobox
      name="category"
      value={value}
      onChange={onChange}
      options={CATEGORY_OPTIONS}
      placeholder={SERVICES_PAGE.new.category}
      emptyMessage={SERVICES_PAGE.doctors.none}
    />
  )
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
    <label className="flex items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
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
