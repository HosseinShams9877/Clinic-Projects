// src/app/doctor/customers/[id]/page.tsx

/**
 * The doctor's view of a patient's profile.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { APPOINTMENT_STATUS_LABELS } from '@/modules/appointments'
import { ACQUISITION_SOURCE_LABELS, getCustomerNotes } from '@/modules/customers'
import {
  AppointmentStatus,
  CycleStatus,
  PaymentKind,
  PaymentMethod,
  isMember,
} from '@/core/constants'
import {
  asLocalDate,
  dateToLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
  jalaliParts,
  monthName,
  toPersianDigits,
  type LocalDate,
} from '@/core/localization'
import { isAppError, NotFoundError } from '@/core/types'
import { cx } from '@/core/lib'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'

import { ADMIN_CUSTOMER_PROFILE } from '@/app/admin/catalog'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import { CUSTOMER_PROFILE_PAGE } from '@/app/catalog'
import { loadCustomerProfile } from '@/app/_customers/page-data'
import { CustomerTabs, tabFromParam } from '@/app/_customers/customer-tabs'
import {
  InjectionTab,
  DEFAULT_INJECTION_VIEW,
  type InjectionView,
} from '@/app/_injections'
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/payments'
import { CYCLE_STATUS_LABELS, customerCycles } from '@/modules/cycles'
import type { CycleRow } from '@/modules/cycles'
import { customerMessageHistory } from '@/modules/messages'
import { DoctorNoteForm } from '@/app/_customers/profile-forms'
import { ProgressBar } from '@/app/_components/ProgressBar'
import { requireStaffPanel } from '@/app/_shell/session'
import { customerDebtFollowUps } from '@/modules/debts'
import { CollapsibleCard } from '@/app/_customers/CollapsibleCard'

export const metadata: Metadata = { title: CUSTOMER_PROFILE_PAGE.title }

const APPTS_PAGE_PARAM = 'appts'
const PAYS_PAGE_PARAM = 'pays'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export default async function DoctorCustomerDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>
}) {
  const session = await requireStaffPanel('doctor')
  const { id } = await params
  const query = await searchParams
  const tab = tabFromParam(query.tab)
  const apptsPage = pageFromParam(query[APPTS_PAGE_PARAM])
  const paysPage = pageFromParam(query[PAYS_PAGE_PARAM])
  const injectionView = injectionViewFromParam(query.injectionView)

  const data = await loadProfile(session.permissions, id)

  const { profile, cycles, messages, injections, injectionCounts, notes, followUps } = data
  const name = profile.lastName === null ? profile.firstName : `${profile.firstName} ${profile.lastName}`
  const balance = profile.chargedTotal - profile.paidTotal
  const activeCycles = cycles.filter(
    (row) =>
      row.status === CycleStatus.Active ||
      row.status === CycleStatus.Due ||
      row.status === CycleStatus.AtRisk,
  )

  const appts = paginate(profile.appointments, apptsPage)
  const pays = paginate(profile.payments, paysPage)
  const basePath = `/doctor/customers/${id}`
  const historyHref = (next: { readonly appts: number; readonly pays: number }): string => {
    const sp = new URLSearchParams()
    if (next.appts > 1) sp.set(APPTS_PAGE_PARAM, String(next.appts))
    if (next.pays > 1) sp.set(PAYS_PAGE_PARAM, String(next.pays))
    const qs = sp.toString()
    return qs === '' ? basePath : `${basePath}?${qs}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 panel:flex-row panel:items-center panel:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-pill bg-brand-50 text-lg font-bold text-brand-700"
            aria-hidden="true"
          >
            {profile.firstName.slice(0, 1)}
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-ink">{name}</h1>
            <span className="text-sm text-ink-2 tabular-nums" dir="ltr">
              {formatPhone(profile.mobile)}
            </span>
          </div>
        </div>
      </div>

      <CustomerTabs
        basePath={basePath}
        active={tab}
        summaryLabel={ADMIN_CUSTOMER_PROFILE.tabs.summary}
        injectionsLabel={ADMIN_CUSTOMER_PROFILE.tabs.injections}
      />

      {tab === 'injections' ? (
        <InjectionTab
          rows={injections}
          counts={injectionCounts}
          panel="doctor"
          customerId={profile.id}
          view={injectionView}
          basePath={`${basePath}?tab=injections`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
            <KpiTile
              label={ADMIN_CUSTOMER_PROFILE.kpi.visits}
              value={toPersianDigits(profile.completedSessions)}
              icon="appointment"
              tone="bg-info-bg text-info"
            />
            <KpiTile
              label={ADMIN_CUSTOMER_PROFILE.kpi.activeCycles}
              value={toPersianDigits(activeCycles.length)}
              icon="treatment"
              tone="bg-ok-bg text-ok"
            />
            <KpiTile
              label={ADMIN_CUSTOMER_PROFILE.kpi.balance}
              value={formatMoney(balance)}
              icon="debt"
              tone="bg-warn-bg text-warn"
            />
            <KpiTile
              label={ADMIN_CUSTOMER_PROFILE.kpi.totalPaid}
              value={formatMoney(profile.paidTotal)}
              icon="payment"
              tone="bg-brand-50 text-brand"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 panel:grid-cols-[1fr_320px] panel:items-start">
            <div className="flex flex-col gap-6">
              <CollapsibleCard title={ADMIN_CUSTOMER_PROFILE.cards.cycles}>
                <CyclesTable rows={cycles} />
              </CollapsibleCard>

              <CollapsibleCard
                title={ADMIN_CUSTOMER_PROFILE.cards.visits}
                note={`${toPersianDigits(profile.appointments.length)} ${ADMIN_CUSTOMER_PROFILE.recentSuffix}`}
              >
                <AppointmentHistory
                  rows={appts.slice}
                  page={apptsPage}
                  totalPages={appts.totalPages}
                  hrefFor={(next) => historyHref({ appts: next, pays: paysPage })}
                />
              </CollapsibleCard>

              <CollapsibleCard title={ADMIN_CUSTOMER_PROFILE.cards.payments}>
                <PaymentHistory
                  rows={pays.slice}
                  page={paysPage}
                  totalPages={pays.totalPages}
                  hrefFor={(next) => historyHref({ appts: apptsPage, pays: next })}
                />
              </CollapsibleCard>

              <CollapsibleCard title="پیگیری‌های انجام شده" note={`${toPersianDigits(followUps.length)} مورد`}>
                <FollowUpsList rows={followUps} />
              </CollapsibleCard>

              <CollapsibleCard title={CUSTOMER_PROFILE_PAGE.note.history}>
                <NotesList notes={notes} />
              </CollapsibleCard>
            </div>

            <div className="flex flex-col gap-6">
              <CollapsibleCard title={ADMIN_CUSTOMER_PROFILE.cards.details}>
                <DetailsDl profile={profile} doctorName={data.primaryDoctorName} />
              </CollapsibleCard>

              <CollapsibleCard title={ADMIN_CUSTOMER_PROFILE.cards.messages}>
                <MessageList rows={messages} />
              </CollapsibleCard>

              <CollapsibleCard title={CUSTOMER_PROFILE_PAGE.sections.medical}>
                <DoctorNoteForm customerId={profile.id} panel="doctor" />
              </CollapsibleCard>
            </div>
          </div>
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

async function loadProfile(
  ctx: Parameters<typeof loadCustomerProfile>[0]['ctx'],
  customerId: string,
) {
  try {
    return await runInTenantScope(ctx, prisma(), async (tx) => {
      const [base, cycles, messages, notes, followUps] = await Promise.all([
        loadCustomerProfile({ tx, ctx, customerId }),
        customerCycles({ tx, tenantId: ctx.tenantId, customerId }),
        customerMessageHistory({ tx, tenantId: ctx.tenantId, customerId }),
        getCustomerNotes({ tx, tenantId: ctx.tenantId, customerId }),
        customerDebtFollowUps({ tx, tenantId: ctx.tenantId, customerId }),
      ])
      return { ...base, cycles, messages, notes, followUps } as const
    })
  } catch (error: unknown) {
    if (isAppError(error) && error instanceof NotFoundError) notFound()
    throw error
  }
}

function KpiTile({
  label,
  value,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly icon: IconName
  readonly tone: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tone)}>
        <Icon name={icon} size="card" />
      </span>
      <span className="flex flex-col">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="text-lg font-bold tabular-nums text-ink">{value}</span>
      </span>
    </div>
  )
}

function NotesList({ notes }: { readonly notes: readonly { id: string; text: string; createdAt: Date; authorName: string | null }[] }) {
  if (notes.length === 0) {
    return (
      <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">
        {CUSTOMER_PROFILE_PAGE.note.historyEmpty}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-md bg-surface-2 p-3 text-sm">
          <p className="whitespace-pre-wrap text-ink">{note.text}</p>
          <span className="mt-2 block text-xs text-ink-3">
            {note.authorName ?? CUSTOMER_PROFILE_PAGE.note.authorUnknown} — {formatDate(dateToLocalDate(note.createdAt), 'short')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ... بقیه کامپوننت‌های جدول‌ها (CyclesTable, AppointmentHistory, PaymentHistory, DetailsDl) بدون تغییر ...
function CyclesTable({ rows }: { readonly rows: readonly CycleRow[] }) {
  if (rows.length === 0) {
    return <EmptyState sentence={ADMIN_CUSTOMER_PROFILE.empty.cycles} />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-2 text-ink-3">
            <Th>{ADMIN_CUSTOMER_PROFILE.cycleColumns.service}</Th>
            <Th>{ADMIN_CUSTOMER_PROFILE.cycleColumns.sessions}</Th>
            <Th>{ADMIN_CUSTOMER_PROFILE.cycleColumns.interval}</Th>
            <Th>{ADMIN_CUSTOMER_PROFILE.cycleColumns.nextDue}</Th>
            <Th>{ADMIN_CUSTOMER_PROFILE.cycleColumns.status}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CycleRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CycleRow({ row }: { readonly row: CycleRow }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-2 font-semibold text-ink">{row.serviceName}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1 tabular-nums">
          <span className="font-semibold text-ink">
            {toPersianDigits(row.completedSessions)}
            {row.totalSessions === 0
              ? ''
              : ` ${ADMIN_CUSTOMER_PROFILE.cycleColumns.sessions} ${toPersianDigits(row.totalSessions)}`}
          </span>
          {row.totalSessions === 0 ? null : (
            <ProgressBar done={row.completedSessions} total={row.totalSessions} />
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-ink-2 tabular-nums">{intervalLabel(row.intervalDays)}</td>
      <td className="px-3 py-2 font-semibold text-ink tabular-nums">
        {row.nextDueDate === null ? '—' : formatDate(dateToLocalDate(row.nextDueDate), 'short')}
      </td>
      <td className="px-3 py-2">
        <CycleStatusBadge status={row.status} />
      </td>
    </tr>
  )
}

function intervalLabel(intervalDays: number): string {
  if (intervalDays % 7 === 0) {
    return `${toPersianDigits(intervalDays / 7)} ${ADMIN_CUSTOMER_PROFILE.unitWeeks}`
  }
  return `${toPersianDigits(intervalDays)} ${ADMIN_CUSTOMER_PROFILE.unitDays}`
}

function CycleStatusBadge({ status }: { readonly status: string }) {
  if (!isMember(CycleStatus, status)) return <span className="text-ink-3">—</span>
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        status === CycleStatus.Due
          ? 'bg-danger-bg text-danger'
          : status === CycleStatus.AtRisk
            ? 'bg-brand-100 text-brand-700'
            : status === CycleStatus.Completed
              ? 'bg-ok-bg text-ok'
              : status === CycleStatus.Abandoned
                ? 'bg-surface-sunken text-ink-3'
                : 'bg-neutral-bg text-ink-2',
      )}
    >
      {CYCLE_STATUS_LABELS[status]}
    </span>
  )
}

function AppointmentHistory({
  rows,
  page,
  totalPages,
  hrefFor,
}: {
  readonly page: number
  readonly totalPages: number
  readonly hrefFor: (page: number) => string
  readonly rows: ReadonlyArray<{
    readonly id: string
    readonly scheduledAt: Date
    readonly localDate: string
    readonly localTime: string
    readonly status: string
    readonly priceAtBooking: bigint
    readonly serviceName: string | null
    readonly doctorName: string | null
  }>
}) {
  if (rows.length === 0) {
    return <EmptyState sentence={CUSTOMER_PROFILE_PAGE.empty.appointments} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-2 text-ink-3">
              <Th>{ADMIN_CUSTOMER_PROFILE.visitColumns.date}</Th>
              <Th>{ADMIN_CUSTOMER_PROFILE.visitColumns.service}</Th>
              <Th>{ADMIN_CUSTOMER_PROFILE.visitColumns.status}</Th>
              <Th align="end">{ADMIN_CUSTOMER_PROFILE.visitColumns.amount}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 text-ink-2 tabular-nums">
                  {formatDate(row.localDate as LocalDate, 'short')}
                </td>
                <td className="px-3 py-2 font-semibold text-ink">{row.serviceName ?? '—'}</td>
                <td className="px-3 py-2">{statusBadge(row.status)}</td>
                <td className="px-3 py-2 text-end font-semibold text-ink tabular-nums">
                  {formatMoney(row.priceAtBooking)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

function PaymentHistory({
  rows,
  page,
  totalPages,
  hrefFor,
}: {
  readonly page: number
  readonly totalPages: number
  readonly hrefFor: (page: number) => string
  readonly rows: ReadonlyArray<{
    readonly id: string
    readonly amount: bigint
    readonly paidAt: Date | null
    readonly method: string
    readonly kind: string
  }>
}) {
  if (rows.length === 0) {
    return <EmptyState sentence={ADMIN_CUSTOMER_PROFILE.empty.payments} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-2 text-ink-3">
              <Th>{CUSTOMER_PROFILE_PAGE.history.paidAt}</Th>
              <Th>{CUSTOMER_PROFILE_PAGE.history.amount}</Th>
              <Th>{CUSTOMER_PROFILE_PAGE.history.method}</Th>
              <Th>{CUSTOMER_PROFILE_PAGE.history.kind}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 text-ink-2 tabular-nums">
                  {row.paidAt === null ? '—' : formatDate(dateToLocalDate(row.paidAt), 'short')}
                </td>
                <td className="px-3 py-2 font-semibold text-ink tabular-nums">
                  {formatMoney(row.amount)}
                </td>
                <td className="px-3 py-2 text-ink-2">{methodLabel(row.method)}</td>
                <td className="px-3 py-2 text-ink-2">{kindLabel(row.kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

function statusBadge(status: string): React.ReactNode {
  if (!isMember(AppointmentStatus, status)) return <span className="text-ink-3">{status}</span>
  const tone =
    status === AppointmentStatus.Completed
      ? 'bg-ok-bg text-ok'
      : status === AppointmentStatus.NoShow
        ? 'bg-neutral-bg text-ink-3'
        : status === AppointmentStatus.Cancelled
          ? 'bg-danger-bg text-danger'
          : 'bg-surface-sunken text-ink-2'
  return (
    <span className={cx('inline-flex rounded-pill px-2 py-1 text-xs font-semibold', tone)}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  )
}

function DetailsDl({
  profile,
  doctorName,
}: {
  readonly profile: {
    readonly mobile: string
    readonly birthDate: string | null
    readonly firstVisitAt: Date | null
    readonly acquisitionSource: string | null
    readonly residenceArea: string | null
    readonly medicalHistory: string | null
    readonly sensitivities: string | null
  }
  readonly doctorName: string | null
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3">
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.mobile}
        value={formatPhone(profile.mobile)}
        ltr
      />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.birthDate}
        value={formatBirthday(profile.birthDate)}
      />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.firstVisit}
        value={
          profile.firstVisitAt === null
            ? null
            : formatDate(dateToLocalDate(profile.firstVisitAt), 'long')
        }
      />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.source}
        value={sourceLabel(profile.acquisitionSource)}
      />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.doctor} value={doctorName} />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.residence} value={profile.residenceArea} />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.medicalHistory}
        value={profile.medicalHistory}
        span
      />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.sensitivities}
        value={profile.sensitivities}
        span
      />
    </dl>
  )
}

function Detail({
  label,
  value,
  span,
  ltr,
}: {
  readonly label: string
  readonly value: string | null
  readonly span?: boolean
  readonly ltr?: boolean
}) {
  return (
    <div className={span ? 'col-span-1' : undefined}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd
        className={cx('mt-1 text-sm font-semibold text-ink', ltr && 'tabular-nums')}
        dir={ltr ? 'ltr' : undefined}
      >
        {value ?? '—'}
      </dd>
    </div>
  )
}

function MessageList({
  rows,
}: {
  readonly rows: ReadonlyArray<{
    readonly id: string
    readonly renderedText: string
    readonly createdAt: Date
  }>
}) {
  if (rows.length === 0) {
    return <EmptyState sentence={ADMIN_CUSTOMER_PROFILE.empty.messages} />
  }

  const thirtyDaysAgo = realClock().getTime() - THIRTY_DAYS_MS
  const recent = rows.filter((row) => row.createdAt.getTime() >= thirtyDaysAgo).length
  const lastFive = rows.slice(0, 5)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {lastFive.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-ink-2" title={row.renderedText}>
              {row.renderedText}
            </span>
            <span className="shrink-0 text-xs text-ink-3 tabular-nums">
              {formatDate(dateToLocalDate(row.createdAt), 'short')}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-3">
        {toPersianDigits(recent)} {ADMIN_CUSTOMER_PROFILE.messageCountSuffix}
      </p>
    </div>
  )
}

function formatBirthday(birthDate: string | null): string | null {
  if (birthDate === null) return null
  const { month, day } = jalaliParts(asLocalDate(birthDate))
  return `${toPersianDigits(day)} ${monthName(month)}`
}

function EmptyState({ sentence }: { readonly sentence: string }) {
  return (
    <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">{sentence}</p>
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
        'whitespace-nowrap px-3 py-2 text-xs font-semibold',
        align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start',
      )}
    >
      {children}
    </th>
  )
}

function sourceLabel(source: string | null): string | null {
  if (source === null) return null
  const key = source as keyof typeof ACQUISITION_SOURCE_LABELS
  return ACQUISITION_SOURCE_LABELS[key] ?? source
}

function methodLabel(method: string): string {
  return isMember(PaymentMethod, method) ? PAYMENT_METHOD_LABELS[method] : method
}

function kindLabel(kind: string): string {
  return isMember(PaymentKind, kind) ? PAYMENT_KIND_LABELS[kind] : kind
}