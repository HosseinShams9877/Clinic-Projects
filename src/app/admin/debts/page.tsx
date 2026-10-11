/**
 * The manager's debt oversight — `02-architecture.md` §9's `admin/debts.html`.
 *
 * The manager's default holds `view_debts` and not `follow_up_debt`
 * (`04-roles-permissions.md` §2.1), so the page is the read and nothing else: the same
 * four buckets the desk's list is, with no row action, because the write that settles a
 * debt belongs to the desk's page and the desk's permission.
 *
 * ## What the manager's file adds over the desk's
 *
 * Three things the desk's page does not render, all of them reads of the same rows:
 *
 * 1. **The four tiles** — the total outstanding, the past-due sum, the mean delay, and
 *    what the clinic collected this month. The first two carry a sub-count, because a
 *    manager reads a number and then asks «چند نفر؟».
 * 2. **One card per doctor** — the same file grouped by the doctor who did the work, so
 *    the manager asks the person who owns the relationship. The card's hint counts the
 *    rows more than a week late, which the one a doctor can still rescue with a call.
 * 3. **The doctor filter and the two name columns** — «بابت» and «پزشک». `DebtRow`
 *    carries `serviceId` and `doctorId` and not their names, because a module that joins
 *    for a name is a module that chose a display; the app tier looks the two up here,
 *    through the services barrel and the shared `loadDoctorNames`.
 *
 * ## What this page deliberately does not render
 *
 * The demo's «۲ تماس» follow-up cell. `DebtRow` carries `debtFollowUpAt` — whether the
 * desk called, and when — and not a count of calls, because the debt is a computed view
 * over an appointment and a follow-up is one column on it, not a table of its own. The
 * cell renders the fact the row holds: the date of the last follow-up, or «بدون پیگیری»
 * when the desk has not called. A count would be a number the ledger does not keep.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { formatNumber, fromUtcInstant } from '@/core/localization'
import { Icon } from '@/core/components/icons'

import { ADMIN_DEBTS } from '@/app/admin/catalog'
import { DEBTS_PAGE } from '@/app/catalog'
import { loadDoctorNames } from '@/app/_customers/page-data'
import { clinicDebts, readDebtSettings } from '@/modules/debts'
import { listServices } from '@/modules/services'
import { paymentsThisMonth } from '@/modules/payments'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { BucketChips } from './_components/BucketChips'
import { DebtRowView, Th } from './_components/DebtRowView'
import { DebtSearchForm, DEBT_QUERY_PARAM } from './_components/DebtSearchForm'
import { DebtsKpi } from './_components/DebtsKpi'
import { DoctorCards } from './_components/DoctorCards'
import { DoctorFilter } from './_components/DoctorFilter'
import {
  asString,
  averageDelay,
  bucketCounts,
  allDebtRows,
  bucketFromParam,
  doctorOptions,
  matchesQuery,
  pastDue,
} from './_components/helpers'
import { ExportButton } from './_components/ExportButton'

export const metadata: Metadata = { title: DEBTS_PAGE.admin.title }

/** The page's own route, as the chips and the search submit to. */
const BASE_PATH = '/admin/debts'

/** The search params the doctor filter and the bucket chips write. */
const DOCTOR_PARAM = 'doctor'
const BUCKET_PARAM = 'bucket'
const QUERY_PARAM = DEBT_QUERY_PARAM

/** The search params every page in the product reads, as the framework hands them. */
type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

/**
 * «مانده‌حساب» — the clinic's open balances, as the manager reads them.
 */
