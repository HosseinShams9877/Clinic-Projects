/**
 * The customer file's search field — the one filter all three surfaces share.
 *
 * The three customer pages are the same file read through three permissions, and the
 * question a desk, a manager and a doctor ask of it is the same one — «نام یا شماره
 * موبایل» — so the field is one component and the three pages hand it their own
 * copy block. The field's own name is `q`, which is the param the three pages read
 * back, and a value the module's own `normalizeForSearch` and `normalizeMobile` fold
 * at the query rather than here.
 *
 * ## Why this is a plain form and not a controlled input
 *
 * The search belongs to the URL: a param in the address is a bookmark, a back button
 * and a link the desk can hand a colleague. Holding it in state would mean the URL
 * and the field disagreeing after a refresh, and the page's own read is already the
 * param's. The form has no `action`, so it submits to the route it is rendered on,
 * which is the one place the param is read.
 */

import { CUSTOMERS_PAGE } from '@/app/catalog'
import { Icon } from '@/core/components/icons'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { cx } from '@/core/lib'

/** The search param the three customer pages read, spelled once. */
export const CUSTOMER_QUERY_PARAM = 'q'

/** The field, with the query the URL already carries so a refresh keeps it. */
export function CustomerSearchForm({
  query,
  basePath,
}: {
  readonly query: string
  /** The route the form submits to, which is the page rendering it. */
  readonly basePath: string
}) {
  return (
    <form action={basePath} className="flex flex-col gap-2 panel:flex-row panel:items-center">
      <div className="relative flex-1">
        <span className="absolute inset-y-0 flex items-center ps-3 text-ink-3" aria-hidden="true">
          <Icon name="search" size="compact" />
        </span>
        <label className="sr-only" htmlFor="customer-search">
          {CUSTOMERS_PAGE.search.label}
        </label>
        <input
          id="customer-search"
          type="search"
          name={CUSTOMER_QUERY_PARAM}
          defaultValue={query}
          placeholder={CUSTOMERS_PAGE.search.placeholder}
          className={cx(CONTROL_CLASSES, 'ps-9')}
        />
      </div>
      {query === '' ? null : (
        <a
          href={basePath}
          className="inline-flex items-center justify-center gap-1 rounded-sm border border-line-2 bg-surface px-4 py-2 text-sm font-semibold text-ink-2 no-underline hover:bg-surface-2"
        >
          <Icon name="close" size="compact" />
          {CUSTOMERS_PAGE.search.clear}
        </a>
      )}
    </form>
  )
}
