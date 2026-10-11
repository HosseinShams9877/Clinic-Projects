/**
 * The debts toolbar's search field — «نام یا شماره…».
 *
 * A plain GET form for the same reason the customer file's is one: the filter belongs to
 * the URL, so a filtered page is a bookmark and a back button. The field's own name is
 * `q`, and the page filters the buckets it already read rather than asking the module
 * for a second query — the debt file is the four buckets, and narrowing them in the app
 * tier is one fewer arm in a query the tiles already need whole.
 *
 * The two hidden inputs carry the doctor and the bucket the URL already names, so a
 * search narrows the view the manager is looking at instead of resetting it. `page` is
 * deliberately not carried: a new query starts on the first page.
 */

import { Icon } from '@/core/components/icons'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { cx } from '@/core/lib'

import { ADMIN_DEBTS } from '@/app/admin/catalog'

/** The search param the toolbar writes, spelled once for the field and the page. */
export const DEBT_QUERY_PARAM = 'q'

export interface DebtSearchFormProps {
  /** The route the form submits to, which is the page rendering it. */
  readonly basePath: string
  /** The query the URL already carries, so a refresh keeps the field in step. */
  readonly query: string
  /** The doctor the URL names, carried so a search narrows and does not reset. */
  readonly doctorId: string
  /** The bucket the URL names, or `null` when it names none. */
  readonly bucket: string | null
}

export function DebtSearchForm({ basePath, query, doctorId, bucket }: DebtSearchFormProps) {
  return (
    <form action={basePath} className="flex flex-col gap-2 panel:flex-row panel:items-center">
      <div className="relative w-full panel:w-64">
        <span className="absolute inset-y-0 flex items-center ps-3 text-ink-3" aria-hidden="true">
          <Icon name="search" size="compact" />
        </span>
        <label className="sr-only" htmlFor="admin-debts-search">
          {ADMIN_DEBTS.searchLabel}
        </label>
        <input
          id="admin-debts-search"
          type="search"
          name={DEBT_QUERY_PARAM}
          defaultValue={query}
          placeholder={ADMIN_DEBTS.searchPlaceholder}
          className={cx(CONTROL_CLASSES, 'ps-9')}
        />
      </div>
      {doctorId === '' ? null : <input type="hidden" name="doctor" value={doctorId} readOnly />}
      {bucket === null ? null : <input type="hidden" name="bucket" value={bucket} readOnly />}
    </form>
  )
}
