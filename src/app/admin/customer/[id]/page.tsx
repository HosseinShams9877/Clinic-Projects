/**
 * The customer profile — `02-architecture.md` §9's `admin/customer.html`.
 *
 * The one surface the customers module's full record renders on: the row, the two
 * history tables, the clinical note, and the consent flags. It is the manager panel's
 * page, which is where §9 puts it, and it is the page the file's name cell links to.
 *
 * ## Why a missing row is a 404 and not a 500
 *
 * `customerProfile` raises `NotFoundError` for a row that is outside the caller's
 * scope — another tenant's customer, or another doctor's patient when the caller
 * cannot see the whole file (`09-security.md` §6.3). The page catches that one error
 * and answers `notFound()`, because the honest answer to a person who opened a
 * profile they cannot see is the same page as one that does not exist. Every other
 * failure is the framework's own error page, which is where a bug belongs.
 *
 * ## Why the two history tables are here and not in the module's own surfaces
 *
 * The profile composes four modules' reads — `customers` for the row, and the
 * appointments and payments tables the module already joins inside its profile query
 * (`02-architecture.md` §9's row reads `customers` + `cycles`, `payments`, `debts`,
 * `messages`). The cycles and debts modules are not built, and the page renders the
 * two histories the module's query already carries rather than a placeholder for the
 * two it does not.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { prisma, runInTenantScope } from '@/core/db'
import {
  APPOINTMENT_STATUS_LABELS,
} from '@/modules/appointments'
import {
  ACQUISITION_SOURCE_LABELS,
} from '@/modules/customers'
import {
  AppointmentStatus,
  PaymentKind,
  PaymentMethod,
  isMember,
} from '@/core/constants'
import {
  dateToLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
  formatTime,
  renderMessage,
  toPersianDigits,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import { isAppError, NotFoundError } from '@/core/types'

import { CUSTOMER_PROFILE_PAGE } from '@/app/catalog'
import { loadCustomerProfile } from '@/app/_customers/page-data'
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/payments'
import {
  ConsentForm,
  DoctorNoteForm,
  ProfileEdit,
} from '@/app/_customers/profile-forms'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_PROFILE_PAGE.title }

/**
 * One customer's full record, or the 404 a row outside the caller's scope answers.
 */
export default async function CustomerProfilePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const session = await requireStaffPanel('admin')
  const { id } = await params

  const data = await loadProfile(session.permissions, id)

  const { profile } = data
  const name = profile.lastName === null ? profile.firstName : `${profile.firstName} ${profile.lastName}`
  const balance = profile.chargedTotal - profile.paidTotal

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {renderMessage(CUSTOMER_PROFILE_PAGE.title, { name })}
        </h1>
        <p className="text-sm text-ink-2">{CUSTOMER_PROFILE_PAGE.lead}</p>
      </div>

      <div className="flex flex-col gap-4 panel:flex-row panel:items-center panel:justify-between">
        <BalanceRow charged={profile.chargedTotal} paid={profile.paidTotal} balance={balance} />
        <ProfileEdit
          customerId={profile.id}
          firstName={profile.firstName}
          lastName={profile.lastName}
          birthDate={profile.birthDate}
          residenceArea={profile.residenceArea}
        />
      </div>

      <Section title={CUSTOMER_PROFILE_PAGE.sections.details}>
        <DetailsGrid>
          <Detail label={CUSTOMER_PROFILE_PAGE.fields.mobile} value={formatPhone(profile.mobile)} ltr />
          <Detail
            label={CUSTOMER_PROFILE_PAGE.fields.birthDate}
            value={profile.birthDate === null ? null : formatDate(profile.birthDate as LocalDate, 'long')}
          />
          <Detail
            label={CUSTOMER_PROFILE_PAGE.fields.acquisitionSource}
            value={sourceLabel(profile.acquisitionSource)}
          />
          <Detail
            label={CUSTOMER_PROFILE_PAGE.fields.residenceArea}
            value={profile.residenceArea}
          />
          <Detail label={CUSTOMER_PROFILE_PAGE.fields.primaryDoctor} value={data.primaryDoctorName} />
          <Detail label={CUSTOMER_PROFILE_PAGE.fields.primaryClinic} value={data.primaryClinicName} />
          <Detail
            label={CUSTOMER_PROFILE_PAGE.fields.firstVisit}
            value={profile.firstVisitAt === null ? null : formatDate(dateToLocalDate(profile.firstVisitAt), 'long')}
          />
          <Detail
            label={CUSTOMER_PROFILE_PAGE.fields.lastVisit}
            value={profile.lastVisitAt === null ? null : formatDate(dateToLocalDate(profile.lastVisitAt), 'long')}
          />
          <Detail
            label={CUSTOMER_PROFILE_PAGE.fields.completedSessions}
            value={toPersianDigits(profile.completedSessions)}
          />
        </DetailsGrid>
      </Section>

      <Section title={CUSTOMER_PROFILE_PAGE.sections.medical}>
        <div className="flex flex-col gap-4">
          <DetailsGrid>
            <Detail
              label={CUSTOMER_PROFILE_PAGE.fields.medicalHistory}
              value={profile.medicalHistory}
              span
            />
            <Detail
              label={CUSTOMER_PROFILE_PAGE.fields.sensitivities}
              value={profile.sensitivities}
              span
            />
          </DetailsGrid>
          <DoctorNoteForm customerId={profile.id} note={profile.doctorNote} />
        </div>
      </Section>

      <Section title={CUSTOMER_PROFILE_PAGE.sections.appointments}>
        <AppointmentHistory rows={profile.appointments} />
      </Section>

      <Section title={CUSTOMER_PROFILE_PAGE.sections.payments}>
        <PaymentHistory rows={profile.payments} />
      </Section>

      <Section title={CUSTOMER_PROFILE_PAGE.sections.consent}>
        <ConsentForm
          customerId={profile.id}
          flags={{
            sms: profile.consentSms,
            whatsApp: profile.consentWhatsApp,
            phone: profile.consentPhone,
            beforeAfter: profile.consentBeforeAfter,
          }}
        />
      </Section>
    </div>
  )
}

