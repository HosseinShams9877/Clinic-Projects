/**
 * The desk's customer file — `02-architecture.md` §9's `reception/customers.html`.
 *
 * The secretary's default holds `view_all_customers` (`04-roles-permissions.md` §2.1's
 * 1–12), so the file the desk reads is the clinic's whole file under the same
 * permission the manager reads it with. The two pages are one table and differ only
 * in the copy block they render it with, which is what makes the two agree about
 * which columns a customer's file holds.
 *
 * ## What the desk cannot do from here
 *
 * Open the profile. §9 puts `customer.html` in the manager panel, and the reception
 * shell sends a secretary elsewhere; the desk's own action on a row is «ثبت نوبت»,
 * which is the appointment surface the desk books from. The profile's edit and
 * consent surfaces are the manager's, and the table renders a name rather than a link
 * it cannot follow.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'

import { CUSTOMERS_PAGE } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomersTable } from '@/app/_customers/customers-table'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.reception.title }

/** The page's own route, as the search form submits to. */
const BASE_PATH = '/reception/customers'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The clinic's customer file, searched by name or mobile.
 */
export default async function ReceptionCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadCustomersList({ tx, ctx: session.permissions, scope: 'all', query }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.reception.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMERS_PAGE.reception.lead}</p>
      </div>

      <CustomerSearchForm query={query} basePath={BASE_PATH} />

      <CustomersTable
        rows={data.rows}
        doctorNames={data.doctorNames}
        showBookAction
        emptyMessage={query === '' ? CUSTOMERS_PAGE.empty.noCustomers : CUSTOMERS_PAGE.empty.noResults}
      />
    </div>
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
