/**
 * The customer profile — `02-architecture.md` §9's `admin/customer.html`.
 *
 * The one surface the customers module's full record renders on. The page composes
 * four modules' reads — `customers` for the row and its two histories, `cycles` for
 * the courses the profile's left column holds, `messages` for the recent sends, and
 * `audience-groups` for the badges that say which campaigns can already reach this
 * person — which is what `02-architecture.md` §6 puts composition in `src/app/` for:
 * the profile is the one page a customer's whole record is one page on.
 *
 * ## Why the two columns and not the eight sections
 *
 * The demo composes the page from a wide column that holds the two histories and a
 * narrow one that holds the facts and the two things the manager acts on — the
 * audience the campaigns already reach and the clinical note. The two columns are the
 * order the manager reads in: what happened, then what to do about it.
 *
 * ## Why the badges are evaluated and not stored
 *
 * `03-data-model.md` Decision 3 is a group is a saved predicate and not a stored
 * member list, so whether this customer is in «وفادارها» is a question asked now and
 * not a flag the row carries. The page asks it through the audience-groups module's
 * own evaluation for the same reason the campaign's dispatch does: a badge that
 * disagreed with the audience a campaign sent to would be a badge the manager could
 * not act on.
 *
 * ## Why a missing row is a 404 and not a 500
 *
 * `customerProfile` raises `NotFoundError` for a row that is outside the caller's
 * scope — another tenant's customer, or another doctor's patient when the caller
 * cannot see the whole file (`09-security.md` §6.3). The page catches that one error
 * and answers `notFound()`, because the honest answer to a person who opened a
 * profile they cannot see is the same page as one that does not exist. Every other
 * failure is the framework's own error page, which is where a bug belongs.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma, runInTenantScope } from '@/core/db'
import type { TransactionClient } from '@/core/db/scope'
import { realClock } from '@/core/lib/clock'
import {
  APPOINTMENT_STATUS_LABELS,
} from '@/modules/appointments'
import {
  ACQUISITION_SOURCE_LABELS,
} from '@/modules/customers'
import {
  AppointmentStatus,
  AudienceGroupKey,
  BUILT_IN_AUDIENCE_GROUPS,
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
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/payments'
import { CYCLE_STATUS_LABELS, customerCycles } from '@/modules/cycles'
import type { CycleRow } from '@/modules/cycles'
import { customerMessageHistory } from '@/modules/messages'
import { AUDIENCE_GROUP_LABELS, evaluateGroup } from '@/modules/audience-groups'
import {
  ConsentForm,
  DoctorNoteForm,
  ProfileEdit,
} from '@/app/_customers/profile-forms'
import { ProgressBar } from '@/app/_components/ProgressBar'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_PROFILE_PAGE.title }

/** The two history list params, each paging one of the profile's own tables. */
const APPTS_PAGE_PARAM = 'appts'
const PAYS_PAGE_PARAM = 'pays'

/** A month, as the messages card's thirty-day window counts it. */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * One customer's full record, or the 404 a row outside the caller's scope answers.
 */