export default async function AdminDebtsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const query = asString(params[QUERY_PARAM])
  const doctorId = asString(params[DOCTOR_PARAM])
  const bucket = bucketFromParam(params[BUCKET_PARAM])
  const now = realClock()

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const settings = await readDebtSettings(tx, session.tenantId)
    const [buckets, collectedRial, services] = await Promise.all([
      clinicDebts({ tx, ctx: session.permissions, now }),
      paymentsThisMonth(tx, session.tenantId, now, settings.utcOffsetMinutes),
      listServices({ tx, ctx: session.permissions }),
    ])
    const rows = allDebtRows(buckets)
    return {
      buckets,
      collectedRial,
      serviceNames: Object.fromEntries(services.map((service) => [service.id, service.name])),
      doctorNames: await loadDoctorNames(
        tx,
        session.tenantId,
        rows.map((row) => row.doctorId),
      ),
      offset: settings.utcOffsetMinutes,
    } as const
  })

  const today = fromUtcInstant(now, data.offset).localDate
  const allRows = allDebtRows(data.buckets)
  const visible = allRows.filter(
    (row) =>
      (doctorId === '' || row.doctorId === doctorId) &&
      (bucket === null || row.bucket === bucket) &&
      matchesQuery(row, query),
  )
  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(visible, page)
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (query !== '') sp.set(QUERY_PARAM, query)
    if (doctorId !== '') sp.set(DOCTOR_PARAM, doctorId)
    if (bucket !== null) sp.set(BUCKET_PARAM, bucket)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{DEBTS_PAGE.admin.title}</h1>
          <p className="text-sm text-ink-2">{DEBTS_PAGE.admin.lead}</p>
        </div>
        <ExportButton
          rows={visible}
          serviceNames={data.serviceNames}
          doctorNames={data.doctorNames}
          today={today}
          dateStamp={now.toISOString().slice(0, 10)}
        />
      </div>

      <div
        role="status"
        className="flex items-start gap-3 rounded-md bg-info-bg px-4 py-3 text-sm text-info [border:1px_solid_var(--info)]"
      >
        <Icon name="info" size="card" />
        <span>{ADMIN_DEBTS.alert}</span>
      </div>

      <DebtsKpi
        totalRial={allRows.reduce((total, row) => total + row.balance, 0n)}
        totalDebtors={new Set(allRows.map((row) => row.customerId)).size}
        overdueRial={pastDue(allRows).reduce((total, row) => total + row.balance, 0n)}
        overdueCount={pastDue(allRows).length}
        avgDelayDays={averageDelay(allRows, today)}
        collectedRial={data.collectedRial}
      />

      <DoctorCards rows={allRows} doctorNames={data.doctorNames} />

      <section className="flex flex-col rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 panel:flex-row panel:items-center">
          <DebtSearchForm
            basePath={BASE_PATH}
            query={query}
            doctorId={doctorId}
            bucket={bucket}
          />
          <DoctorFilter
            basePath={BASE_PATH}
            doctors={doctorOptions(allRows, data.doctorNames)}
            doctor={doctorId}
            query={query}
            bucket={bucket}
          />
          <BucketChips
            active={bucket}
            counts={bucketCounts(allRows)}
            total={allRows.length}
            query={query}
            doctorId={doctorId}
          />
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">{ADMIN_DEBTS.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{DEBTS_PAGE.admin.title}</caption>
              <thead>
                <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
                  <Th>{ADMIN_DEBTS.columns.customer}</Th>
                  <Th>{ADMIN_DEBTS.columns.service}</Th>
                  <Th>{ADMIN_DEBTS.columns.doctor}</Th>
                  <Th className="text-end">{ADMIN_DEBTS.columns.balance}</Th>
                  <Th>{ADMIN_DEBTS.columns.due}</Th>
                  <Th>{ADMIN_DEBTS.columns.status}</Th>
                  <Th>{ADMIN_DEBTS.columns.followUp}</Th>
                  <Th>{ADMIN_DEBTS.columns.action}</Th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <DebtRowView
                    key={row.appointmentId}
                    row={row}
                    today={today}
                    serviceName={data.serviceNames[row.serviceId ?? ''] ?? null}
                    doctorName={data.doctorNames[row.doctorId] ?? null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="flex flex-wrap items-center gap-4 text-xs text-ink-3">
            <span>
              {ADMIN_DEBTS.showingPrefix}
              {formatNumber(slice.length)}
              {ADMIN_DEBTS.showingSuffix}
            </span>
            <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
          </span>
          <span className="text-xs text-ink-3">{ADMIN_DEBTS.dueHint}</span>
        </footer>
      </section>
    </div>
  )
}
