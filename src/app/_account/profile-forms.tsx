/**
 * The profile page's two forms — the person's own facts, and their own consent.
 *
 * The two are two components for the reason `02-architecture.md` §6 splits a read from
 * a write, and for the reason `_customers/profile-forms.tsx` splits the desk's three:
 * each has its own pending state and its own sentence for the failure the module
 * raised, and a single form holding both would be a form whose submit button had to
 * decide which of two actions it was submitting.
 *
 * ## Why neither form carries a customer id
 *
 * The same property `appointment-actions.tsx` keeps: the action resolves the customer
 * from the session, and a prop a parent could pass another person's id to would be the
 * horizontal escalation `09-security.md` §7 describes. The forms' props are the row's
 * current values and nothing else.
 *
 * ## Why the mobile is a paragraph and not a field
 *
 * The mobile is the person's identity key — the login resolves by it and the dedupe
 * reads it — and the module's write path does not accept one. A form that offered the
 * field would offer a field the write path refuses, so the page shows the number as a
 * fact and the note names where its change lives.
 */

'use client'

import { useState, useTransition } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/core/components/button'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field, TextInput } from '@/core/components/form'
import { CUSTOMER_PANEL } from '@/modules/customers'
import { formatPhone } from '@/core/localization'

import {
  recordOwnConsentAction,
  updateOwnProfileAction,
  type PanelActionResult,
} from './actions'

/* ── The profile's own facts ─────────────────────────────────────────────────── */

/** The edit form's props: the row's current values, which the fields start from. */
export interface OwnProfileFormProps {
  readonly firstName: string
  readonly lastName: string | null
  /** Shown as a fact, never offered as a field. */
  readonly mobile: string
  readonly birthDate: string | null
  readonly residenceArea: string | null
}

/** «ویرایش پروفایل» — the facts the customer edits themselves. */
export function OwnProfileForm(props: OwnProfileFormProps) {
  const [birthDate, setBirthDate] = useState<string>(props.birthDate ?? '')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    startTransition(async () => {
      const outcome: PanelActionResult = await updateOwnProfileAction({
        firstName: formField(form, 'firstName'),
        lastName: formField(form, 'lastName'),
        birthDate: birthDate === '' ? null : birthDate,
        residenceArea: formField(form, 'residenceArea'),
      })
      setMessage(outcome.ok ? CUSTOMER_PANEL.profile.saved : outcome.message)
    })
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="flex flex-col gap-4 panel:flex-row">
        <Field label={CUSTOMER_PANEL.profile.fields.firstName} required className="flex-1">
          <TextInput name="firstName" defaultValue={props.firstName} autoComplete="given-name" />
        </Field>
        <Field label={CUSTOMER_PANEL.profile.fields.lastName} className="flex-1">
          <TextInput name="lastName" defaultValue={props.lastName ?? ''} autoComplete="family-name" />
        </Field>
      </div>
      <Field label={CUSTOMER_PANEL.profile.fields.mobile} hint={CUSTOMER_PANEL.profile.mobileNote}>
        <TextInput name="mobile" value={formatPhone(props.mobile)} readOnly aria-readonly="true" />
      </Field>
      <div className="flex flex-col gap-4 panel:flex-row">
        <Field label={CUSTOMER_PANEL.profile.fields.birthDate} className="flex-1">
          <JalaliDatePicker name="birthDate" value={birthDate} onChange={setBirthDate} />
        </Field>
        <Field label={CUSTOMER_PANEL.profile.fields.residenceArea} className="flex-1">
          <TextInput name="residenceArea" defaultValue={props.residenceArea ?? ''} />
        </Field>
      </div>
      <div className="flex flex-col gap-3">
        <Button type="submit" variant="primary" loading={pending} leadingIcon="confirm" block>
          {CUSTOMER_PANEL.profile.submit}
        </Button>
        {message === null ? null : (
          <p className="text-sm font-semibold text-brand-600" role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  )
}

/* ── The consent flags ───────────────────────────────────────────────────────── */

/** The consent form's props: the four flags as the row holds them. */
export interface OwnConsentFormProps {
  readonly sms: boolean
  readonly whatsApp: boolean
  readonly phone: boolean
  readonly beforeAfter: boolean
}

/** «اجازه‌های ارسال» — the four channels, each granted or revoked by the person. */
export function OwnConsentForm(props: OwnConsentFormProps) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    startTransition(async () => {
      const outcome: PanelActionResult = await recordOwnConsentAction({
        sms: formCheck(form, 'sms'),
        whatsApp: formCheck(form, 'whatsApp'),
        phone: formCheck(form, 'phone'),
        beforeAfter: formCheck(form, 'beforeAfter'),
      })
      setMessage(outcome.ok ? CUSTOMER_PANEL.profile.consent.saved : outcome.message)
    })
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="flex flex-col gap-3">
        <ConsentOption name="sms" label={CUSTOMER_PANEL.profile.consent.sms} checked={props.sms} />
        <ConsentOption
          name="whatsApp"
          label={CUSTOMER_PANEL.profile.consent.whatsApp}
          checked={props.whatsApp}
        />
        <ConsentOption name="phone" label={CUSTOMER_PANEL.profile.consent.phone} checked={props.phone} />
        <ConsentOption
          name="beforeAfter"
          label={CUSTOMER_PANEL.profile.consent.beforeAfter}
          hint={CUSTOMER_PANEL.profile.consent.beforeAfterNote}
          checked={props.beforeAfter}
        />
      </div>
      <div className="flex flex-col gap-3">
        <Button type="submit" variant="primary" loading={pending} leadingIcon="confirm" block>
          {CUSTOMER_PANEL.profile.consent.submit}
        </Button>
        {message === null ? null : (
          <p className="text-sm font-semibold text-brand-600" role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  )
}

/** One channel, as a labelled checkbox the person flips. */
function ConsentOption({
  name,
  label,
  hint,
  checked,
}: {
  readonly name: string
  readonly label: string
  readonly hint?: string
  readonly checked: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-line-2 bg-surface px-4 py-3 text-sm text-ink hover:bg-surface-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="mt-0.5 size-4 accent-brand"
      />
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{label}</span>
        {hint === undefined ? null : <span className="text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

/** A named text field's value, trimmed, as the action takes it. */
function formField(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? ''
}

/** A named checkbox's state, as the flag the action takes. */
function formCheck(form: HTMLFormElement, name: string): boolean {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false
}
