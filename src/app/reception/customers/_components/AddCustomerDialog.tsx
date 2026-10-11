/**
 * «افزودن مشتری» — the desk's add-customer dialog.
 *
 * A client dialog that collects the fields `createOrFindCustomer` needs and calls the
 * `addCustomerAction` Server Action, so the module's transaction runs on the server and
 * the dedupe is the module's. On success the dialog closes and the list revalidates;
 * on failure it shows the catalog's one error sentence. Residence area is not collected
 * here — `createOrFindCustomer` does not accept it — and no field is faked.
 *
 * Two shapes, one dialog:
 * - **Desktop (≥1000px)**: a centred modal, all corners rounded, `panel:max-w-2xl`,
 *   the four fields in two columns, the two action buttons at the bottom of the card.
 * - **Mobile (<1000px)**: a bottom sheet pinned to the bottom edge, only the top
 *   corners rounded, capped at 92% of the viewport, with a sticky header, a scrollable
 *   body, and the two action buttons **stuck to the bottom of the sheet** — so they are
 *   always reachable however long the form is.
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
import { cx } from '@/core/lib'

import { RECEPTION_CUSTOMERS } from '@/app/catalog'
import { addCustomerAction } from '../actions'

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

  function reset() {
    setFirstName('')
    setLastName('')
    setMobile('')
    setSource(null)
    setFailed(false)
  }

  function close() {
    setOpen(false)
    reset()
  }

  if (!open) {
    return (
      <Button variant="primary" leadingIcon="add" onClick={() => setOpen(true)}>
        {RECEPTION_CUSTOMERS.add.trigger}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (firstName === '' || mobile === '') return
    setFailed(false)
    startTransition(() => {
      void addCustomerAction({
        firstName,
        lastName,
        mobile,
        acquisitionSource: source ?? '',
      }).then((result) => {
        if (result.ok) {
          close()
          return
        }
        setFailed(true)
      })
    })
  }

  const canSubmit = firstName !== '' && mobile !== ''

  return (
    <div
      className={cx(
        // Backdrop: full-screen, above everything.
        'fixed inset-0 z-[var(--z-modal)] flex flex-col bg-[var(--overlay)]',
        // Mobile: pin the sheet to the bottom edge.
        'justify-end',
        // Desktop: centre the card, with outer padding.
        'panel:items-center panel:justify-center panel:p-6',
      )}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
        className={cx(
          // Base card
          'flex w-full flex-col overflow-hidden bg-surface shadow-3',
          // Mobile: bottom sheet — only the top corners rounded, capped height.
          'max-h-[92dvh] rounded-t-2xl',
          // Desktop: centred modal — all corners rounded, capped width and height.
          'panel:max-h-[85dvh] panel:max-w-2xl panel:rounded-2xl',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id="add-customer-title" className="text-lg font-bold text-ink">
            {RECEPTION_CUSTOMERS.add.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={RECEPTION_CUSTOMERS.add.cancel}
            onClick={close}
          />
        </header>

        {/* The form body — scrolls on both layouts. */}
        <form
          id="add-customer-form"
          onSubmit={submit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={RECEPTION_CUSTOMERS.add.firstName} required className="flex-1">
              <TextInput
                name="firstName"
                value={firstName}
                autoComplete="given-name"
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field label={RECEPTION_CUSTOMERS.add.lastName} className="flex-1">
              <TextInput
                name="lastName"
                value={lastName}
                autoComplete="family-name"
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={RECEPTION_CUSTOMERS.add.mobile} required className="flex-1">
              <TextInput
                name="mobile"
                value={mobile}
                inputMode="numeric"
                dir="ltr"
                autoComplete="tel"
                className="tabular-nums"
                onChange={(event) => setMobile(event.target.value)}
              />
            </Field>
            <Field label={RECEPTION_CUSTOMERS.add.source} className="flex-1">
              <Combobox
                name="acquisitionSource"
                value={source}
                onChange={setSource}
                options={SOURCE_OPTIONS}
                placeholder={RECEPTION_CUSTOMERS.add.sourcePlaceholder}
                emptyMessage={RECEPTION_CUSTOMERS.add.sourcePlaceholder}
              />
            </Field>
          </div>

          {failed ? (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {RECEPTION_CUSTOMERS.add.error}
            </p>
          ) : null}
        </form>

        {/*
          Actions — outside the form. On mobile this is a sticky footer pinned to
          the bottom edge of the sheet; on desktop it is a normal footer bar at the
          bottom of the card. The submit button references the form by id, so the
          whole layout stays one form.
        */}
        <footer
          className={cx(
            'flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3',
            // Mobile: sticky at the bottom of the scroll area.
            'sticky bottom-0',
            // Desktop: static (normal footer).
            'panel:static',
          )}
        >
          <Button type="button" variant="ghost" disabled={pending} onClick={close}>
            {RECEPTION_CUSTOMERS.add.cancel}
          </Button>
          <Button
            type="submit"
            form="add-customer-form"
            variant="primary"
            loading={pending}
            disabled={!canSubmit}
          >
            {RECEPTION_CUSTOMERS.add.submit}
          </Button>
        </footer>
      </div>
    </div>
  )
}