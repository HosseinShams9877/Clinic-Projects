/**
 * The services catalogue — `02-architecture.md` §9's `admin/services.html`.
 *
 * The manager panel's own catalogue page: every service the clinic offers, active and
 * inactive both, with its price, its duration and the doctors it is bookable by. The
 * page is the catalogue's own editor, which is why an inactive service is still on it
 * — the booking picker, not the catalogue, is the surface that excludes one.
 *
 * ## What the demo holds that this page does not
 *
 * Two columns. «بازه قیمت (تومان)» names a range the schema does not keep —
 * `price` is one amount and no `priceTo` column exists — so the column reads «مبلغ»
 * and the cell renders the one price the row holds. «رزرو آنلاین» names a fact no
 * column holds: whether a service reaches the public booking surface is `isActive`
 * and nothing more, and a badge that claimed «قابل رزرو آنلاین» for every active
 * service would be a claim about a surface this page does not read. The demo's fifth
 * category chip («مشاوره») names a category the `ServiceCategory` set does not spell,
 * so the bar holds the four the set does.
 *
 * ## Why the page holds inactive rows (DoD 3, DoD 4)
 *
 * Deactivation is the catalogue's only removal, and the row it leaves is the row the
 * manager reactivates. A clinic that re-offers a seasonal service should not have to
 * re-enter its copy and its price, and every past appointment keeps the snapshot it
 * already holds, because those columns were never a join.
 *
 * ## Why the doctors are one read for the whole catalogue
 *
 * The column is a `service_doctors` row per service, and the page reads them all at
 * once in `loadServicesCatalogue` so a catalogue of N services is not N+1 trips. The
 * join is the app tier's because it composes `services`'s rows with `staff`'s people
 * (`02-architecture.md` §10 rule 2), and the ids the checkboxes write are the same ids
 * the column stores.
 *
 * ## Why the page renders no delete (DoD 3)
 *
 * There is no delete. The module has no `deleteService`, the actions file has no
 * `deleteServiceAction`, and this page has no button and no sentence for one — the
 * invariant is the absence, and a page that offered the path would be the surface the
 * module refuses to have.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { ServiceCategory, isMember } from '@/core/constants'
import { formatMoney, formatNumber, toPersianDigits } from '@/core/localization'
import { cx } from '@/core/lib'

import { SERVICES_PAGE } from '@/app/catalog'
import { ADMIN_SERVICES } from '@/app/admin/catalog'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { loadServicesCatalogue } from '@/app/_services/page-data'
import { NewServiceDialog, ServiceRowActions } from '@/app/_services/service-forms'
import { requireStaffPanel } from '@/app/_shell/session'
import { SERVICE_CATEGORY_LABELS, SERVICE_STATUS_LABELS } from '@/modules/services'

import { CategoryChips, type CategoryChip } from './_components/CategoryChips'
import {
  SERVICE_CATEGORY_PARAM,
  SERVICE_QUERY_PARAM,
  ServiceSearchForm,
} from './_components/ServiceSearchForm'

export const metadata: Metadata = { title: SERVICES_PAGE.title }

/** The page's own route, as the search form and the category chips link to. */
const BASE_PATH = '/admin/services'

/** One search param as a string, or '' when the URL does not name it. */
function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * «خدمات» — the catalogue, the category bar, and the one create the header holds.
 */