export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>
}) {
  const session = await requireStaffPanel('admin')
  const { id } = await params
  const query = await searchParams
  const apptsPage = pageFromParam(query[APPTS_PAGE_PARAM])
  const paysPage = pageFromParam(query[PAYS_PAGE_PARAM])

  const data = await loadProfile(session.permissions, id)

  const { profile, cycles, messages, groups } = data
  const name = profile.lastName === null ? profile.firstName : `${profile.firstName} ${profile.lastName}`
  const balance = profile.chargedTotal - profile.paidTotal
  const activeCycles = cycles.filter((row) => row.status === CycleStatus.Active || row.status === CycleStatus.Due || row.status === CycleStatus.AtRisk)

  const appts = paginate(profile.appointments, apptsPage)
  const pays = paginate(profile.payments, paysPage)
  const basePath = `/admin/customer/${id}`
  /** One href keeping whichever of the two history pages the URL already names. */
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
        <Link
          href="/admin/appointments"
          className="inline-flex items-center gap-2 rounded-sm border border-brand-btn bg-brand-btn p-[10px_18px] text-sm font-semibold text-ink-inverse no-underline shadow-brand hover:bg-brand-600"
        >
          <Icon name="calendar" size="compact" />
          {ADMIN_CUSTOMER_PROFILE.book}
        </Link>
      </div>

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
          <Card title={ADMIN_CUSTOMER_PROFILE.cards.cycles}>
            <CyclesTable rows={cycles} />
          </Card>

          <Card
            title={ADMIN_CUSTOMER_PROFILE.cards.visits}
            note={`${toPersianDigits(profile.appointments.length)} ${ADMIN_CUSTOMER_PROFILE.recentSuffix}`}
          >
            <AppointmentHistory
              rows={appts.slice}
              page={apptsPage}
              totalPages={appts.totalPages}
              hrefFor={(next) => historyHref({ appts: next, pays: paysPage })}
            />
          </Card>

          <Card title={ADMIN_CUSTOMER_PROFILE.cards.payments}>
            <PaymentHistory
              rows={pays.slice}
              page={paysPage}
              totalPages={pays.totalPages}
              hrefFor={(next) => historyHref({ appts: apptsPage, pays: next })}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title={ADMIN_CUSTOMER_PROFILE.cards.details} action={<ProfileEdit customerId={profile.id} firstName={profile.firstName} lastName={profile.lastName} birthDate={profile.birthDate} residenceArea={profile.residenceArea} />}>
            <DetailsDl profile={profile} doctorName={data.primaryDoctorName} />
          </Card>

          <Card title={ADMIN_CUSTOMER_PROFILE.cards.campaign}>
            <GroupBadges groups={groups} />
            <ConsentForm
              customerId={profile.id}
              flags={{
                sms: profile.consentSms,
                whatsApp: profile.consentWhatsApp,
                phone: profile.consentPhone,
                beforeAfter: profile.consentBeforeAfter,
              }}
            />
          </Card>

          <Card title={ADMIN_CUSTOMER_PROFILE.cards.messages}>
            <MessageList rows={messages} />
          </Card>

          <Card title={CUSTOMER_PROFILE_PAGE.sections.medical}>
            <DoctorNoteForm customerId={profile.id} note={profile.doctorNote} />
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * The profile and the three reads beside it, in the caller's scope, or the 404 a row
 * outside it answers.
 *
 * The four reads are one transaction because the profile is one page: a cycle closed
 * between the row and the courses would be a course the page rendered against a row
 * that no longer held it.
 */
async function loadProfile(
  ctx: Parameters<typeof loadCustomerProfile>[0]['ctx'],
  customerId: string,
) {
  try {
    return await runInTenantScope(ctx, prisma(), async (tx) => {
      const [base, cycles, messages, groups] = await Promise.all([
        loadCustomerProfile({ tx, ctx, customerId }),
        customerCycles({ tx, tenantId: ctx.tenantId, customerId }),
        customerMessageHistory({ tx, tenantId: ctx.tenantId, customerId }),
        groupMemberships(tx, ctx.tenantId, customerId),
      ])
      return { ...base, cycles, messages, groups } as const
    })
  } catch (error: unknown) {
    if (isAppError(error) && error instanceof NotFoundError) notFound()
    throw error
  }
}

/**
 * The built-in groups this customer is in, evaluated now.
 *
 * A badge is a question answered at read time and not a stored fact (Decision 3), so
 * the eight are evaluated through the module's own evaluation — the same one a
 * campaign's dispatch runs — and the ones that answer yes are the ones the card shows.
 */
async function groupMemberships(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<readonly AudienceGroupKey[]> {
  const now = realClock()
  const memberships = await Promise.all(
    BUILT_IN_AUDIENCE_GROUPS.map(async (key) => {
      const ids = await evaluateGroup({
        tx,
        tenantId,
        predicate: { kind: 'BUILT_IN', key },
        now,
      })
      return [key, ids.includes(customerId)] as const
    }),
  )
  return memberships.filter(([, isMember]) => isMember).map(([key]) => key)
}

/* ── The page's own cards ────────────────────────────────────────────────────── */

/** One card, with the heading and the optional count or action its head carries. */
function Card({
  title,
  note,
  action,
  children,
}: {
  readonly title: string
  /** The small count a history card names beside its heading, or none. */
  readonly note?: string
  /** The one action the card's head holds, or none. */
  readonly action?: React.ReactNode
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          {note === undefined ? null : <span className="text-xs text-ink-3">{note}</span>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** One KPI tile, in the shape the manager's home renders the day in. */
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

/* ── The courses ─────────────────────────────────────────────────────────────── */

/** The customer's courses, as the profile's left column renders them. */
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
            <Th>{ADMIN_CUSTOMER_PROFILE.cycleColumns.doctor}</Th>
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

/** One course, with the progress its sessions column draws. */
function CycleRow({ row }: { readonly row: CycleRow }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-2 font-semibold text-ink">{row.serviceName}</td>
      <td className="px-3 py-2 text-ink-2">{row.doctorName}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1 tabular-nums">
          <span className="font-semibold text-ink">
            {toPersianDigits(row.completedSessions)}
            {row.totalSessions === 0 ? '' : ` ${ADMIN_CUSTOMER_PROFILE.cycleColumns.sessions} ${toPersianDigits(row.totalSessions)}`}
          </span>
          {row.totalSessions === 0 ? null : <ProgressBar done={row.completedSessions} total={row.totalSessions} />}
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

/**
 * The bar a bounded course draws under its session count.
 *
 * The width is the row's own fraction and not a token: a course three quarters done
 * is three quarters full, and the only honest value is the computed one.
 */
/** The course's own spacing, as the week or the day the interval counts. */
function intervalLabel(intervalDays: number): string {
  if (intervalDays % 7 === 0) {
    return `${toPersianDigits(intervalDays / 7)} ${ADMIN_CUSTOMER_PROFILE.unitWeeks}`
  }
  return `${toPersianDigits(intervalDays)} ${ADMIN_CUSTOMER_PROFILE.unitDays}`
}

/** One course status, as the chip the column renders. */
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

/* ── The two histories ──────────────────────────────────────────────────────── */

/** The appointment history, as the profile's own table renders it. */
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
            <Th>{ADMIN_CUSTOMER_PROFILE.visitColumns.doctor}</Th>
            <Th>{ADMIN_CUSTOMER_PROFILE.visitColumns.status}</Th>
            <Th className="text-end">{ADMIN_CUSTOMER_PROFILE.visitColumns.amount}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-b-0">
              <td className="px-3 py-2 text-ink-2 tabular-nums">
                {formatDate(row.localDate as LocalDate, 'short')}
              </td>
              <td className="px-3 py-2 font-semibold text-ink">{row.serviceName ?? '—'}</td>
              <td className="px-3 py-2 text-ink-2">{row.doctorName ?? '—'}</td>
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

/** The payment history, as the profile's own table renders it. */
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
            <Th className="text-end">{CUSTOMER_PROFILE_PAGE.history.amount}</Th>
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
              <td className="px-3 py-2 text-end font-semibold text-ink tabular-nums">{formatMoney(row.amount)}</td>
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

/** One appointment status, as the badge the column renders. */
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

/* ── The facts, the groups, and the messages ─────────────────────────────────── */

/** The details card's own list, as the two-column `dl` the card renders. */
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
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.mobile} value={formatPhone(profile.mobile)} ltr />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.birthDate}
        value={formatBirthday(profile.birthDate)}
      />
      <Detail
        label={ADMIN_CUSTOMER_PROFILE.detailFields.firstVisit}
        value={profile.firstVisitAt === null ? null : formatDate(dateToLocalDate(profile.firstVisitAt), 'long')}
      />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.source} value={sourceLabel(profile.acquisitionSource)} />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.doctor} value={doctorName} />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.residence} value={profile.residenceArea} />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.medicalHistory} value={profile.medicalHistory} span />
      <Detail label={ADMIN_CUSTOMER_PROFILE.detailFields.sensitivities} value={profile.sensitivities} span />
    </dl>
  )
}

