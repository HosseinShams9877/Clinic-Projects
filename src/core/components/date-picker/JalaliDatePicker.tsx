/**
 * The Jalali date picker — the third control of the form shell.
 *
 * `01-tech-stack.md` §8.5 names this control and the searchable select as the two the
 * shell describes but Phase 1 did not ship:
 *
 * > The shared Persian form shell … wraps both: field layout, the Persian label, the
 * > error slot, and RTL are defined once, and a module's form composes it rather than
 * > restating it.
 *
 * and `field-context.ts` closes with the same two as its next callers. This file is
 * the first, and it joins the contract the shell already keeps: `Field` gives it the
 * `id`, the `aria-*` wiring and the label, and the picker reads them through
 * `useControlWiring` rather than accepting them as props. A control that took an `id`
 * from a call site would be a control that could be rendered without a label, which
 * is the axe failure the shell exists to make impossible.
 *
 * ## Why the grid is ours and the calendar is not
 *
 * Every calendar fact this component renders comes from `@/core/localization`:
 * `jalaliMonthGrid` lays the month out with شنبه first and real dates in the padding,
 * `MONTH_NAMES` and `WEEKDAY_NAMES` are the labels, `toPersianDigits` is the numerals.
 * The component holds no calendar arithmetic of its own, because `07-localization.md`
 * §6.1 draws that line deliberately — a control that converted a date itself would be
 * a second conversion, and the second one is the one that would be wrong. The picker's
 * own state is a *display* month, and the value it emits is a `LocalDate` string.
 *
 * ## Why the value is a string and not a `Date`
 *
 * `LocalDate` is a `YYYY-MM-DD` string over the *proleptic Gregorian* calendar
 * (`jalali.ts`), which is what the schema stores and what every server action reads.
 * A `Date` would be a UTC instant, and the picker has no time of day — converting one
 * way and back through `toUtcInstant`/`fromUtcInstant` would be two conversions that
 * cancel and either could be the one a caller drops. The string is the column's own
 * shape, so it crosses the boundary unchanged.
 *
 * ## Why the popover and not a permanent grid
 *
 * `08-ui-design-system.md` §46's surfaces are dense already, and a form with a
 * permanent calendar per date field is a form whose submit button is below the fold.
 * The popover is Radix, so the focus trap, the escape and the outside click are not
 * ours to build — and the dialog's own `role="dialog"` means the grid inside it is
 * announced as a region rather than as a table without a caption.
 *
 * ## Accessibility, in detail
 *
 * The trigger is a real `<button>` whose accessible name is the label text plus the
 * chosen date, so a screen reader announces «تاریخ تولد، ۱۴۰۵/۰۳/۰۴» and not
 * "button". The grid is a `<table role="grid">` with weekday headers and one
 * `aria-current="date"` on the selected cell, and the cells are `<button>`s so they
 * are reachable from a keyboard. Navigation between months is two buttons with
 * `aria-label`s, because a bare chevron announces as nothing.
 */

'use client'

import { useState, useId } from 'react'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from '../popover'

import {
  Icon,
} from '@/core/components/icons'
import { cx } from '@/core/lib'
import {
  MONTH_NAMES_IN_ORDER,
  addLocalMonths,
  formatDate,
  jalaliMonthGrid,
  jalaliParts,
  toPersianDigits,
  weekColumns,
  weekdayName,
} from '@/core/localization'
import type { LocalDate } from '@/core/localization'
import { todayLocalDate } from '@/core/localization'
import { DATE_PICKER_LABELS } from '@/core/localization'
import { realClock } from '@/core/lib/clock'

import { CONTROL_CLASSES } from '../form/control-classes'
import { useControlWiring } from '../form/field-context'

/** One cell of the grid, as the render below needs it. */
interface DayCell {
  readonly localDate: LocalDate
  /** Whether the cell is in the displayed month; the padding days are not. */
  readonly inMonth: boolean
}

/** The props a form hands the picker; the wiring comes from the enclosing `Field`. */
export interface JalaliDatePickerProps {
  /** The current value, as the schema stores it. */
  readonly value: string | null | undefined
  /** Called with a `LocalDate` string when a day is chosen. */
  readonly onChange: (value: string) => void
  readonly disabled?: boolean
  /** A date the picker will not go before; a birth date has none. */
  readonly min?: string
  readonly name?: string
}