/**
 * The profile, read in the caller's scope, or the 404 a row outside it answers.
 *
 * The read runs in the tenant scope the shell already resolved, and the one error the
 * page answers itself is `NotFoundError` — the module's own 404 rule. Anything else
 * is a failure the framework's error page is the honest answer to.
 */
async function loadProfile(ctx: Parameters<typeof loadCustomerProfile>[0]['ctx'], customerId: string) {
  try {
    return await runInTenantScope(ctx, prisma(), (tx) =>
      loadCustomerProfile({ tx, ctx, customerId }),
    )
  } catch (error: unknown) {
    if (isAppError(error) && error instanceof NotFoundError) notFound()
    throw error
  }
}

/* ── The page's own sections ──────────────────────────────────────────────── */

/** One section, with the heading the profile's own catalog names. */
function Section({
  title,
  children,
}: {
  readonly title: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** The three money facts, as the row the profile opens with. */
function BalanceRow({
  charged,
  paid,
  balance,
}: {
  readonly charged: bigint
  readonly paid: bigint
  readonly balance: bigint
}) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <MoneyTerm label={CUSTOMER_PROFILE_PAGE.fields.chargedTotal} amount={charged} />
      <MoneyTerm label={CUSTOMER_PROFILE_PAGE.fields.paidTotal} amount={paid} />
      <MoneyTerm label={CUSTOMER_PROFILE_PAGE.fields.balance} amount={balance} emphasis />
    </dl>
  )
}

/** One money fact, as the profile's own `dl` renders it. */
function MoneyTerm({
  label,
  amount,
  emphasis,
}: {
  readonly label: string
  readonly amount: bigint
  readonly emphasis?: boolean
}) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={
          emphasis
            ? 'font-bold text-ink tabular-nums'
            : 'font-semibold text-ink-2 tabular-nums'
        }
      >
        {formatMoney(amount)}
      </dd>
    </>
  )
}

/** The details grid, two columns wide where the panel holds it. */
function DetailsGrid({ children }: { readonly children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-4 panel:grid-cols-2">{children}</dl>
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
    <div className={span ? 'col-span-1 panel:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd
        className={ltr ? 'mt-1 font-semibold text-ink tabular-nums' : 'mt-1 font-semibold text-ink'}
        dir={ltr ? 'ltr' : undefined}
      >
        {value ?? '—'}
      </dd>
    </div>
  )
}

/** The appointment history, as the profile's own table renders it. */
function AppointmentHistory({
  rows,
}: {
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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-ink-3">
            <Th>{CUSTOMER_PROFILE_PAGE.history.date}</Th>
            <Th>{CUSTOMER_PROFILE_PAGE.history.time}</Th>
            <Th>{CUSTOMER_PROFILE_PAGE.history.service}</Th>
            <Th>{CUSTOMER_PROFILE_PAGE.history.doctor}</Th>
            <Th>{CUSTOMER_PROFILE_PAGE.history.status}</Th>
            <Th className="text-end">{CUSTOMER_PROFILE_PAGE.history.price}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-b-0">
              <td className="px-3 py-2 text-ink-2 tabular-nums">
                {formatDate(row.localDate as LocalDate, 'short')}
              </td>
              <td className="px-3 py-2 text-ink-2 tabular-nums">
                {formatTime(row.localTime as LocalTime)}
              </td>
              <td className="px-3 py-2 font-semibold text-ink">{row.serviceName ?? '—'}</td>
              <td className="px-3 py-2 text-ink-2">{row.doctorName ?? '—'}</td>
              <td className="px-3 py-2 text-ink-2">{statusLabel(row.status)}</td>
              <td className="px-3 py-2 text-end font-semibold text-ink tabular-nums">
                {formatMoney(row.priceAtBooking)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The payment history, as the profile's own table renders it. */
function PaymentHistory({
  rows,
}: {
  readonly rows: ReadonlyArray<{
    readonly id: string
    readonly amount: bigint
    readonly paidAt: Date | null
    readonly method: string
    readonly kind: string
  }>
}) {
  if (rows.length === 0) {
    return <EmptyState sentence={CUSTOMER_PROFILE_PAGE.empty.payments} />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-ink-3">
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
              <td className="px-3 py-2 font-semibold text-ink tabular-nums">{formatMoney(row.amount)}</td>
              <td className="px-3 py-2 text-ink-2">{methodLabel(row.method)}</td>
              <td className="px-3 py-2 text-ink-2">{kindLabel(row.kind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The empty state both history tables share. */
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
      className={`whitespace-nowrap px-3 py-2 text-start text-xs font-semibold ${className ?? ''}`}
    >
      {children}
    </th>
  )
}

/* ── The four enumerations the history tables render ───────────────────────── */

/** One appointment status, or the code when the row holds one the catalog does not. */
function statusLabel(status: string): string {
  return isMember(AppointmentStatus, status) ? APPOINTMENT_STATUS_LABELS[status] : status
}

/** One acquisition source, or the dash a row the lead form never named renders. */
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
