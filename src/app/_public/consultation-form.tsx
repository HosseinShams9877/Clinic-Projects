/**
 * The consultation form — `contact.html`'s island.
 *
 * One client component, because the form's own state is its submitting flag and its
 * outcome, and because the submit is a Server Action a client component may call. The
 * labels and the sentences are props the page built from the catalog; the island holds
 * no Persian literal of its own.
 */

'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput, TextArea } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { isValidMobile, normalizeMobile } from '@/core/localization'

import { requestConsultation, type ConsultationResult } from '@/app/_public/consultation-action'

interface FormProps {
  readonly labels: {
    readonly firstName: string
    readonly lastName: string
    readonly mobile: string
    readonly service: string
    readonly note: string
  }
  readonly hints: { readonly mobile: string }
  readonly submit: string
  readonly submitting: string
  readonly result: {
    readonly successTitle: string
    readonly success: string
    readonly failure: string
  }
  readonly services: readonly { readonly id: string; readonly name: string }[]
}

export function ConsultationForm(props: FormProps) {
  const [firstName, setFirstName] = useState<string>('')
  const [lastName, setLastName] = useState<string>('')
  const [mobile, setMobile] = useState<string>('')
  const [service, setService] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [failure, setFailure] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ConsultationResult | null>(null)
  const [pending, startTransition] = useTransition()

  if (outcome !== null && outcome.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand">
          <Icon name="success" size="action" />
        </span>
        <h3 className="text-lg font-bold text-ink">{props.result.successTitle}</h3>
        <p className="text-sm leading-7 text-ink-2">{props.result.success}</p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOutcome(null)
            setFirstName('')
            setLastName('')
            setMobile('')
            setService('')
            setNote('')
          }}
        >
          {props.submit}
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        setFailure(null)
        startTransition(async () => {
          const result = await requestConsultation({
            firstName,
            lastName,
            mobile,
            service,
            note,
          })
          setOutcome(result)
          if (!result.ok) setFailure(result.message)
        })
      }}
    >
      {failure === null ? null : (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3.5 text-sm text-red-700">
          <Icon name="error" size="compact" />
          {failure}
        </p>
      )}
      <div className="grid gap-4 panel:grid-cols-2">
        <Field label={props.labels.firstName}>
          <TextInput
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
            required
          />
        </Field>
        <Field label={props.labels.lastName}>
          <TextInput
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
          />
        </Field>
      </div>
      <Field label={props.labels.mobile} hint={props.hints.mobile}>
        <TextInput
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          required
          aria-invalid={mobile !== '' && !isValidMobile(normalizeMobile(mobile))}
        />
      </Field>
      <Field label={props.labels.service}>
        <select
          value={service}
          onChange={(event) => setService(event.target.value)}
          className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink"
        >
          <option value="">—</option>
          {props.services.map((row) => (
            <option key={row.id} value={row.name}>
              {row.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={props.labels.note}>
        <TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? props.submitting : props.submit}
      </Button>
    </form>
  )
}
