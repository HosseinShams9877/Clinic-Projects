/**
 * The customer queries — the list, the search, and the one profile the three
 * customer pages render.
 *
 * ## The 404-not-403 rule, and why it is here
 *
 * `04-roles-permissions.md` §3.4 states the boundary, and `lib/matrix.ts`'s
 * `requirePermission` points here:
 *
 * > The 404 rule is applied where §3.4 says it applies — a doctor opening another
 * > doctor's patient — and that check lives in the module that owns the customer
 * > query.
 *
 * So `customerById` is the one function in this module that answers `NotFoundError`
 * for a row that *does* exist. A doctor holds `view_own_customer_records` and not
 * `view_all_customers` (`04-roles-permissions.md` §2.1's three), and the question
 * they are asking — «پرونده مراجعین خودش» — is scoped to their own patients by the
 * `primaryDoctorId` column `customer_tenant_doctor_idx` exists to serve. Another
 * doctor's patient is outside that scope, and `09-security.md` §6.3 makes the answer
 * a 404: a 403 would confirm the record exists, and the doctor has no need to know
 * that a person who is not their patient is somebody's patient.
 *
 * A manager and a secretary hold `view_all_customers` and read the row unscoped. The
 * two surfaces are the two permissions, and the one function serves both because the
 * scope is a `where` clause and not a second query.
 *
 * ## Why the searches normalise
 *
 * The `searchName` column holds `normalizeForSearch`'s output, which folds the
 * Arabic/Yeh and kaf variants and the whitespace a typed name carries, so «كياني»
 * and «کیانی» are one row (`01-tech-stack.md` §8.4). A query that compared the raw
 * typed text against it would miss every customer whose name was entered on a
 * keyboard with a different layout, which is most of them.
 *
 * ## Why the query is split into tokens
 *
 * A whole-string `contains` required the typed text to appear in the stored name in
 * the same order, so «حسن نیلو» found nothing and a two-word mobile number found
 * nothing. The search now splits on whitespace and requires **every** token, which
 * makes «حسن نیلو» find «نیلوفر حسن‌زاده» and «۹۱۲ ۳۳» find a mobile that carries
 * both fragments. Each token is folded the same way the stored column was, so the
 * comparison stays one normalisation and not two.
 *
 * ## Why `doctorNote` is in the list select
 *
 * The profile renders the note beside the row, and the list row's own shape is what
 * the profile spreads — so the column the profile renders has to be one the list
 * select carries, or the spread silently drops it. The `asListRow` mapper names it,
 * and the profile reads the same field from the same shape.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { normalizeForSearch, normalizeMobile } from '@/core/localization'
import { NotFoundError } from '@/core/types'
import { can, requirePermission } from '@/modules/roles-permissions'

import type { CustomersMessageKey } from '../catalog'

/** The most a list page reads in one go; a clinic's customer file is not a page. */
const LIST_LIMIT = 100

/**
 * The columns the list pages render.
 *
 * The five the manager's own file adds — `birthDate`, `acquisitionSource`, the two
 * money totals and the WhatsApp consent — are here and not in a second `select`
 * because the file is one read and the two pages that render it are two scopes of it;
 * a desk that does not show the columns still carries the fields, which is cheaper
 * than a second query the manager's page would have had to open on its own.
 *
 * `doctorNote` is here because the profile spreads the list row and re-declares
 * nothing the mapper drops — a field the profile renders but the select omitted
 * would be a field the spread silently set to `undefined`.
 */
const LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  mobile: true,
  lifecycle: true,
  leadStatus: true,
  primaryDoctorId: true,
  lastVisitAt: true,
  completedSessions: true,
  isActive: true,
  birthDate: true,
  acquisitionSource: true,
  chargedTotal: true,
  paidTotal: true,
  consentWhatsApp: true,
  doctorNote: true,
} as const

/**
 * One customer row, as the list pages render it.
 *
 * The five fields the manager's file renders are additive: a page that does not show
 * them ignores them, and the profile spreads the same row and re-declares the three
 * it renders beside (`CustomerProfile extends CustomerListRow`).
 */
export interface CustomerListRow {
  readonly id: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
  readonly lifecycle: string
  readonly leadStatus: string | null
  readonly primaryDoctorId: string | null
  readonly lastVisitAt: Date | null
  readonly completedSessions: number
  readonly isActive: boolean
  /** The Jalali-ISO `LocalDate` the profile holds, or `null` when it was never taken. */
  readonly birthDate: string | null
  readonly acquisitionSource: string | null
  /** The rial the customer has been charged, the column the manager's balance cell reads. */
  readonly chargedTotal: bigint
  /** The rial the customer has paid, which the balance cell subtracts from the charged. */
  readonly paidTotal: bigint
  /** Whether the customer consented to WhatsApp, which the file's «پیام» cell answers. */
  readonly consentWhatsApp: boolean
  /** The clinical note the profile's own card renders. */
  readonly doctorNote: string | null
}

