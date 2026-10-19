/**
 * The desk's read-only customer record — `/reception/customers/[id]`.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  asLocalTime,
  dateToLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
  formatTime,
  toPersianDigits,
  type LocalDate,
} from '@/core/localization'
import { AcquisitionSource, isMember } from '@/core/constants'

import { CUSTOMER_PROFILE_PAGE, CUSTOMERS_PAGE, RECEPTION_CUSTOMERS } from '@/app/catalog'
import { loadCustomerProfile } from '@/app/_customers/page-data'
import { CustomerTabs, tabFromParam } from '@/app/_customers/customer-tabs'
import {
  InjectionTab,
  DEFAULT_INJECTION_VIEW,
  type InjectionView,
} from '@/app/_injections'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import {
  ACQUISITION_SOURCE_LABELS,
  CUSTOMER_LIFECYCLE_LABELS,
} from '@/modules/customers'
import { APPOINTMENT_STATUS_LABELS } from '@/modules/appointments'
import { requireStaffPanel } from '@/app/_shell/session'
import { customerDebtFollowUps } from '@/modules/debts'
import { CollapsibleCard } from '@/app/_customers/CollapsibleCard'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.reception.title }

type RouteParams = Promise<{ readonly id: string }>
type RouteSearch = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function ReceptionCustomerDetailPage({
  params,
  searchParams,
}: {
  readonly params: RouteParams
  readonly searchParams: RouteSearch
}) {
  const session = await requireStaffPanel('reception')
  const { id } = await params
  const query = await searchParams
  const tab = tabFromParam(query.tab)
  const page = pageFromParam(query.page)
  const injectionView = injectionViewFromParam(query.injectionView)

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    try {
      const base = await loadCustomerProfile({ tx, ctx: session.permissions, customerId: id })
      const followUps = await customerDebtFollowUps({ tx, tenantId: session.tenantId, customerId: id })
      return { ...base, followUps }
    } catch {
      return null
    }
  })
  if (data === null) notFound()

  const { profile, primaryDoctorName, primaryClinicName, injections, injectionCounts, followUps } = data
  const name =
    profile.lastName === null ? profile.firstName : `${profile.firstName} ${profile.lastName}`
  const appts = paginate(profile.appointments, page)
  const apptsHrefFor = (next: number): string =>
    next > 1 ? `/reception/customers/${id}?page=${String(next)}` : `/reception/customers/${id}`
  const basePath = `/reception/customers/${id}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href="/reception/customers"
            className="text-xs font-semibold text-brand-700 no-underline hover:underline"
          >
            {RECEPTION_CUSTOMERS.detail.back}
          </Link>
          <h1 className="text-2xl font-bold text-ink">{name}</h1>
        </div>
        <Link
          href="/reception/appointments"
          className="inline-flex items-center gap-1 rounded-sm bg-brand-btn px-[18px] py-[10px] text-sm font-semibold text-ink-inverse no-underline shadow-[var(--sh-brand)] hover:bg-brand-600"
        >
          {CUSTOMERS_PAGE.actions.book}
        </Link>
      </div>

      <CustomerTabs
        basePath={basePath}
        active={tab}
        summaryLabel={RECEPTION_CUSTOMERS.tabs.summary}
        injectionsLabel={RECEPTION_CUSTOMERS.tabs.injections}
      />

      {tab === 'injections' ? (
        <InjectionTab
          rows={injections}
          counts={injectionCounts}
          panel="reception"
          customerId={profile.id}
          view={injectionView}
          basePath={`${basePath}?tab=injections`}
        />
      ) : (
        <>
          <CollapsibleCard title={CUSTOMER_PROFILE_PAGE.sections.details}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 panel:grid-cols-2">
              <Detail
                label={CUSTOMER_PROFILE_PAGE.fields.mobile}
                value={formatPhone(profile.mobile)}
                ltr
              />
              <Detail
                label={CUSTOMERS_PAGE.columns.lifecycle}
                value={lifecycleLabel(profile.lifecycle)}
              />
              <Detail
                label={CUSTOMER_PROFILE_PAGE.fields.acquisitionSource}
                value={sourceLabel(profile.acquisitionSource)}
              />
              <Detail
                label={CUSTOMER_PROFILE_PAGE.fields.birthDate}
                value={
                  profile.birthDate === null
                    ? null
                    : formatDate(profile.birthDate as LocalDate, 'long')
                }
              />
              <Detail label={CUSTOMER_PROFILE_PAGE.fields.primaryDoctor} value={primaryDoctorName} />
              <Detail label={CUSTOMER_PROFILE_PAGE.fields.primaryClinic} value={primaryClinicName} />
              <Detail
                label={CUSTOMER_PROFILE_PAGE.fields.firstVisit}
                value={
                  profile.firstVisitAt === null
                    ? null
                    : formatDate(dateToLocalDate(profile.firstVisitAt), 'long')
                }
              />
              <Detail
                label={CUSTOMER_PROFILE_PAGE.fields.lastVisit}
                value={
                  profile.lastVisitAt === null
                    ? null
                    : formatDate(dateToLocalDate(profile.lastVisitAt), 'long')
                }
              />
              <Detail
                label={CUSTOMER_PROFILE_PAGE.fields.completedSessions}
                value={toPersianDigits(profile.completedSessions)}
              />
            </dl>
          </CollapsibleCard>

          <CollapsibleCard 
            title={CUSTOMER_PROFILE_PAGE.sections.appointments}
            note={`${toPersianDigits(profile.appointments.length)} مورد`}
          >
            {profile.appointments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-3">
                {CUSTOMER_PROFILE_PAGE.empty.appointments}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
                      <Th>{CUSTOMER_PROFILE_PAGE.history.date}</Th>
                      <Th>{CUSTOMER_PROFILE_PAGE.history.service}</Th>
                      <Th>{CUSTOMER_PROFILE_PAGE.history.doctor}</Th>
                      <Th>{CUSTOMER_PROFILE_PAGE.history.status}</Th>
                      <Th className="text-end">{CUSTOMER_PROFILE_PAGE.history.price}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {appts.slice.map((row) => (
                      <tr key={row.id} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-3 text-ink-2 tabular-nums">
                          {formatDate(asLocalDate(row.localDate), 'short')}{' '}
                          {formatTime(asLocalTime(row.localTime))}
                        </td>
                        <td className="px-4 py-3 text-ink-2">{row.serviceName ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-2">{row.doctorName ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-2">
                          {APPOINTMENT_STATUS_LABELS[
                            row.status as keyof typeof APPOINTMENT_STATUS_LABELS
                          ] ?? row.status}
                        </td>
                        <td className="px-4 py-3 text-end text-ink-2 tabular-nums">
                          {formatMoney(row.priceAtBooking)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-line px-4 py-3">
                  <Pagination page={page} totalPages={appts.totalPages} hrefFor={apptsHrefFor} />
                </div>
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard title="پیگیری‌های انجام شده" note={`${toPersianDigits(followUps.length)} مورد`}>
            <FollowUpsList rows={followUps} />
          </CollapsibleCard>
        </>
      )}
    </div>
  )
}

function FollowUpsList({ rows }: { readonly rows: any[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">
        هیچ پیگیری‌ای برای این مشتری ثبت نشده است.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm text-right">
        <thead>
          <tr className="border-b border-line-2 text-ink-3">
            <Th>تاریخ ثبت</Th>
            <Th>مسئول پیگیری</Th>
            <Th>نتیجه / توضیحات</Th>
            <Th>تاریخ وعده پرداخت</Th>
            <Th>تاریخ پیگیری بعدی</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            let finalText = row.note || ''
            const replacements: Record<string, string> = {
              'PROMISE_TO_PAY': 'وعده پرداخت',
              'NO_ANSWER': 'تماس شد؛ پاسخ نداد',
              'SMS_SENT': 'پیامک ارسال شد',
              'DISCOUNT_REQUEST': 'درخواست تخفیف',
              'PROMISE_TOMORROW': 'قول پرداخت تا فردا',
              'AWAITING_REVIEW': 'در انتظار بررسی',
              'INSTALLMENT_REQUEST': 'درخواست تقسیط',
            }
            Object.entries(replacements).forEach(([eng, fa]) => {
              finalText = finalText.replace(new RegExp(eng, 'g'), fa)
            })
            const parts = finalText.split(' - ')
            const resultPart = parts[0] || ''
            const notePart = parts.slice(1).join(' - ')

            return (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-3 text-ink-2 tabular-nums whitespace-nowrap">
                  {formatDate(dateToLocalDate(row.createdAt), 'short')}
                </td>
                <td className="px-3 py-3 text-ink-2">
                  {row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName ?? ''}` : 'سیستم'}
                </td>
                <td className="px-3 py-3 text-ink whitespace-pre-wrap">
                  <span className="font-semibold">{resultPart}</span>
                  {notePart && <span className="block text-xs text-ink-3 mt-1">{notePart}</span>}
                </td>
                <td className="px-3 py-3 text-ink-2 tabular-nums whitespace-nowrap">—</td>
                <td className="px-3 py-3 text-ink-2 tabular-nums whitespace-nowrap">
                  {row.nextContactAt ? formatDate(dateToLocalDate(row.nextContactAt), 'short') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function injectionViewFromParam(value: string | string[] | undefined): InjectionView {
  if (value === 'table') return 'table'
  return DEFAULT_INJECTION_VIEW
}

function Detail({
  label,
  value,
  ltr,
}: {
  readonly label: string
  readonly value: string | null
  readonly ltr?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={ltr ? 'tabular-nums text-ink' : 'text-ink'} dir={ltr ? 'ltr' : undefined}>
        {value ?? '—'}
      </dd>
    </div>
  )
}

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
      className={`whitespace-nowrap px-4 py-3 text-start text-xs font-semibold ${className ?? ''}`}
    >
      {children}
    </th>
  )
}

function sourceLabel(source: string | null): string | null {
  if (source === null) return null
  if (!isMember(AcquisitionSource, source)) return source
  return ACQUISITION_SOURCE_LABELS[source]
}

function lifecycleLabel(lifecycle: string): string {
  return (
    CUSTOMER_LIFECYCLE_LABELS[lifecycle as keyof typeof CUSTOMER_LIFECYCLE_LABELS] ?? lifecycle
  )
}