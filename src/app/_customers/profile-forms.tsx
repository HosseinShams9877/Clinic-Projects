/**
 * The profile's three writers, as the three forms the manager fills render them.
 *
 * The profile is a read and three writes, and the three are three states of three
 * forms rather than one component holding all three: each has its own sentence for a
 * failure the module raised, its own pending state, and nothing else in common. A
 * single form holding all three would be a component whose submit button had to
 * decide which of three actions it was submitting.
 *
 * ## Why the three submit without a navigation
 *
 * Each action ends in `revalidatePath`, so the profile the manager sees after a save
 * is the profile the database holds. The sentence the module raises lands on the form
 * that raised it, because the form is what the manager was acting on — the same
 * answer the day grid's row actions give, and for the same reason.
 *
 * ## Why the mobile is not on the edit form
 *
 * The mobile is the person's identity — the key `customer_mobile_key` exists on it and
 * the dedupe reads it. Changing it is a different action than correcting a name, and
 * the module's own `updateCustomerProfile` does not accept one; a form that offered it
 * would offer a field the write path refuses.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextArea, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { CUSTOMER_PROFILE_PAGE } from '@/app/catalog'
import { cx } from '@/core/lib'

import {
  recordConsentAction,
  updateCustomerNoteAction,
  updateCustomerProfileAction,
  type ActionResult,
  type CustomerEditInput,
} from './actions'
import type { ConsentFlags } from '@/modules/customers'

/* ── The edit form ─────────────────────────────────────────────────────────── */

/** The edit form's own props: the customer it edits, and the row's current facts. */
export interface ProfileEditProps {
  readonly customerId: string
  readonly firstName: string
  readonly lastName: string | null
  readonly birthDate: string | null
  readonly residenceArea: string | null
}

/**
 * «ویرایش پرونده» — the profile's own facts, opened from the details section.
 *
 * A client component because the dialog is an open state and the failure the module
 * raises comes back onto the same form.
 */