/**
 * The customer file, searched by name or mobile.
 *
 * An empty query returns the tenant's customers by their last visit, which is the
 * order a desk works in; a query is split into whitespace-separated tokens and
 * **every** token must match the normalised `searchName` or the mobile, so
 * «حسن نیلو» finds «نیلوفر حسن‌زاده» and «۹۱۲» finds every mobile that carries it.
 *
 * @throws PermissionError — the caller holds neither customer permission.
 */
export async function searchCustomers(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly query?: string
}): Promise<readonly CustomerListRow[]> {
  requireCustomerRead(args.ctx)

  const tokens = tokenizeQuery(args.query)
  const where =
    tokens.length === 0
      ? { tenantId: args.ctx.tenantId }
      : {
          tenantId: args.ctx.tenantId,
          AND: tokens.map((token) => ({
            OR: [
              { searchName: { contains: token } },
              { mobile: { contains: token } },
            ],
          })),
        }

  const rows = await args.tx.customer.findMany({
    where,
    orderBy: { lastVisitAt: { sort: 'desc', nulls: 'last' } },
    take: LIST_LIMIT,
    select: LIST_SELECT,
  })

  return rows.map(asListRow)
}

/**
 * The doctor's own patients — `doctor/customers.html`, `view_own_customer_records`.
 *
 * Scoped by `primaryDoctorId`, which is the column `customer_tenant_doctor_idx`
 * exists to serve. The search splits on whitespace and requires every token, the
 * same way `searchCustomers` does — the two reads ask one question and answer it
 * the same way.
 *
 * @throws PermissionError — the caller holds no `view_own_customer_records`.
 */
export async function ownPatients(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly query?: string
}): Promise<readonly CustomerListRow[]> {
  requirePermission(args.ctx, 'view_own_customer_records')

  const tokens = tokenizeQuery(args.query)
  const where =
    tokens.length === 0
      ? { tenantId: args.ctx.tenantId, primaryDoctorId: args.ctx.userId }
      : {
          tenantId: args.ctx.tenantId,
          primaryDoctorId: args.ctx.userId,
          AND: tokens.map((token) => ({
            OR: [
              { searchName: { contains: token } },
              { mobile: { contains: token } },
            ],
          })),
        }

  const rows = await args.tx.customer.findMany({
    where,
    orderBy: { lastVisitAt: { sort: 'desc', nulls: 'last' } },
    take: LIST_LIMIT,
    select: LIST_SELECT,
  })

  return rows.map(asListRow)
}

/**
 * One customer's profile — `admin/customer.html`'s full record.
 *
 * Carries the facts the profile renders beside the row: the appointment history, the
 * payments, the consent flags and the doctor the person sees. The cycle list is the
 * `cycles` module's and is not read here — Phase 4 composes it, and reading it now
 * would put a query in this module that the module that owns the table should hold.
 *
 * @throws PermissionError — the caller holds neither customer permission.
 * @throws NotFoundError — the customer is outside the caller's tenant, or is another
 *   doctor's patient and the caller cannot see all customers (`09-security.md` §6.3).
 */
