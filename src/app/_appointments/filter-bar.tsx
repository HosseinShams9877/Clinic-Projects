/**
 * The oversight page's filter bar — the two selects that narrow the clinic's day.
 *
 * A client component because a select's change is a navigation, and a navigation from a
 * server component is a link the component cannot write. The bar holds no row and no
 * permission; it composes a URL from the selects and asks the router for it, and the
 * page re-reads on the change — the same query it ran, narrowed by two columns.
 *
 * ## Why the filters navigate and do not submit
 *
 * A filter is a URL the way the day is one, and the two should behave the same way: a
 * filtered oversight page is a bookmark, a back button returns to it, and a shared
 * query links to it. `router.replace` rather than `push` keeps the history from
 * collecting one entry per select change, the way a day navigation does not collect one
 * entry per day.
 *
 * ## Why the day is carried and not offered
 *
 * The day navigation already owns `?day=`, and a date filter beside it would be a
 * second control writing one param — the two would disagree about which the URL holds.
 * The bar carries the day it was given and narrows by doctor and status only.
 *
 * ## Why the values are props and not `useSearchParams`
 *
 * The page already awaited the params on the server, which is one read; reading them
 * again in the client would be a second read of the same URL and would need a Suspense
 * boundary the page has no other use for. The three values arrive as props, and the
 * navigation is the only client fact the component holds.
 */

'use client'

import { useRouter } from 'next/navigation'

import { APPOINTMENT_STATUS_LABELS } from '@/modules/appointments'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import type { DayDoctors } from './page-data'

/** The bar's own props: the page's route, the day's doctors, and the URL's own values. */
export interface FilterBarProps {
  /** The page's own route, as the selects' navigation base. */
  readonly basePath: string
  /** The doctors who work the shown day, as the doctor select's options. */
  readonly doctors: DayDoctors
  /** The doctor the URL names, or '' for none. */
  readonly doctor: string
  /** The status the URL names, or '' for none. */
  readonly status: string
  /** The day the URL names, carried so a narrowed query keeps it. */
  readonly day: string | null
}

/** The two selects, as navigations. */
export function FilterBar({ basePath, doctors, doctor, status, day }: FilterBarProps) {
  const router = useRouter()

  function navigate(next: { readonly doctor?: string; readonly status?: string }): void {
    const query = new URLSearchParams()
    const merged = { doctor, status, ...next }
    if (merged.doctor !== '') query.set('doctor', merged.doctor)
    if (merged.status !== '') query.set('status', merged.status)
    if (day !== null) query.set('day', day)

    const search = query.toString()
    router.replace(search === '' ? basePath : `${basePath}?${search}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
        {APPOINTMENTS_PAGE.admin.filters.doctor}
        <select
          name="doctor"
          value={doctor}
          onChange={(event) => navigate({ doctor: event.target.value })}
          className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-sm font-normal text-ink"
        >
          <option value="">—</option>
          {doctors.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
        {APPOINTMENTS_PAGE.admin.filters.status}
        <select
          name="status"
          value={status}
          onChange={(event) => navigate({ status: event.target.value })}
          className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-sm font-normal text-ink"
        >
          <option value="">—</option>
          {Object.keys(APPOINTMENT_STATUS_LABELS).map((value) => (
            <option key={value} value={value}>
              {APPOINTMENT_STATUS_LABELS[value as keyof typeof APPOINTMENT_STATUS_LABELS]}
            </option>
          ))}
        </select>
      </label>

      {day === null ? null : <input type="hidden" name="day" value={day} readOnly />}
    </div>
  )
}
