/**
 * The services catalogue's writers, as the manager panel renders them.
 *
 * The catalogue is a read and six writes — a service is created, edited, reactivated,
 * deactivated, assigned its doctors, and given a picture — and the six are one
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
 *
 * ## Why the picture is a separate dialog from the edit dialog
 *
 * A picture is bytes, and the edit dialog is a form of text fields the browser
 * submits as one body. A file input in the same form would make every save that
 * changed only a price carry the file input's own empty body — and the reader who
 * chose a new picture would have it uploaded before the text fields were parsed.
 * The picture is its own dialog, its own action, and its own progress: the manager
 * chooses a file, the file is uploaded, and the row shows the result.
 *
 * ## Why the picture preview uses the URL the action returned
 *
 * The action stores the bytes and answers the URL the row will record. The dialog
 * renders that URL as an `<img src>`, which is the one source of truth for what the
 * row now names: a preview built from the chosen `File` would show the picture the
 * manager selected, which is not necessarily the picture the row stores when the
 * blob write and the public write disagree.
 */

'use client'

import { useId, useRef, useState, useTransition } from 'react'
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
  uploadServiceImageAction,
  type ActionResult,
  type ServiceInput,
  type ServiceUpdateInput,
  type UploadResult,
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

/* ── The row's own five actions ────────────────────────────────────────────── */

/** The row's own fields, as the dialogs read them back. */
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
    /** The service's own picture, as the storage module recorded it. */
    readonly imageUrl: string | null
    readonly imageBackend: string | null
    readonly imageKey: string | null
  }
  readonly doctorOptions: readonly { readonly value: string; readonly label: string }[]
}

export function ServiceRowActions({ service, doctorOptions }: ServiceRowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [picturing, setPicturing] = useState(false)
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
          leadingIcon="image"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setPicturing(true)
          }}
        >
          {SERVICES_PAGE.actions.picture}
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

      {picturing ? (
        <ServicePictureDialog
          service={service}
          onClose={() => setPicturing(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setPicturing(false)
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

/* ── The picture dialog ────────────────────────────────────────────────────── */

/**
 * «تصویر خدمت» — chooses one image, uploads it, and shows the stored result.
 *
 * The dialog holds the chosen file, the upload's own pending state, and the URL
 * the action returned. A success closes the dialog because the row's own picture
 * is what changed and the row is behind the dialog; a failure stays open, because
 * the manager's own selected file is still in the input and a retry is one tap.
 *
 * The file input's `accept` is the storage module's own allowed list, written
 * here so the platform's file picker refuses the types the server would refuse —
 * a second check, not a replacement for the module's own.
 */
function ServicePictureDialog({
  service,
  onClose,
  onDone,
}: {
  readonly service: ServiceRowActionsProps['service']
  readonly onClose: () => void
  readonly onDone: (outcome: { readonly ok: true } | { readonly ok: false; readonly message: string }) => void
}) {
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(service.imageUrl)
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    setChosen(file)
    setAnswer(null)
    if (file !== null) {
      // The browser's own object URL, revoked when the next pick replaces it or
      // the dialog closes — see the effect below.
      setPreview(URL.createObjectURL(file))
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (chosen === null) {
      setAnswer({ ok: false, message: SERVICES_PAGE.picture.noFile })
      return
    }
    startTransition(async () => {
      const bytes = new Uint8Array(await chosen.arrayBuffer())
      const outcome: UploadResult = await uploadServiceImageAction(service.id, {
        filename: chosen.name,
        contentType: chosen.type,
        bytes,
        previousKey: service.imageKey ?? undefined,
        previousBackend:
          service.imageBackend === 'vercel-blob' || service.imageBackend === 'public'
            ? service.imageBackend
            : undefined,
      })
      if (outcome.ok) {
        onDone({ ok: true })
        return
      }
      setAnswer({ ok: false, message: outcome.message })
    })
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[520px]"
      >
        <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
              <Icon name="image" size="card" />
            </span>
            {SERVICES_PAGE.picture.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={SERVICES_PAGE.edit.cancel}
            onClick={onClose}
          />
        </header>

        <form id={PICTURE_FORM_ID} className="flex flex-col gap-4 px-5 pb-2" onSubmit={submit}>
          <p className="text-sm text-ink-2">{SERVICES_PAGE.picture.lead}</p>

          <div className="flex items-center justify-center rounded-lg border border-dashed border-line-2 bg-surface-2 p-4">
            {preview === null ? (
              <span className="flex items-center gap-2 text-sm text-ink-3">
                <Icon name="image" size="compact" />
                {SERVICES_PAGE.picture.empty}
              </span>
            ) : (
              // The URL is either the row's own stored URL or the browser's
              // object URL for the chosen file; both are what the manager should
              // see, and `alt` is the service's own name.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={service.name}
                className="max-h-56 rounded-md object-contain"
              />
            )}
          </div>

          <Field label={SERVICES_PAGE.picture.field}>
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={onPick}
              className="block inline-size-full cursor-pointer rounded-md border border-line-2 bg-surface px-3 py-2 text-sm text-ink file:me-3 file:rounded-xs file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </Field>

          {answer === null ? null : <FormAnswer answer={answer} />}
        </form>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {SERVICES_PAGE.edit.cancel}
          </Button>
          <Button
            type="submit"
            form={PICTURE_FORM_ID}
            variant="primary"
            loading={pending}
            disabled={chosen === null}
          >
            {SERVICES_PAGE.picture.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the picture dialog's footer refers to. */
const PICTURE_FORM_ID = 'service-picture-form'

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

/* ── The pieces the six forms share ────────────────────────────────────────── */

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