/**
 * The day's yellow alert bar — shown while a result is still outstanding.
 *
 * `03-data-model.md` §2.2's `RESULT_NOT_RECORDED` is the one state that blocks a day
 * from closing: until the outcome is recorded, the record is not complete and the next
 * session's due-date is not built. The bar is the desk's standing reminder of that, so
 * it renders only when the cartable actually holds such a row — an alarm with nothing
 * behind it would be a bar the desk learns to ignore.
 */

import { Icon } from '@/core/components/icons'

import { APPOINTMENTS_PAGE } from '@/app/catalog'

export interface DayAlertProps {
  /** Whether the day holds an unrecorded result; the bar renders only when it does. */
  readonly show: boolean
}

export function DayAlert({ show }: DayAlertProps) {
  if (!show) return null
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn [border:1px_solid_var(--warn)]"
    >
      <Icon name="alert" size="card" />
      <span className="font-semibold">{APPOINTMENTS_PAGE.alertUnrecorded}</span>
    </div>
  )
}