export function ProfileEdit(props: ProfileEditProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const titleId = useId()

  if (!open) {
    return (
      <Button size="small" variant="neutral" leadingIcon="edit" onClick={() => setOpen(true)}>
        {CUSTOMER_PROFILE_PAGE.edit.title}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const birthDate = asFormString(event.currentTarget, 'birthDate')
    const input: CustomerEditInput = {
      firstName: asFormString(event.currentTarget, 'firstName'),
      lastName: asFormString(event.currentTarget, 'lastName'),
      birthDate: birthDate === '' ? null : birthDate,
      residenceArea: asFormString(event.currentTarget, 'residenceArea'),
    }
    startTransition(async () => {
      const outcome: ActionResult = await updateCustomerProfileAction('admin', props.customerId, input)
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
            {CUSTOMER_PROFILE_PAGE.edit.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={CUSTOMER_PROFILE_PAGE.edit.cancel}
            onClick={() => setOpen(false)}
          />
        </header>

        <form id={PROFILE_EDIT_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={CUSTOMER_PROFILE_PAGE.fields.firstName} required className="flex-1">
              <TextInput name="firstName" defaultValue={props.firstName} />
            </Field>
            <Field label={CUSTOMER_PROFILE_PAGE.fields.lastName} className="flex-1">
              <TextInput name="lastName" defaultValue={props.lastName ?? ''} />
            </Field>
          </div>

          <Field label={CUSTOMER_PROFILE_PAGE.fields.birthDate}>
            <JalaliDatePicker name="birthDate" value={props.birthDate} onChange={() => {}} />
          </Field>

          <Field label={CUSTOMER_PROFILE_PAGE.fields.residenceArea}>
            <TextInput name="residenceArea" defaultValue={props.residenceArea ?? ''} />
          </Field>

          <FormAnswer answer={answer} />
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {CUSTOMER_PROFILE_PAGE.edit.cancel}
          </Button>
          <Button type="submit" form="customer-profile-edit" variant="primary" loading={pending}>
            {CUSTOMER_PROFILE_PAGE.edit.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the footer's submit button refers to, so the form and its button are one. */
const PROFILE_EDIT_FORM_ID = 'customer-profile-edit'

/* ── The consent form ──────────────────────────────────────────────────────── */

/** The consent form's own props: the customer and the four flags as they stand. */
export interface ConsentFormProps {
  readonly customerId: string
  readonly flags: ConsentFlags
}

/**
 * «تنظیمات ارسال» — the four flags, written with their evidence rows.
 *
 * Each flag is a real checkbox because the four are independent and a radio group
 * would make them a choice they are not. The four render in the catalog's own order,
 * which is the order the module's `ConsentFlags` names them, and the form renders its
 * own success sentence because the panel stays open after a save.
 */
export function ConsentForm({ customerId, flags }: ConsentFormProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: ConsentFlags = {
      sms: checked(event.currentTarget, 'sms'),
      whatsApp: checked(event.currentTarget, 'whatsApp'),
      phone: checked(event.currentTarget, 'phone'),
      beforeAfter: checked(event.currentTarget, 'beforeAfter'),
    }
    startTransition(async () => {
      const outcome: ActionResult = await recordConsentAction('admin', customerId, next)
      setAnswer(outcome.ok ? { ok: true, message: CUSTOMER_PROFILE_PAGE.consent.saved } : outcome)
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm text-ink-2">{CUSTOMER_PROFILE_PAGE.consent.lead}</p>
      <div className="grid grid-cols-1 gap-2 panel:grid-cols-2">
        <ConsentCheckbox name="sms" label={CUSTOMER_PROFILE_PAGE.consent.sms} checked={flags.sms} />
        <ConsentCheckbox
          name="whatsApp"
          label={CUSTOMER_PROFILE_PAGE.consent.whatsApp}
          checked={flags.whatsApp}
        />
        <ConsentCheckbox
          name="phone"
          label={CUSTOMER_PROFILE_PAGE.consent.phone}
          checked={flags.phone}
        />
        <ConsentCheckbox
          name="beforeAfter"
          label={CUSTOMER_PROFILE_PAGE.consent.beforeAfter}
          checked={flags.beforeAfter}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="small" loading={pending}>
          {CUSTOMER_PROFILE_PAGE.consent.save}
        </Button>
        <FormAnswer answer={answer} />
      </div>
    </form>
  )
}

/** One flag, as a checkbox the design system's control styles accept. */
function ConsentCheckbox({
  name,
  label,
  checked,
}: {
  readonly name: string
  readonly label: string
  readonly checked: boolean
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-sm border border-line-2 bg-surface px-3 py-2 text-sm text-ink hover:bg-surface-2"
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="size-4 accent-brand"
      />
      {label}
    </label>
  )
}

/* ── The clinical note ─────────────────────────────────────────────────────── */

/**
 * «یادداشت پزشک» — the note, kept beside the medical history.
 *
 * The note is the one field the form clears as well as fills, because a note that was
 * true and stopped being true is a note the file should not keep telling.
 */
export function DoctorNoteForm({
  customerId,
  note,
}: {
  readonly customerId: string
  readonly note: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = asFormString(event.currentTarget, 'note').trim()
    startTransition(async () => {
      const outcome: ActionResult = await updateCustomerNoteAction(
        'admin',
        customerId,
        next === '' ? null : next,
      )
      setAnswer(outcome.ok ? { ok: true, message: CUSTOMER_PROFILE_PAGE.note.saved } : outcome)
    })
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field label={CUSTOMER_PROFILE_PAGE.fields.doctorNote}>
        <TextArea
          name="note"
          defaultValue={note ?? ''}
          placeholder={CUSTOMER_PROFILE_PAGE.note.placeholder}
          rows={4}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="neutral" size="small" loading={pending}>
          {CUSTOMER_PROFILE_PAGE.note.save}
        </Button>
        <FormAnswer answer={answer} />
      </div>
    </form>
  )
}

/* ── The three pieces every form renders ───────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/**
 * A form's answer: nothing while the form is clean, a sentence once the action returned.
 *
 * The tone is the outcome's own and not a guess from the text, because two forms each
 * have their own success sentence and a comparison against them would be a third
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

/** Whether a named checkbox in the form is checked. */
function checked(form: HTMLFormElement, name: string): boolean {
  const element = form.elements.namedItem(name)
  return element instanceof HTMLInputElement ? element.checked : false
}

/** One field's value from a submitted form, or '' when the field was absent. */
function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement ? value.value : ''
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}
