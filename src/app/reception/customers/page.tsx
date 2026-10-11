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
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import { CustomerLifecycle } from '@/core/constants'

import { CUSTOMERS_PAGE, RECEPTION_CUSTOMERS } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomersTable } from '@/app/_customers/customers-table'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { AddCustomerDialog } from './_components/AddCustomerDialog'
import { ExportButton } from './_components/ExportButton'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.reception.title }

/** The page's own route, as the search form submits to and the chips link to. */
const BASE_PATH = '/reception/customers'

/** The lifecycle chip the URL names, as the filter param writes it. */
const FILTER_PARAM = 'filter'

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/** The lifecycle filter the URL names, or «all» for every customer. */
function filterFromParam(value: string | string[] | undefined): 'all' | 'CUSTOMER' | 'LEAD' {
  if (value === CustomerLifecycle.Customer || value === CustomerLifecycle.Lead) return value
  return 'all'
}

/**
 * The clinic's customer file, searched by name or mobile and filtered by lifecycle.
 */
export default async function ReceptionCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])
  const filter = filterFromParam(params[FILTER_PARAM])

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadCustomersList({ tx, ctx: session.permissions, scope: 'all', query }),
  )

  const rows = filter === 'all' ? data.rows : data.rows.filter((row) => row.lifecycle === filter)
  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(rows, page)

  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (query !== '') sp.set(CUSTOMER_QUERY_PARAM, query)
    if (filter !== 'all') sp.set(FILTER_PARAM, filter)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.reception.title}</h1>
          <p className="text-sm text-ink-2">{CUSTOMERS_PAGE.reception.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton rows={rows} doctorNames={data.doctorNames} dateStamp={realClock().toISOString().slice(0, 10)} />
          <AddCustomerDialog />
        </div>
      </div>

      <CustomerSearchForm query={query} basePath={BASE_PATH} />

      <LifecycleChips active={filter} basePath={BASE_PATH} />

      <CustomersTable
        rows={slice}
        doctorNames={data.doctorNames}
        profileBasePath={BASE_PATH}
        showBookAction
        emptyMessage={query === '' ? CUSTOMERS_PAGE.empty.noCustomers : CUSTOMERS_PAGE.empty.noResults}
      />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

/** The lifecycle chip filter — همه / مشتری / لید, as `?filter=` links. */
function LifecycleChips({
  active,
  basePath,
}: {
  readonly active: 'all' | 'CUSTOMER' | 'LEAD'
  readonly basePath: string
}) {
  const chips: readonly { key: 'all' | 'CUSTOMER' | 'LEAD'; label: string }[] = [
    { key: 'all', label: RECEPTION_CUSTOMERS.filter.all },
    { key: CustomerLifecycle.Customer, label: RECEPTION_CUSTOMERS.filter.customer },
    { key: CustomerLifecycle.Lead, label: RECEPTION_CUSTOMERS.filter.lead },
  ]
  return (
    <nav className="flex flex-wrap gap-2" aria-label={CUSTOMERS_PAGE.reception.title}>
      {chips.map((chip) => {
        const isActive = chip.key === active
        return (
          <Link
            key={chip.key}
            href={chip.key === 'all' ? basePath : `${basePath}?${FILTER_PARAM}=${chip.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
              isActive
                ? 'border-transparent bg-brand-50 text-brand-700'
                : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {chip.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** One search param as a plain string, or '' when the URL does not carry one. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}
