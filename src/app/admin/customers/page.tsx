/**
 * The manager's customer file — `02-architecture.md` §9's `admin/customers.html`.
 *
 * The manager holds `view_all_customers`, so the file is the clinic's whole file read
 * under the same permission the desk reads it with; the two pages are one table and
 * differ only in the copy block and in the one thing the manager's panel can do that
 * the desk's cannot — open the profile, which §9 puts in this panel.
 *
 * ## Why the audience groups are not here
 *
 * §9's row for this page reads `customers → audience-groups`, and the arrow is the
 * module that composes the file: a group is a saved predicate over it. That module is
 * not built, and a page that rendered a placeholder for it would render a filter that
 * does nothing; the page renders the file, and the group panel arrives with the
 * module that owns it.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'

import { CUSTOMERS_PAGE } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomersTable } from '@/app/_customers/customers-table'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.admin.title }

/** The page's own route, as the search form submits to. */
const BASE_PATH = '/admin/customers'

/** The route the profile lives at, as the table's name cell links to. */
const PROFILE_BASE_PATH = '/admin/customer'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The clinic's customer file, searched by name or mobile, with the profile open.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadCustomersList({ tx, ctx: session.permissions, scope: 'all', query }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.admin.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMERS_PAGE.admin.lead}</p>
      </div>

      <CustomerSearchForm query={query} basePath={BASE_PATH} />

      <CustomersTable
        rows={data.rows}
        doctorNames={data.doctorNames}
        profileBasePath={PROFILE_BASE_PATH}
        emptyMessage={query === '' ? CUSTOMERS_PAGE.empty.noCustomers : CUSTOMERS_PAGE.empty.noResults}
      />
    </div>
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
