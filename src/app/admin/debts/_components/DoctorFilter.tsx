/**
 * The debts toolbar's doctor `<select>` — «همه پزشکان».
 *
 * A client component because a select's change is a navigation, and a navigation from a
 * server component is a link the component cannot write. The select holds no row and no
 * permission; it composes a URL from the chosen doctor and asks the router for it, and
 * the page re-reads on the change — the same buckets it ran, narrowed by one column.
 *
 * ## Why it navigates and does not submit
 *
 * A filter is a URL the way the day is one: a filtered page is a bookmark, a back button
 * and a link the manager can hand a colleague. `router.replace` rather than `push` keeps
 * the history from collecting one entry per doctor the manager tries, the way a day
 * navigation does not collect one entry per day.
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

import { ADMIN_DEBTS } from '@/app/admin/catalog'
import { DEBT_QUERY_PARAM } from './DebtSearchForm'

export interface DoctorFilterProps {
  /** The page's own route, as the select's navigation base. */
  readonly basePath: string
  /** The doctors who hold an open balance, as the select's own options. */
  readonly doctors: readonly { readonly id: string; readonly name: string }[]
  /** The doctor the URL names, or '' for «همه پزشکان». */
  readonly doctor: string
  /** The query the URL carries, kept on the navigation. */
  readonly query: string
  /** The bucket the URL names, kept on the navigation. */
  readonly bucket: string | null
}

export function DoctorFilter({ basePath, doctors, doctor, query, bucket }: DoctorFilterProps) {
  const router = useRouter()

  function navigate(nextDoctor: string): void {
    const sp = new URLSearchParams()
    if (query !== '') sp.set(DEBT_QUERY_PARAM, query)
    if (bucket !== null) sp.set('bucket', bucket)
    if (nextDoctor !== '') sp.set('doctor', nextDoctor)
    const qs = sp.toString()
    router.replace(qs === '' ? basePath : `${basePath}?${qs}`)
  }

  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold text-ink-2 panel:w-56">
      <span className="sr-only">{ADMIN_DEBTS.allDoctors}</span>
      <select
        name="doctor"
        value={doctor}
        onChange={(event) => navigate(event.target.value)}
        className="rounded-sm border border-line-2 bg-surface px-3 py-[11px] text-sm font-normal text-ink"
      >
        <option value="">{ADMIN_DEBTS.allDoctors}</option>
        {doctors.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