export default async function ServicesPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const query = asString(params[SERVICE_QUERY_PARAM])
  const category = asString(params[SERVICE_CATEGORY_PARAM])
  const page = pageFromParam(params.page)

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadServicesCatalogue({ tx, ctx: session.permissions }),
  )

  // The bar's four chips are the set's own, and the count each carries is the count of
  // services the category holds — read from the rows the page already has, so a chip's
  // count and the table beneath it are one number.
  const chips: readonly CategoryChip[] = (
    Object.keys(SERVICE_CATEGORY_LABELS) as readonly (keyof typeof SERVICE_CATEGORY_LABELS)[]
  ).map((value) => ({
    value,
    label: SERVICE_CATEGORY_LABELS[value],
    count: data.rows.filter((row) => row.category === value).length,
  }))

  const needle = query.trim().toLowerCase()
  const visible = data.rows.filter(
    (row) =>
      (category === '' || row.category === category) &&
      (needle === '' || row.name.toLowerCase().includes(needle)),
  )
  const { slice, totalPages } = paginate(visible, page)

  /** The href for a category, which keeps the query the search field holds. */
  const categoryHrefFor = (next: string | null): string => {
    const sp = new URLSearchParams()
    if (next !== null) sp.set(SERVICE_CATEGORY_PARAM, next)
    if (query !== '') sp.set(SERVICE_QUERY_PARAM, query)
    return sp.toString() === '' ? BASE_PATH : `${BASE_PATH}?${sp.toString()}`
  }

  /** The href for a page, which keeps the category and the query the URL names. */
  const pageHrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (category !== '') sp.set(SERVICE_CATEGORY_PARAM, category)
    if (query !== '') sp.set(SERVICE_QUERY_PARAM, query)
    if (next > 1) sp.set('page', String(next))
    return sp.toString() === '' ? BASE_PATH : `${BASE_PATH}?${sp.toString()}`
  }

  const activeCount = data.rows.filter((row) => row.isActive).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{SERVICES_PAGE.title}</h1>
          <p className="text-sm text-ink-2">
            {`${toPersianDigits(data.rows.length)} ${ADMIN_SERVICES.subDefined} · ${toPersianDigits(
              activeCount,
            )} ${ADMIN_SERVICES.subActive}`}
          </p>
        </div>
        <NewServiceDialog />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 panel:flex-row panel:items-center panel:justify-between">
        <ServiceSearchForm
          basePath={BASE_PATH}
          query={query}
          category={category}
        />
        <CategoryChips chips={chips} active={category === '' ? null : category} hrefFor={categoryHrefFor} />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {SERVICES_PAGE.empty}
        </p>
      ) : (
        <section className="flex flex-col rounded-lg border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{SERVICES_PAGE.title}</caption>
              <thead>
                <tr className="border-b border-line bg-surface-2 text-ink-3">
                  <Th>{SERVICES_PAGE.columns.name}</Th>
                  <Th>{SERVICES_PAGE.columns.category}</Th>
                <Th align="end">{SERVICES_PAGE.columns.price}</Th>
<Th align="end">{SERVICES_PAGE.columns.duration}</Th>
<Th align="end">{SERVICES_PAGE.columns.deposit}</Th>
                  <Th>{SERVICES_PAGE.columns.doctors}</Th>
                  <Th>{SERVICES_PAGE.columns.status}</Th>
                  <Th>{SERVICES_PAGE.columns.actions}</Th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-ink-2">{categoryLabel(row.category)}</td>
                    <td className="px-4 py-3 text-end font-semibold text-ink tabular-nums">
                      {formatMoney(row.price)}
                    </td>
                    <td className="px-4 py-3 text-end text-ink-2 tabular-nums">
                      {`${formatNumber(row.durationMinutes)}${ADMIN_SERVICES.durationSuffix}`}
                    </td>
                    <td className="px-4 py-3 text-end text-ink-2 tabular-nums">
                      {row.depositAmount === 0n ? '—' : formatMoney(row.depositAmount)}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {row.doctorNames.length === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <DoctorNames names={row.doctorNames} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={row.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <ServiceRowActions service={row} doctorOptions={data.doctorOptions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 panel:flex-row panel:items-center panel:justify-between">
            <p className="text-xs text-ink-3 tabular-nums">
              {`${ADMIN_SERVICES.showingPrefix}${toPersianDigits(
                slice.length,
              )}${ADMIN_SERVICES.showingSuffix}`}
            </p>
            <Pagination page={page} totalPages={totalPages} hrefFor={pageHrefFor} />
          </div>
        </section>
      )}
    </div>
  )
}

/* ── The page's own small pieces ───────────────────────────────────────────── */

/** The service's two states, as the badge the status column renders. */
function StatusBadge({ active }: { readonly active: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        active ? 'bg-ok-bg text-ok' : 'bg-neutral-bg text-ink-3',
      )}
    >
      {active ? SERVICE_STATUS_LABELS.ACTIVE : SERVICE_STATUS_LABELS.INACTIVE}
    </span>
  )
}

/** One service's doctors, as the column renders them without a second read. */
function DoctorNames({ names }: { readonly names: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  )
}

/** One category, or the code when the row holds one the constants do not. */
function categoryLabel(category: string): string {
  return isMember(ServiceCategory, category) ? SERVICE_CATEGORY_LABELS[category] : category
}

/** One column header, aligned the same way as the cells beneath it. */
function Th({
  children,
  align = 'start',
}: {
  readonly children: React.ReactNode
  readonly align?: 'start' | 'center' | 'end'
}) {
  return (
    <th
      scope="col"
      className={cx(
        'whitespace-nowrap px-4 py-3 text-xs font-semibold',
        align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start',
      )}
    >
      {children}
    </th>
  )
}
