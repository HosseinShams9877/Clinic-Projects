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
 *
 * ## Why the clear button is inline inside the field
 *
 * The «پاک کردن» control used to sit beside the field as a second bordered box, and
 * in the manager's narrow toolbar it read as a second search box. It is now the
 * field's own affordance — the small × at the end of the input, the way every search
 * field in the product offers it — so the toolbar holds one control and not two, and
 * a search that has not been typed carries no clear button at all.
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
    <form action={basePath} className="w-full">
      <label className="sr-only" htmlFor="customer-search">
        {CUSTOMERS_PAGE.search.label}
      </label>
      <div className="relative w-full">
        <span
          className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-3"
          aria-hidden="true"
        >
          <Icon name="search" size="compact" />
        </span>
        <input
          id="customer-search"
          type="search"
          name={CUSTOMER_QUERY_PARAM}
          defaultValue={query}
          placeholder={CUSTOMERS_PAGE.search.placeholder}
          className={cx(CONTROL_CLASSES, 'ps-9', query === '' ? 'pe-3' : 'pe-10')}
        />
        {query === '' ? null : (
          <a
            href={basePath}
            aria-label={CUSTOMERS_PAGE.search.clear}
            title={CUSTOMERS_PAGE.search.clear}
            className="absolute inset-y-0 end-0 flex items-center pe-3 text-ink-3 no-underline hover:text-danger"
          >
            <Icon name="close" size="compact" />
          </a>
        )}
      </div>
    </form>
  )
}