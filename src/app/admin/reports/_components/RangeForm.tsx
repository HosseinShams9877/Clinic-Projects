/**
 * «بازه دلخواه» — the two date fields, as a GET form the page re-reads.
 *
 * A Client Component because the picker is one: the two `JalaliDatePicker`s hold
 * their own state and write the picked `YYYY-MM-DD` into hidden inputs named
 * `from` and `to`, so the form still submits the same values a raw `<input>` would
 * have — the page re-reads them the same way.
 *
 * Each field's label is rendered here (a plain `<span>`) and the enclosing `Field`
 * is given an empty label so the picker's own wiring still works without a second
 * label being drawn on top of the one above it.
 */

'use client'

import { useState } from 'react'

import { Button } from '@/core/components/button'
import { Field } from '@/core/components/form'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { asLocalDate, formatDate } from '@/core/localization'

import { ADMIN_REPORTS } from '@/app/admin/catalog'
import { REPORT_FIELDS } from '@/modules/reports'

export interface RangeFormProps {
  /** The range's first day, as the page read it. */
  readonly from: string
  /** The range's last day, as the page read it. */
  readonly to: string
  /** The route the form submits to. */
  readonly basePath: string
}

export function RangeForm({ from, to, basePath }: RangeFormProps) {
  const [fromValue, setFromValue] = useState(from)
  const [toValue, setToValue] = useState(to)

  return (
    <form
      action={basePath}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 panel:flex-row panel:items-end panel:justify-start"
    >
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-semibold text-ink-3">{REPORT_FIELDS.rangeFrom}</span>
        {/*
          An empty label hides the Field's own caption, so the label above is the one
          the picker renders under. The picker still reads its id/aria wiring from the
          Field context, so it stays a labelled control for assistive technology.
        */}
        <Field label="">
          <JalaliDatePicker value={fromValue} onChange={setFromValue} name="from" />
        </Field>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-semibold text-ink-3">{REPORT_FIELDS.rangeTo}</span>
        <Field label="">
          <JalaliDatePicker value={toValue} onChange={setToValue} name="to" />
        </Field>
      </div>

      <Button type="submit" variant="primary">
        {REPORT_FIELDS.apply}
      </Button>

      <p className="text-xs text-ink-3">
        {`${ADMIN_REPORTS.customRangeHint} · ${formatDate(asLocalDate(fromValue), 'long')}${
          ADMIN_REPORTS.spanJoin
        }${formatDate(asLocalDate(toValue), 'long')}`}
      </p>
    </form>
  )
}