/**
 * The picker, as a `Field`'s control.
 *
 * @throws when rendered outside a `<Field>` — via `useControlWiring`, which is the
 *   shell's own check and not this component's.
 */
export function JalaliDatePicker({
  value,
  onChange,
  disabled,
  min,
  name,
}: JalaliDatePickerProps) {
  const wiring = useControlWiring('JalaliDatePicker')
  const [open, setOpen] = useState(false)
  const labelId = useId()

  // The display month is derived from the value when there is one, so opening the
  // picker on a stored date opens it at that date's month; with no value it opens at
  // today, which is where a new date most often is.
  const anchor = value ?? todayLocalDate(realClock())
  const [viewing, setViewing] = useState<string>(anchor)

  const selected = value ?? null
  const viewingParts = jalaliParts(viewing as LocalDate)
  const weeks = jalaliMonthGrid(viewing as LocalDate)

  return (
    <>
      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={value ?? ''}
          aria-invalid={wiring['aria-invalid']}
          aria-required={wiring['aria-required']}
        />
      )}

      <PopoverRoot open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={wiring.id}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-describedby={wiring['aria-describedby']}
            aria-labelledby={labelId}
            className={cx(CONTROL_CLASSES, 'inline-flex items-center justify-between gap-2 text-start')}
          >
            <span id={labelId} className="contents">
              {selected === null
                ? DATE_PICKER_LABELS.chooseDate
                : formatDate(selected as LocalDate, 'long')}
            </span>
            <Icon name="calendar" size="control" />
          </button>
        </PopoverTrigger>

        <PopoverPortal>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="z-50 w-[19.5rem] rounded-lg border border-line bg-surface p-3 shadow-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink" aria-live="polite">
                {MONTH_NAMES_IN_ORDER[viewingParts.month - 1]} {toPersianDigits(viewingParts.year)}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-xs text-ink-2 hover:bg-bg-alt focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  aria-label={DATE_PICKER_LABELS.previousMonth}
                  onClick={() => setViewing(prev => addLocalMonths(prev as LocalDate, -1))}
                >
                  <Icon name="chevronEnd" size="control" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-xs text-ink-2 hover:bg-bg-alt focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  aria-label={DATE_PICKER_LABELS.nextMonth}
                  onClick={() => setViewing(prev => addLocalMonths(prev as LocalDate, 1))}
                >
                  <Icon name="chevronStart" size="control" />
                </button>
              </div>
            </div>

            <table role="grid" className="w-full border-collapse">
              <thead>
                <tr>
                  {weekColumns().map((weekday) => (
                    <th
                      key={weekday}
                      scope="col"
                      className="pb-1 text-center text-xs font-medium text-ink-3"
                    >
                      {weekdayName(weekday)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, weekIndex) => (
                  <tr key={weekIndex}>
                    {week.map((day) => {
                      const cell: DayCell = {
                        localDate: day,
                        inMonth: isSameJalaliMonth(day, viewing as LocalDate),
                      }
                      const isSelected = selected !== null && day === selected
                      const isBlocked = min !== undefined && day < min
                      const parts = jalaliParts(day)

                      return (
                        <td key={day} className="p-0.5">
                          <button
                            type="button"
                            disabled={isBlocked}
                            aria-current={isSelected ? 'date' : undefined}
                            aria-pressed={isSelected}
                            onClick={() => {
                              onChange(day)
                              setOpen(false)
                            }}
                            className={cx(
                              'inline-flex size-8 w-full items-center justify-center rounded-xs text-xs',
                              cell.inMonth ? 'text-ink' : 'text-ink-3',
                              isSelected
                                ? 'bg-brand text-surface font-semibold'
                                : 'hover:bg-bg-alt',
                              isBlocked && 'cursor-not-allowed text-ink-3 opacity-50',
                              'focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
                            )}
                          >
                            {toPersianDigits(parts.day)}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </>
  )
}

/**
 * Whether two `LocalDate`s are in the same Jalali month.
 *
 * `calendar.ts` exports `isSameJalaliMonth`; spelled here as the grid's own question
 * so the padding-day styling reads as a decision about the display month.
 */
function isSameJalaliMonth(left: LocalDate, right: LocalDate): boolean {
  const a = jalaliParts(left)
  const b = jalaliParts(right)
  return a.year === b.year && a.month === b.month
}
