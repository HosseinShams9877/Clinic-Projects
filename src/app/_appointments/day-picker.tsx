/**
 * The day navigation's Jalali date picker — the header control that jumps the grid to
 * any day, beside the prev/today/next links.
 *
 * `DayNav` covers the three adjacent days as links (a shared desk shift and the back
 * button speak URLs); this is the "any day" control the demo shows. It is the shell's
 * own `JalaliDatePicker`, wrapped in a `Field` because that control reads its label and
 * aria wiring from the field context, and a change pushes the chosen `LocalDate` onto
 * the same `?day=` param the links use — so the picker and the links drive one state.
 */

'use client'

import { useRouter } from 'next/navigation'

import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import type { LocalDate } from '@/core/localization'

import { APPOINTMENTS_PAGE } from '@/app/catalog'

export interface DayPickerProps {
  readonly localDate: LocalDate
  readonly basePath: string
}

export function DayPicker({ localDate, basePath }: DayPickerProps) {
  const router = useRouter()
  return (
    <div className="[&_label]:sr-only [&_button]:inline-size-auto! [&_button]:w-auto [&_button]:gap-2 [&_button]:px-3! [&_button]:py-[6px]! [&_button]:text-xs! [&_button]:text-ink-2 [&_button]:rounded-xs!">
      <Field label={APPOINTMENTS_PAGE.admin.filters.date}>
        <JalaliDatePicker
          value={localDate}
          onChange={(value) => router.push(`${basePath}?view=day&day=${value}`)}
        />
      </Field>
    </div>
  )
}
