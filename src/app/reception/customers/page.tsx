/**
 * The desk's customer file — `02-architecture.md` §9's `reception/customers.html`.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import {
  asLocalDate,
  dateToLocalDate,
  formatDate,
  fromUtcInstant,
  formatMoney,
  formatNumber,
  formatPhone,
  jalaliParts,
  monthName,
  toPersianDigits,
} from '@/core/localization'
import { AudienceGroupKey, AcquisitionSource, isMember } from '@/core/constants'
import { ACQUISITION_SOURCE_LABELS } from '@/modules/customers'
import { AUDIENCE_GROUP_LABELS, evaluateGroup } from '@/modules/audience-groups'
import { readReportOffset } from '@/modules/reports'
import { readManagerHome } from '@/modules/dashboard'
import type { CustomerListRow } from '@/modules/customers'
import { cx } from '@/core/lib'
import { Icon } from '@/core/components/icons'

import { CUSTOMERS_PAGE } from '@/app/catalog'
import { loadCustomersList } from '@/app/_customers/page-data'
import { CustomerSearchForm, CUSTOMER_QUERY_PARAM } from '@/app/_customers/customers-search'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { requireStaffPanel } from '@/app/_shell/session'

import { AddCustomerDialog } from './_components/AddCustomerDialog'
import { ExportButton } from './_components/ExportButton'
import { ADMIN_CUSTOMERS } from '@/app/admin/catalog'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.reception.title }

const BASE_PATH = '/reception/customers'
const PROFILE_BASE_PATH = '/reception/customers'
const GROUP_PARAM = 'group'

const CHIP_KEYS = [
  AudienceGroupKey.Debtors,
  AudienceGroupKey.CycleDue,
  AudienceGroupKey.Loyal,
  AudienceGroupKey.Dormant,
  AudienceGroupKey.New,
] as const

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function ReceptionCustomersPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('reception')
  const params = await searchParams
  const query = asString(params[CUSTOMER_QUERY_PARAM])
  const group = groupFromParam(params[GROUP_PARAM])

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const today = fromUtcInstant(realClock(), await readReportOffset(tx, session.tenantId)).localDate
    const [list, month, groupIds] = await Promise.all([
      loadCustomersList({ tx, ctx: session.permissions, scope: 'all', query }),
      readManagerHome(tx, session.tenantId, today),
      group === null
        ? Promise.resolve(null)
        : evaluateGroup({
            tx,
            tenantId: session.tenantId,
            predicate: { kind: 'BUILT_IN', key: group },
            now: realClock(),
          }),
    ])
    return { list, month, groupIds } as const
  })

  const rows = applyGroupFilter(data.list.rows, data.groupIds, group)
  const page = pageFromParam(params.page)
  const { slice, totalPages } = paginate(rows, page)
  
  const hrefFor = (next: number): string => {
    const sp = new URLSearchParams()
    if (query !== '') sp.set(CUSTOMER_QUERY_PARAM, query)
    if (group !== null) sp.set(GROUP_PARAM, group)
    if (next > 1) sp.set('page', String(next))
    const qs = sp.toString()
    return qs === '' ? BASE_PATH : `${BASE_PATH}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{CUSTOMERS_PAGE.reception.title}</h1>
          <p className="text-sm text-ink-2">
            {formatNumber(data.month.month.newCustomers)} {ADMIN_CUSTOMERS.subNewThisMonth}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 👈 اضافه کردن پراپ doctorNames */}
          <ExportButton rows={rows} doctorNames={data.list.doctorNames} dateStamp={realClock().toISOString().slice(0, 10)} />
          <AddCustomerDialog />
        </div>
      </div>

      <section className="flex flex-col rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 panel:flex-row panel:items-center">
          <div className="w-full panel:w-72">
            <CustomerSearchForm query={query} basePath={BASE_PATH} />
          </div>
          <GroupChips active={group} basePath={BASE_PATH} />
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">
            {query === '' ? CUSTOMERS_PAGE.empty.noCustomers : CUSTOMERS_PAGE.empty.noResults}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{CUSTOMERS_PAGE.reception.title}</caption>
              <thead>
                <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
                  <Th>{ADMIN_CUSTOMERS.columns.name}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.birthday}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.source}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.lastVisit}</Th>
                  <Th align="center">{ADMIN_CUSTOMERS.columns.visits}</Th>
                  <Th align="center">{ADMIN_CUSTOMERS.columns.balance}</Th>
                  <Th>{ADMIN_CUSTOMERS.columns.message}</Th>
                  <Th align="center">عملیات</Th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <CustomerRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="text-xs text-ink-3">
            {ADMIN_CUSTOMERS.showingPrefix}
            {formatNumber(slice.length)}
            {ADMIN_CUSTOMERS.showingOf}
            {formatNumber(rows.length)}
            {ADMIN_CUSTOMERS.showingSuffix}
          </span>
          <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
        </footer>
      </section>
    </div>
  )
}

