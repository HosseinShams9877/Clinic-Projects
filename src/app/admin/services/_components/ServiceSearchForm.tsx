/**
 * The catalogue toolbar's search field — the demo's «نام خدمت…».
 *
 * A plain GET form for the same reason the debts page's is one: a filtered view is a
 * bookmarkable URL, so the field writes `?q=` and the page narrows the rows it already
 * read. The hidden input carries the category the URL names, so a search narrows the
 * view the manager is looking at instead of resetting it. `page` is deliberately not
 * carried, because a new query starts on the first page.
 */

import { Icon } from '@/core/components/icons'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { cx } from '@/core/lib'

import { ADMIN_SERVICES } from '@/app/admin/catalog'

/** The search param the toolbar writes, spelled once for the field and the page. */
export const SERVICE_QUERY_PARAM = 'q'

/** The search param the category chips write, spelled once for the chips and the page. */
export const SERVICE_CATEGORY_PARAM = 'category'

export interface ServiceSearchFormProps {
  /** The route the form submits to, which is the page rendering it. */
  readonly basePath: string
  /** The query the URL already carries, so a refresh keeps the field in step. */
  readonly query: string
  /** The category the URL names, carried so a search narrows and does not reset. */
  readonly category: string
}

export function ServiceSearchForm({ basePath, query, category }: ServiceSearchFormProps) {
  return (
    <form action={basePath} className="flex flex-col gap-2 panel:flex-row panel:items-center">
      <div className="relative w-full panel:w-64">
        <span className="absolute inset-y-0 flex items-center ps-3 text-ink-3" aria-hidden="true">
          <Icon name="search" size="compact" />
        </span>
        <label className="sr-only" htmlFor="admin-services-search">
          {ADMIN_SERVICES.searchLabel}
        </label>
        <input
          id="admin-services-search"
          type="search"
          name={SERVICE_QUERY_PARAM}
          defaultValue={query}
          placeholder={ADMIN_SERVICES.searchPlaceholder}
          className={cx(CONTROL_CLASSES, 'ps-9')}
        />
      </div>
      {category === '' ? null : (
        <input type="hidden" name={SERVICE_CATEGORY_PARAM} value={category} readOnly />
      )}
    </form>
  )
}
