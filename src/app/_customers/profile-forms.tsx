// src/app/_customers/profile-forms.tsx

'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

export interface ProfileEditProps {
  readonly customerId: string
  readonly firstName: string
  readonly lastName: string | null
  readonly birthDate: string | null
  readonly residenceArea: string | null
}

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

const PROFILE_EDIT_FORM_ID = 'customer-profile-edit'

/* ── The consent form ──────────────────────────────────────────────────────── */

export interface ConsentFormProps {
  readonly customerId: string
  readonly flags: ConsentFlags
}

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

/* ── The clinical note (JUST THE FORM) ─────────────────────────────────────── */

export function DoctorNoteForm({
  customerId,
  panel = 'admin',
}: {
  readonly customerId: string
  readonly panel?: 'admin' | 'doctor'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [text, setText] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (text.trim() === '') return

    startTransition(async () => {
      const outcome: ActionResult = await updateCustomerNoteAction(
        panel,
        customerId,
        text.trim(),
      )
      if (outcome.ok) {
        setAnswer({ ok: true, message: CUSTOMER_PROFILE_PAGE.note.saved })
        setText('')
        router.refresh()
        return
      }
      setAnswer(outcome)
    })
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field label={CUSTOMER_PROFILE_PAGE.fields.doctorNote}>
        <TextArea
          name="note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={CUSTOMER_PROFILE_PAGE.note.placeholder}
          rows={3}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="neutral" size="small" loading={pending} disabled={text.trim() === ''}>
          {CUSTOMER_PROFILE_PAGE.note.save}
        </Button>
        <FormAnswer answer={answer} />
      </div>
    </form>
  )
}

/* ── The three pieces every form renders ───────────────────────────────────── */

type FormAnswer = { readonly ok: boolean; readonly message: string }

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

function checked(form: HTMLFormElement, name: string): boolean {
  const element = form.elements.namedItem(name)
  return element instanceof HTMLInputElement ? element.checked : false
}

function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement ? value.value : ''
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}