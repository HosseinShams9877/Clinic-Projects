/**
 * The follow-up date field in the debts filter bar.
 *
 * The field is the shell's own `JalaliDatePicker` — the same control the day
 * picker and the injection form use — wrapped in a `Field` so it inherits the
 * shell's label and wiring. It lives in its own file and not inline in the
 * page because the page is a Server Component and the picker is a Client
 * Component, and a Client Component boundary has to be a file the server can
 * import by name.
 *
 * ## Why the heights are pinned
 *
 * The filter bar's other controls — the search `<input>` and the doctor
 * `<select>` — are the shell's `CONTROL_CLASSES` at a fixed padding, so they
 * stand at one height. The picker's trigger is a `<button>` carrying the same
 * class, and its own icon and gap make it a few pixels taller than the two
 * beside it. The `[&_button]:h-[38px]` and the `[&_button]:py-0` are what
 * put all three on one line: the picker's trigger takes the height the input
 * and the select already stand at, and the field is the same block as they
 * are.
 */

'use client'

import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { DEBTS_PAGE } from '@/app/catalog'

export function DebtsFollowUpDateField({
  defaultValue,
}: {
  /** The date the URL carries, or `null` when it carries none. */
  readonly defaultValue: string | null
}) {
  return (
    <div className="flex min-w-48 flex-col gap-1 [&_button]:h-[38px] [&_button]:py-0 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-ink-3">
      <Field label={DEBTS_PAGE.filter.followUpDate}>
        <JalaliDatePicker
          name="due"
          value={defaultValue}
          onChange={() => {
            // The picker's own hidden `name="due"` input carries the value to
            // the form; nothing here needs to hold it, and the page reads the
            // param back from the URL.
          }}
        />
      </Field>
    </div>
  )
}