/** One labelled fact, or the dash a fact the row does not hold renders. */
function Detail({
  label,
  value,
  span,
  ltr,
}: {
  readonly label: string
  readonly value: string | null
  /** Whether the fact takes the grid's whole row. */
  readonly span?: boolean
  /** Whether the value is a Latin string the page must isolate. */
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

/** The groups this customer is in, as the badges the campaign card shows. */
function GroupBadges({ groups }: { readonly groups: readonly AudienceGroupKey[] }) {
  if (groups.length === 0) {
    return (
      <p className="mb-3 rounded-sm bg-surface-2 px-3 py-2 text-xs text-ink-3">
        {ADMIN_CUSTOMER_PROFILE.campaignEmpty}
      </p>
    )
  }

  const badges = groups.map((key) => (
    <span
      key={key}
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        key === AudienceGroupKey.Debtors
          ? 'bg-warn-bg text-warn'
          : key === AudienceGroupKey.CycleDue
            ? 'bg-danger-bg text-danger'
            : key === AudienceGroupKey.Loyal || key === AudienceGroupKey.New
              ? 'bg-brand-50 text-brand-700'
              : key === AudienceGroupKey.Birthday
                ? 'bg-ok-bg text-ok'
                : 'bg-neutral-bg text-ink-2',
      )}
    >
      {AUDIENCE_GROUP_LABELS[key]}
    </span>
  ))

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">{badges}</div>
      <p className="text-xs text-ink-3">{ADMIN_CUSTOMER_PROFILE.campaignHint}</p>
    </div>
  )
}

/**
 * The recent sends, as the messages card lists them.
 *
 * The count beside them is the window the sending frequency cap counts (`03-data-model.md`
 * §2.5's «۳ پیام در ۳۰ روز»), read from the same rows and not from a second query.
 */
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

/** One birthday, as the profile writes it: the day and the month, and no year. */
function formatBirthday(birthDate: string | null): string | null {
  if (birthDate === null) return null
  const { month, day } = jalaliParts(asLocalDate(birthDate))
  return `${toPersianDigits(day)} ${monthName(month)}`
}

/* ── The shared small pieces ─────────────────────────────────────────────────── */

/** The empty state the three tables share. */
function EmptyState({ sentence }: { readonly sentence: string }) {
  return <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">{sentence}</p>
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
      className={cx('whitespace-nowrap px-3 py-2 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}

/** One acquisition source, or the raw value a row the form never named renders. */
function sourceLabel(source: string | null): string | null {
  if (source === null) return null
  const key = source as keyof typeof ACQUISITION_SOURCE_LABELS
  return ACQUISITION_SOURCE_LABELS[key] ?? source
}

/** One payment method, from the app catalog's own three. */
function methodLabel(method: string): string {
  return isMember(PaymentMethod, method) ? PAYMENT_METHOD_LABELS[method] : method
}

/** One payment kind, from the app catalog's own four. */
function kindLabel(kind: string): string {
  return isMember(PaymentKind, kind) ? PAYMENT_KIND_LABELS[kind] : kind
}
