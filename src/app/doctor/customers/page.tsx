// src/app/doctor/customers/page.tsx

/**
 * The doctor's own patients — `02-architecture.md` §9's `doctor/customers.html`.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'

import { CUSTOMERS_PAGE } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomersTable } from '@/app/_customers/customers-table'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.doctor.title }

const BASE_PATH = '/doctor/customers'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function DoctorCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('doctor')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])
  const page = pageFromParam(params.page)

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadCustomersList({ tx, ctx: session.permissions, scope: 'own', query }),
  )

  const { slice, totalPages } = paginate(data.rows, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (query !== '') sp.set(CUSTOMER_QUERY_PARAM, query)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.doctor.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMERS_PAGE.doctor.lead}</p>
      </div>

      <CustomerSearchForm query={query} basePath={BASE_PATH} />

      <CustomersTable
        rows={slice}
        doctorNames={data.doctorNames}
        emptyMessage={query === '' ? CUSTOMERS_PAGE.empty.noPatients : CUSTOMERS_PAGE.empty.noResults}
        panel="doctor"
        profileBasePath="/doctor/customers"
      />

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}