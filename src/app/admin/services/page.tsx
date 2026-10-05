/**
 * The services catalogue — `02-architecture.md` §9's `admin/services.html`.
 *
 * The manager panel's own catalogue page: every service the clinic offers, active and
 * inactive both, with its price, its duration and the doctors it is bookable by. The
 * page is the catalogue's own editor, which is why an inactive service is still on it
 * — the booking picker, not the catalogue, is the surface that excludes one.
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
import { formatMoney, formatNumber } from '@/core/localization'
import { cx } from '@/core/lib'

import { SERVICES_PAGE } from '@/app/catalog'
import { loadServicesCatalogue } from '@/app/_services/page-data'
import {
  NewServiceDialog,
  ServiceRowActions,
} from '@/app/_services/service-forms'
import { requireStaffPanel } from '@/app/_shell/session'
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_STATUS_LABELS,
} from '@/modules/services'

export const metadata: Metadata = { title: SERVICES_PAGE.title }

/**
 * The catalogue, inactive services last, with each service's doctors.
 */
export default async function ServicesPage() {
  const session = await requireStaffPanel('admin')

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadServicesCatalogue({ tx, ctx: session.permissions }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 panel:flex-row panel:items-end panel:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-ink">{SERVICES_PAGE.title}</h1>
          <p className="text-sm text-ink-2">{SERVICES_PAGE.lead}</p>
        </div>
        <NewServiceDialog />
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {SERVICES_PAGE.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{SERVICES_PAGE.title}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3">
                <Th>{SERVICES_PAGE.columns.name}</Th>
                <Th>{SERVICES_PAGE.columns.category}</Th>
                <Th className="text-end">{SERVICES_PAGE.columns.price}</Th>
                <Th className="text-end">{SERVICES_PAGE.columns.deposit}</Th>
                <Th className="text-end">{SERVICES_PAGE.columns.duration}</Th>
                <Th>{SERVICES_PAGE.columns.doctors}</Th>
                <Th>{SERVICES_PAGE.columns.status}</Th>
                <Th>{SERVICES_PAGE.columns.actions}</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-ink-2">{categoryLabel(row.category)}</td>
                  <td className="px-4 py-3 text-end font-semibold text-ink tabular-nums">
                    {formatMoney(row.price)}
                  </td>
                  <td className="px-4 py-3 text-end text-ink-2 tabular-nums">
                    {row.depositAmount === 0n ? '—' : formatMoney(row.depositAmount)}
                  </td>
                  <td className="px-4 py-3 text-end text-ink-2 tabular-nums">
                    {formatNumber(row.durationMinutes)}
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
  return isMember(ServiceCategory, category)
    ? SERVICE_CATEGORY_LABELS[category]
    : category
}

/** One column header, with the alignment the design system's tables keep. */
function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}