export async function customerProfile(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
}): Promise<CustomerProfile> {
  requireCustomerRead(args.ctx)

  const row = await args.tx.customer.findFirst({
    where: customerScope(args.ctx, args.customerId),
    select: {
      ...LIST_SELECT,
      residenceArea: true,
      medicalHistory: true,
      sensitivities: true,
      firstVisitAt: true,
      consentSms: true,
      consentPhone: true,
      consentBeforeAfter: true,
      primaryClinicId: true,
    },
  })
  if (row === null) {
    throw notFound(args.customerId)
  }

  const [appointments, payments] = await Promise.all([
    args.tx.appointment.findMany({
      where: { tenantId: args.ctx.tenantId, customerId: args.customerId, isSlotBlock: false },
      orderBy: { scheduledAt: 'desc' },
      take: 20,
      select: {
        id: true,
        scheduledAt: true,
        localDate: true,
        localTime: true,
        status: true,
        priceAtBooking: true,
        service: { select: { name: true } },
        doctor: { select: { firstName: true, lastName: true } },
      },
    }),
    args.tx.payment.findMany({
      where: { tenantId: args.ctx.tenantId, customerId: args.customerId },
      orderBy: { paidAt: 'desc' },
      take: 20,
      select: { id: true, amount: true, paidAt: true, method: true, kind: true },
    }),
  ])

  return {
    ...asListRow(row),
    birthDate: row.birthDate,
    acquisitionSource: row.acquisitionSource,
    residenceArea: row.residenceArea,
    medicalHistory: row.medicalHistory,
    sensitivities: row.sensitivities,
    doctorNote: row.doctorNote,
    firstVisitAt: row.firstVisitAt,
    chargedTotal: row.chargedTotal,
    paidTotal: row.paidTotal,
    consentSms: row.consentSms,
    consentWhatsApp: row.consentWhatsApp,
    consentPhone: row.consentPhone,
    consentBeforeAfter: row.consentBeforeAfter,
    primaryClinicId: row.primaryClinicId,
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      localDate: appointment.localDate,
      localTime: appointment.localTime,
      status: appointment.status,
      priceAtBooking: appointment.priceAtBooking,
      serviceName: appointment.service?.name ?? null,
      doctorName:
        appointment.doctor.lastName === null
          ? appointment.doctor.firstName
          : `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
    })),
    payments,
  }
}

/** The profile's own shape: the row, plus the history the profile renders. */
export interface CustomerProfile extends CustomerListRow {
  readonly residenceArea: string | null
  readonly medicalHistory: string | null
  readonly sensitivities: string | null
  readonly firstVisitAt: Date | null
  readonly consentSms: boolean
  readonly consentPhone: boolean
  readonly consentBeforeAfter: boolean
  readonly primaryClinicId: string | null
  readonly appointments: readonly AppointmentHistoryRow[]
  readonly payments: readonly PaymentHistoryRow[]
}

/** One row of the profile's appointment history. */
export interface AppointmentHistoryRow {
  readonly id: string
  readonly scheduledAt: Date
  readonly localDate: string
  readonly localTime: string
  readonly status: string
  readonly priceAtBooking: bigint
  readonly serviceName: string | null
  readonly doctorName: string | null
}

/** One row of the profile's payment history. */
export interface PaymentHistoryRow {
  readonly id: string
  readonly amount: bigint
  readonly paidAt: Date | null
  readonly method: string
  readonly kind: string
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/**
 * Either customer read permission, and the one that was held decides the scope.
 *
 * The doctor's own read is the narrower and is what `customerScope` narrows by; the
 * clinic-wide read is what a manager and a secretary hold.
 */
function requireCustomerRead(ctx: TenantContext): void {
  if (can(ctx, 'view_all_customers')) return
  requirePermission(ctx, 'view_own_customer_records')
}

/**
 * The `where` one customer query reads through — the tenant, and the doctor's own
 * patients when the caller cannot see the whole file.
 *
 * This is the one place the 404 rule's scope is written, and the reason it is a
 * helper rather than two queries: a doctor and a manager ask the same question and
 * get different `where` clauses, never a different function.
 */
function customerScope(ctx: TenantContext, customerId: string): {
  readonly id: string
  readonly tenantId: string
  readonly primaryDoctorId?: string
} {
  if (can(ctx, 'view_all_customers')) {
    return { id: customerId, tenantId: ctx.tenantId }
  }
  return { id: customerId, tenantId: ctx.tenantId, primaryDoctorId: ctx.userId }
}

/** The 404 a customer query raises, with no information about who else holds the row. */
function notFound(customerId: string): NotFoundError {
  return new NotFoundError(`Customer ${customerId} was not found in the caller's scope.`, {
    messageKey: 'customer.notFound' satisfies CustomersMessageKey,
    detail: { customerId },
  })
}

/** One row as the list pages' own shape. */
function asListRow(row: ListSelectRow): CustomerListRow {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    mobile: row.mobile,
    lifecycle: row.lifecycle,
    leadStatus: row.leadStatus,
    primaryDoctorId: row.primaryDoctorId,
    lastVisitAt: row.lastVisitAt,
    completedSessions: row.completedSessions,
    isActive: row.isActive,
    birthDate: row.birthDate,
    acquisitionSource: row.acquisitionSource,
    chargedTotal: row.chargedTotal,
    paidTotal: row.paidTotal,
    consentWhatsApp: row.consentWhatsApp,
    doctorNote: row.doctorNote,
  }
}

/**
 * The typed query as the tokens each must match.
 *
 * The search reads one token per word and requires all of them, so a name typed in
 * either order finds the same row and a mobile typed in part of its digits finds it
 * too. A token that is only digits is folded with `normalizeMobile` — which folds
 * the Persian and Arabic digits to Latin and strips the country prefix — and every
 * other token is folded with `normalizeForSearch`, which is the same fold the
 * stored column went through. An all-whitespace query is no tokens at all.
 */
function tokenizeQuery(query: string | undefined): readonly string[] {
  if (query === undefined) return []
  return query
    .trim()
    .split(/\s+/)
    .map((token) =>
      /^[\d\u06F0-\u06F9\u0660-\u0669]+$/.test(token)
        ? normalizeMobile(token)
        : normalizeForSearch(token),
    )
    .filter((token) => token !== '')
}

/** The shape Prisma hands back from `LIST_SELECT`, named once so the mapper reads. */
type ListSelectRow = {
  readonly id: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
  readonly lifecycle: string
  readonly leadStatus: string | null
  readonly primaryDoctorId: string | null
  readonly lastVisitAt: Date | null
  readonly completedSessions: number
  readonly isActive: boolean
  readonly birthDate: string | null
  readonly acquisitionSource: string | null
  readonly chargedTotal: bigint
  readonly paidTotal: bigint
  readonly consentWhatsApp: boolean
  readonly doctorNote: string | null
}