function applyGroupFilter(
  rows: readonly CustomerListRow[],
  groupIds: readonly string[] | null,
  group: AudienceGroupKey | null,
): readonly CustomerListRow[] {
  if (groupIds === null) return rows
  return rows.filter((row) => {
    if (!groupIds.includes(row.id)) return false
    if (group !== AudienceGroupKey.Debtors) return true
    return row.chargedTotal - row.paidTotal > 0n
  })
}

function GroupChips({
  active,
  basePath,
}: {
  readonly active: string | null
  readonly basePath: string
}) {
  const chips: readonly { readonly key: string; readonly label: string }[] = [
    { key: '', label: ADMIN_CUSTOMERS.filterAll },
    ...CHIP_KEYS.map((key) => ({ key, label: AUDIENCE_GROUP_LABELS[key] })),
  ]

  return (
    <nav className="flex flex-wrap gap-2" aria-label={CUSTOMERS_PAGE.reception.title}>
      {chips.map((chip) => {
        const isActive = chip.key === (active ?? '')
        return (
          <Link
            key={chip.key}
            href={chip.key === '' ? basePath : `${basePath}?${GROUP_PARAM}=${chip.key}`}
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

function CustomerRow({ row }: { readonly row: CustomerListRow }) {
  const name = row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
  const balance = row.chargedTotal - row.paidTotal

  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700"
            aria-hidden="true"
          >
            {row.firstName.slice(0, 1)}
          </span>
          <span className="flex flex-col">
            <Link
              href={`${PROFILE_BASE_PATH}/${row.id}`}
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              {name}
            </Link>
            <span className="text-xs text-ink-3 tabular-nums" dir="ltr">
              {formatPhone(row.mobile)}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-ink-3 tabular-nums">{formatBirthday(row.birthDate)}</td>
      <td className="px-4 py-3">{sourceTag(row.acquisitionSource)}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        {row.lastVisitAt === null ? '—' : formatDate(dateToLocalDate(row.lastVisitAt), 'short')}
      </td>
      <td className="px-4 py-3 text-center font-semibold text-ink tabular-nums">
        {toPersianDigits(row.completedSessions)}
      </td>
      <td className="px-4 py-3 text-center font-bold tabular-nums">
        {balance <= 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="text-warn">{formatMoney(balance)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={cx(
            'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
            row.consentWhatsApp ? 'bg-ok-bg text-ok' : 'bg-neutral-bg text-ink-3',
          )}
        >
          {row.consentWhatsApp ? ADMIN_CUSTOMERS.messageable.yes : ADMIN_CUSTOMERS.messageable.no}
        </span>
      </td>
      
      {/* 👈 ستون دکمه‌های عملیات */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1.5">
          <Link
            href={`${PROFILE_BASE_PATH}/${row.id}`}
            className="inline-flex items-center rounded-full border border-line-2 bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink-2 no-underline hover:bg-surface-2 transition-colors whitespace-nowrap shadow-sm"
          >
            پرونده
          </Link>
          <Link
            href="/reception/appointments"
            className="inline-flex items-center gap-1 rounded-full bg-brand-btn px-3 py-1.5 text-[11px] font-semibold text-ink-inverse no-underline hover:bg-brand-600 transition-colors whitespace-nowrap shadow-sm"
          >
            <Icon name="appointment" size="compact" />
            ثبت نوبت
          </Link>
        </div>
      </td>
    </tr>
  )
}

function formatBirthday(birthDate: string | null): string {
  if (birthDate === null) return '—'
  const { month, day } = jalaliParts(asLocalDate(birthDate))
  return `${toPersianDigits(day)} ${monthName(month)}`
}

function sourceTag(source: string | null): React.ReactNode {
  if (source === null) return <span className="text-ink-3">—</span>
  if (!isMember(AcquisitionSource, source)) return <span className="text-ink-2">{source}</span>
  return (
    <span className="inline-flex rounded-pill bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
      {ACQUISITION_SOURCE_LABELS[source]}
    </span>
  )
}

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

function groupFromParam(value: string | string[] | undefined): AudienceGroupKey | null {
  if (typeof value !== 'string') return null
  return isMember(AudienceGroupKey, value) ? value : null
}

function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}