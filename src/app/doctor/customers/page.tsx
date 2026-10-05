/**
 * The doctor's own patients — `02-architecture.md` §9's `doctor/customers.html`.
 *
 * The doctor holds `view_own_customer_records` and not `view_all_customers`
 * (`04-roles-permissions.md` §2.1's three), so the file this page reads is scoped by
 * the `primaryDoctorId` column `customer_tenant_doctor_idx` exists to serve. The
 * scope is a `where` clause inside the module's query and not a second query, which
 * is the boundary §3.4 draws and the one that makes another doctor's patient a 404
 * rather than a 403 (`09-security.md` §6.3).
 *
 * ## Why the page renders no actions
 *
 * A patient the doctor has seen but who has no recorded primary doctor is not in this
 * list, which is the honest reading of «مراجعین من»: the doctor's own patients, not
 * the clinic's. The page is therefore a file the doctor reads, and its rows carry no
 * edit, no consent and no booking affordance — the profile those live on is the
 * manager panel's, and the doctor's panel is not the door to it.
 *
 * ## Why the search is the page's
 *
 * The doctor's own question of the same file is narrower, but the shape is the same
 * one the desk and the manager ask — a name or a mobile — so the field is the shared
 * one and the scope is the difference. The param is the same `q`, so a bookmark from
 * one page opens another at the same query.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'

import { CUSTOMERS_PAGE } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomersTable } from '@/app/_customers/customers-table'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.doctor.title }

/** The page's own route, as the search form submits to. */
const BASE_PATH = '/doctor/customers'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * The doctor's patients, searched by name or mobile.
 */
export default async function DoctorCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('doctor')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadCustomersList({ tx, ctx: session.permissions, scope: 'own', query }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.doctor.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMERS_PAGE.doctor.lead}</p>
      </div>

      <CustomerSearchForm query={query} basePath={BASE_PATH} />

      <CustomersTable
        rows={data.rows}
        doctorNames={data.doctorNames}
        emptyMessage={query === '' ? CUSTOMERS_PAGE.empty.noPatients : CUSTOMERS_PAGE.empty.noResults}
      />
    </div>
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
