/**
 * «ثبت مشتری» — the manager's add-customer dialog.
 *
 * The same fields the desk's dialog collects, through the same shared
 * `addCustomerAction`, so the dedupe is the module's and the two panels cannot write
 * two different shapes of person. The copy is this panel's own: the manager's button
 * is «ثبت مشتری» and the desk's is «افزودن مشتری», and the two sentences are two keys
 * and not one a component guesses at.
 */

'use client'

import { useState, useTransition } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { AcquisitionSource } from '@/core/constants'
import { ACQUISITION_SOURCE_LABELS } from '@/modules/customers'

import { ADMIN_CUSTOMERS } from '@/app/admin/catalog'
import { addCustomerAction } from '@/app/_customers/actions'

const SOURCE_OPTIONS = Object.values(AcquisitionSource).map((value) => ({
  value,
  label: ACQUISITION_SOURCE_LABELS[value],
}))

export function AddCustomerDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobile, setMobile] = useState('')
  const [source, setSource] = useState<string | null>(null)

  if (!open) {
    return (
      <Button variant="primary" leadingIcon="add" onClick={() => setOpen(true)}>
        {ADMIN_CUSTOMERS.addTrigger}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (firstName === '' || mobile === '') return
    setFailed(false)
    startTransition(() => {
      void addCustomerAction('admin', { firstName, lastName, mobile, acquisitionSource: source ?? '' }).then((result) => {
        if (result.ok) {
          setOpen(false)
          setFirstName('')
          setLastName('')
          setMobile('')
          setSource(null)
          return
        }
        setFailed(true)
      })
    })
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-[var(--overlay)] p-0 panel:items-center panel:p-6"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{ADMIN_CUSTOMERS.add.title}</h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={ADMIN_CUSTOMERS.add.cancel} onClick={() => setOpen(false)} />
        </header>
        <form className="flex flex-col gap-4 p-5" onSubmit={submit}>
          <Field label={ADMIN_CUSTOMERS.add.firstName} required>
            <TextInput name="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </Field>
          <Field label={ADMIN_CUSTOMERS.add.lastName}>
            <TextInput name="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </Field>
          <Field label={ADMIN_CUSTOMERS.add.mobile} required>
            <TextInput name="mobile" value={mobile} inputMode="numeric" dir="ltr" onChange={(event) => setMobile(event.target.value)} />
          </Field>
          <Field label={ADMIN_CUSTOMERS.add.source}>
            <Combobox
              name="acquisitionSource"
              value={source}
              onChange={setSource}
              options={SOURCE_OPTIONS}
              placeholder={ADMIN_CUSTOMERS.add.sourcePlaceholder}
              emptyMessage={ADMIN_CUSTOMERS.add.sourcePlaceholder}
            />
          </Field>
          {failed ? (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {ADMIN_CUSTOMERS.add.error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              {ADMIN_CUSTOMERS.add.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={firstName === '' || mobile === ''}>
              {ADMIN_CUSTOMERS.add.submit}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
