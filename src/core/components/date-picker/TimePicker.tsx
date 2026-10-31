/**
 * The time picker — the clock-faced companion of the Jalali date picker.
 *
 * The value is a plain `HH:mm` string, which is the shape every column that stores a
 * time of day keeps (`clinicShift.startTime`, `tenantSettings.sendWindowStart`, …),
 * so it crosses the form boundary unchanged and needs no conversion. The grid is
 * 24 hours × 5-minute steps, because the send window runs to `21:00` — a picker that
 * stopped at `20:00` could not represent the default it is seeded with — and a clinic
 * day starts before `08:00` more often than the previous grid assumed.
 *
 * ## The `Field` contract, optionally
 *
 * `JalaliDatePicker` *requires* an enclosing `Field` (`useControlWiring` throws
 * without one). This control cannot: the dialogs that already use it render it both
 * inside a `Field` and beside a plain `<label>`, and those call sites keep their own
 * layout. So the wiring is read through `useContext` and applied when a `Field` is
 * present, and omitted — not complained about — when one is not. The `name` prop is
 * what makes a server-action form receive the value: when it is set, a hidden input
 * carries the chosen `HH:mm` under that name, so `<form action={…}>` posts it exactly
 * as a native `type="time"` input would have.
 */

'use client'

import { useContext, useId, useState } from 'react'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '../popover'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'
import { CONTROL_CLASSES } from '../form/control-classes'
import { FieldContext } from '../form/field-context'

export interface TimePickerProps {
  /** The chosen time, as the column stores it — مثلا "10:45". */
  readonly value: string | null | undefined
  /** Called with an `HH:mm` string when a time is chosen. */
  readonly onChange: (value: string) => void
  readonly disabled?: boolean
  /**
   * When set, a hidden input of this name carries the value, so a native form posts
   * it without a controlled wrapper having to add one.
   */
  readonly name?: string
  /** A label for the trigger button, for the call sites that have no enclosing `Field`. */
  readonly ariaLabel?: string
}

const HOURS = [
  '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
  '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23',
]
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/** The placeholder shown when nothing is chosen yet. */
const CHOOSE_TIME = 'انتخاب ساعت'

export function TimePicker({ value, onChange, disabled, name, ariaLabel }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const field = useContext(FieldContext)
  const labelId = useId()

  // A stored minute that is not on the 5-minute grid (a legacy `09:12`, say) is
  // displayed as it stands — the trigger shows the raw string — but a *selection*
  // always lands on the grid, so the hour column snaps an off-grid minute to `00`
  // rather than emitting a time the grid itself cannot show.
  const selectedHour = value ? value.split(':')[0] ?? '10' : '10'
  const rawMinute = value ? value.split(':')[1] ?? '00' : '00'
  const selectedMinute = MINUTES.includes(rawMinute) ? rawMinute : '00'

  const handleSelect = (h: string, m: string) => {
    onChange(`${h}:${m}`)
    setOpen(false)
  }

  return (
    <>
      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={value ?? ''}
          aria-invalid={field?.invalid ? true : undefined}
          aria-required={field?.required ? true : undefined}
        />
      )}

      <PopoverRoot open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={field?.controlId}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-label={ariaLabel}
            aria-describedby={field?.describedBy}
            aria-labelledby={ariaLabel === undefined ? labelId : undefined}
            className={cx(CONTROL_CLASSES, 'inline-flex items-center justify-between gap-2 text-start')}
          >
            <span id={labelId} className="contents">
              {value ? toPersianDigits(value) : CHOOSE_TIME}
            </span>
            <Icon name="clock" size="control" />
          </button>
        </PopoverTrigger>

        <PopoverPortal>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="z-50 w-64 rounded-lg border border-line bg-surface p-3 shadow-3 flex gap-4 h-64"
          >
            {/* ستون ساعت */}
            <div className="flex-1 overflow-y-auto pr-2 border-r border-line flex flex-col gap-1 scrollbar-thin">
              <span className="text-xs text-ink-3 mb-1 text-center sticky top-0 bg-surface">ساعت</span>
              {HOURS.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleSelect(h, selectedMinute)}
                  className={cx(
                    'py-1.5 rounded-sm text-sm text-center transition-colors',
                    selectedHour === h ? 'bg-brand-50 text-brand-700 font-bold' : 'hover:bg-surface-2 text-ink'
                  )}
                >
                  {toPersianDigits(h)}
                </button>
              ))}
            </div>

            {/* ستون دقیقه */}
            <div className="flex-1 overflow-y-auto pl-2 flex flex-col gap-1 scrollbar-thin">
              <span className="text-xs text-ink-3 mb-1 text-center sticky top-0 bg-surface">دقیقه</span>
              {MINUTES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelect(selectedHour, m)}
                  className={cx(
                    'py-1.5 rounded-sm text-sm text-center transition-colors',
                    selectedMinute === m ? 'bg-brand-50 text-brand-700 font-bold' : 'hover:bg-surface-2 text-ink'
                  )}
                >
                  {toPersianDigits(m)}
                </button>
              ))}
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </>
  )
}
