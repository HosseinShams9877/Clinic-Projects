/**
 * The «افزودن تزریق» popup.
 *
 * The form collects one injection: where, what, how much in what unit, at what
 * depth and technique, the batch number, the session's date, and an optional note.
 * Every closed set is a `<select>` over the constants and not a free-text field,
 * because the record's whole value is that it is queryable later — an area typed
 * as «گونه» is an area nobody can count.
 *
 * ## The session date is the shell's own JalaliDatePicker
 *
 * The date field is the same control the appointment's day picker uses — a
 * `JalaliDatePicker` wrapped in a `Field` — so the injection form's date and the
 * rest of the product's date fields read the same way. A free-text field would be
 * a second date format the record could carry, and the record's whole value is
 * that it is queryable later.
 */

'use client'

import { useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field, TextInput } from '@/core/components/form'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { Icon } from '@/core/components/icons'
import {
  INJECTION_AREAS,
  INJECTION_DEPTHS,
  INJECTION_MATERIALS,
  INJECTION_TECHNIQUES,
  INJECTION_UNITS,
} from '@/core/constants'
import { asLocalDate, todayLocalDate, type LocalDate } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import {
  INJECTION_AREA_LABELS,
  INJECTION_DEPTH_LABELS,
  INJECTION_MATERIAL_LABELS,
  INJECTION_TECHNIQUE_LABELS,
  INJECTION_UNIT_LABELS,
} from '@/modules/injections'

import { INJECTION_TAB } from './catalog'
import { createInjectionAction, type InjectionActionResult, type InjectionInput } from './actions'

export interface InjectionDialogProps {
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly customerId: string
}

/** The form's opening values. */
interface InjectionValues {
  readonly area: string
  readonly material: string
  readonly brand: string
  readonly amount: string
  readonly amountUnit: string
  readonly depth: string
  readonly technique: string
  readonly batchNumber: string
  readonly note: string
  readonly localDate: LocalDate
}

export function InjectionDialog(props: InjectionDialogProps) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<InjectionValues>(() => emptyValues())
  const [result, setResult] = useState<InjectionActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  if (!open) {
    return (
      <Button
        size="small"
        variant="primary"
        leadingIcon="add"
        onClick={() => {
          setValues(emptyValues())
          setResult(null)
          setOpen(true)
        }}
      >
        {INJECTION_TAB.add}
      </Button>
    )
  }

  async function submit() {
    setPending(true)
    const input: InjectionInput = {
      customerId: props.customerId,
      area: values.area,
      material: values.material,
      brand: values.brand,
      amount: values.amount,
      amountUnit: values.amountUnit,
      depth: values.depth,
      technique: values.technique,
      batchNumber: values.batchNumber,
      note: values.note,
      localDate: values.localDate,
    }
    const outcome = await createInjectionAction(props.panel, input)
    setPending(false)
    if (outcome.ok) {
      setOpen(false)
      return
    }
    setResult(outcome)
  }

  const canSubmit = values.area !== '' && values.material !== ''

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[560px]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {INJECTION_TAB.dialog.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={INJECTION_TAB.dialog.close}
            onClick={() => setOpen(false)}
          />
        </header>

        <div className="flex flex-col gap-4 p-5">
          <Field label={INJECTION_TAB.dialog.area} required>
            <select
              className={CONTROL_CLASSES}
              value={values.area}
              onChange={(event) => setValues({ ...values, area: event.target.value })}
            >
              <option value="">{INJECTION_TAB.dialog.chooseArea}</option>
              {INJECTION_AREAS.map((code) => (
                <option key={code} value={code}>
                  {INJECTION_AREA_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={INJECTION_TAB.dialog.material} required>
            <select
              className={CONTROL_CLASSES}
              value={values.material}
              onChange={(event) => setValues({ ...values, material: event.target.value })}
            >
              <option value="">{INJECTION_TAB.dialog.chooseMaterial}</option>
              {INJECTION_MATERIALS.map((code) => (
                <option key={code} value={code}>
                  {INJECTION_MATERIAL_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={INJECTION_TAB.dialog.brand}>
            <TextInput
              type="text"
              value={values.brand}
              placeholder={INJECTION_TAB.dialog.brandPlaceholder}
              onChange={(event) => setValues({ ...values, brand: event.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={INJECTION_TAB.dialog.amount}>
              <TextInput
                type="text"
                inputMode="decimal"
                value={values.amount}
                placeholder={INJECTION_TAB.dialog.amountPlaceholder}
                onChange={(event) => setValues({ ...values, amount: event.target.value })}
              />
            </Field>
            <Field label={INJECTION_TAB.dialog.amountUnit}>
              <select
                className={CONTROL_CLASSES}
                value={values.amountUnit}
                onChange={(event) => setValues({ ...values, amountUnit: event.target.value })}
              >
                <option value="">—</option>
                {INJECTION_UNITS.map((code) => (
                  <option key={code} value={code}>
                    {INJECTION_UNIT_LABELS[code]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={INJECTION_TAB.dialog.depth}>
              <select
                className={CONTROL_CLASSES}
                value={values.depth}
                onChange={(event) => setValues({ ...values, depth: event.target.value })}
              >
                <option value="">—</option>
                {INJECTION_DEPTHS.map((code) => (
                  <option key={code} value={code}>
                    {INJECTION_DEPTH_LABELS[code]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={INJECTION_TAB.dialog.technique}>
              <select
                className={CONTROL_CLASSES}
                value={values.technique}
                onChange={(event) => setValues({ ...values, technique: event.target.value })}
              >
                <option value="">—</option>
                {INJECTION_TECHNIQUES.map((code) => (
                  <option key={code} value={code}>
                    {INJECTION_TECHNIQUE_LABELS[code]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={INJECTION_TAB.dialog.batchNumber}>
            <TextInput
              type="text"
              value={values.batchNumber}
              placeholder={INJECTION_TAB.dialog.batchPlaceholder}
              onChange={(event) => setValues({ ...values, batchNumber: event.target.value })}
            />
          </Field>

          <Field label={INJECTION_TAB.dialog.sessionDate} required>
            <JalaliDatePicker
              value={values.localDate}
              onChange={(value) => setValues({ ...values, localDate: asLocalDate(value) })}
            />
          </Field>

          <Field label={INJECTION_TAB.dialog.note}>
            <TextInput
              type="text"
              value={values.note}
              onChange={(event) => setValues({ ...values, note: event.target.value })}
            />
          </Field>

          {result !== null && !result.ok ? (
            <p className="flex items-center gap-1 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {result.message}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {INJECTION_TAB.dialog.cancel}
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {INJECTION_TAB.dialog.submit}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The form's opening values — today's Jalali day, and every closed set unset. */
function emptyValues(): InjectionValues {
  return {
    area: '',
    material: '',
    brand: '',
    amount: '',
    amountUnit: '',
    depth: '',
    technique: '',
    batchNumber: '',
    note: '',
    localDate: todayLocalDate(realClock()),
  }
}

/** The dimmed backdrop a click outside and an Escape both close. */
function Overlay({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
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

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}