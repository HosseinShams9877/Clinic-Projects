/**
 * «ثبت مشتری» — the manager's add-customer dialog.
 *
 * The same fields the desk's dialog collects, through the same shared
 * `addCustomerAction`, so the dedupe is the module's and the two panels cannot write
 * two different shapes of person. The copy is this panel's own: the manager's button
 * is «ثبت مشتری» and the desk's is «افزودن مشتری», and the two sentences are two keys
 * and not one a component guesses at.
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
        {ADMIN_CUSTOMERS.addTrigger}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (firstName === '' || mobile === '') return
    setFailed(false)
    startTransition(() => {
      void addCustomerAction('admin', {
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
        'fixed inset-0 z-[var(--z-modal)] flex flex-col bg-[var(--overlay)]',
        'justify-end',
        'panel:items-center panel:justify-center panel:p-6',
      )}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
        className={cx(
          'flex w-full flex-col overflow-hidden bg-surface shadow-3',
          'max-h-[92dvh] rounded-t-2xl',
          'panel:max-h-[85dvh] panel:max-w-2xl panel:rounded-2xl',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id="add-customer-title" className="text-lg font-bold text-ink">
            {ADMIN_CUSTOMERS.add.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={ADMIN_CUSTOMERS.add.cancel}
            onClick={close}
          />
        </header>

        <form
          onSubmit={submit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={ADMIN_CUSTOMERS.add.firstName} required className="flex-1">
              <TextInput
                name="firstName"
                value={firstName}
                autoComplete="given-name"
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field label={ADMIN_CUSTOMERS.add.lastName} className="flex-1">
              <TextInput
                name="lastName"
                value={lastName}
                autoComplete="family-name"
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={ADMIN_CUSTOMERS.add.mobile} required className="flex-1">
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
            <Field label={ADMIN_CUSTOMERS.add.source} className="flex-1">
              <Combobox
                name="acquisitionSource"
                value={source}
                onChange={setSource}
                options={SOURCE_OPTIONS}
                placeholder={ADMIN_CUSTOMERS.add.sourcePlaceholder}
                emptyMessage={ADMIN_CUSTOMERS.add.sourcePlaceholder}
              />
            </Field>
          </div>

          {failed ? (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {ADMIN_CUSTOMERS.add.error}
            </p>
          ) : null}

          <div
            className={cx(
              'flex items-center justify-end gap-2',
              'sticky bottom-0 -mx-5 -mb-5 mt-auto',
              'border-t border-line bg-surface px-5 py-3',
              'panel:static panel:m-0 panel:border-0 panel:bg-transparent panel:p-0 panel:pt-2',
            )}
          >
            <Button type="button" variant="ghost" disabled={pending} onClick={close}>
              {ADMIN_CUSTOMERS.add.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              disabled={!canSubmit}
            >
              {ADMIN_CUSTOMERS.add.submit}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}