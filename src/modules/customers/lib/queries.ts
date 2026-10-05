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
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { normalizeForSearch, normalizeMobile } from '@/core/localization'
import { NotFoundError } from '@/core/types'
import { can, requirePermission } from '@/modules/roles-permissions'

import type { CustomersMessageKey } from '../catalog'

/** The most a list page reads in one go; a clinic's customer file is not a page. */
const LIST_LIMIT = 100

/** The columns the list pages render. */
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
} as const

/** One customer row, as the list pages render it. */
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
}

/**
 * The customer file, searched by name or mobile.
 *
 * An empty query returns the tenant's customers by their last visit, which is the
 * order a desk works in; a query is matched against the normalised `searchName` and
 * the stored mobile, which is why the two are the two columns a search reads.
 *
 * @throws PermissionError — the caller holds neither customer permission.
 */
export async function searchCustomers(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly query?: string
}): Promise<readonly CustomerListRow[]> {
  requireCustomerRead(args.ctx)

  const query = args.query?.trim() ?? ''
  const where =
    query === ''
      ? { tenantId: args.ctx.tenantId }
      : {
          tenantId: args.ctx.tenantId,
          OR: [
            { searchName: { contains: normalizeForSearch(query) } },
            { mobile: { contains: normalizeMobile(query) } },
          ],
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
 * exists to serve. A patient the doctor has seen but who has no recorded primary
 * doctor is not in this list, which is the honest reading of «مراجعین من»: the
 * doctor's own patients, not the clinic's.
 *
 * @throws PermissionError — the caller holds no `view_own_customer_records`.
 */
export async function ownPatients(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly query?: string
}): Promise<readonly CustomerListRow[]> {
  requirePermission(args.ctx, 'view_own_customer_records')

  const query = args.query?.trim() ?? ''
  const where =
    query === ''
      ? { tenantId: args.ctx.tenantId, primaryDoctorId: args.ctx.userId }
      : {
          tenantId: args.ctx.tenantId,
          primaryDoctorId: args.ctx.userId,
          OR: [
            { searchName: { contains: normalizeForSearch(query) } },
            { mobile: { contains: normalizeMobile(query) } },
          ],
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
      birthDate: true,
      acquisitionSource: true,
      residenceArea: true,
      medicalHistory: true,
      sensitivities: true,
      doctorNote: true,
      firstVisitAt: true,
      chargedTotal: true,
      paidTotal: true,
      consentSms: true,
      consentWhatsApp: true,
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
    appointments: appointments.map((row) => ({
      id: row.id,
      scheduledAt: row.scheduledAt,
      localDate: row.localDate,
      localTime: row.localTime,
      status: row.status,
      priceAtBooking: row.priceAtBooking,
      serviceName: row.service?.name ?? null,
      doctorName:
        row.doctor.lastName === null
          ? row.doctor.firstName
          : `${row.doctor.firstName} ${row.doctor.lastName}`,
    })),
    payments,
  }
}

/** The profile's own shape: the row, plus the history the profile renders. */
export interface CustomerProfile extends CustomerListRow {
  readonly birthDate: string | null
  readonly acquisitionSource: string | null
  readonly residenceArea: string | null
  readonly medicalHistory: string | null
  readonly sensitivities: string | null
  readonly doctorNote: string | null
  readonly firstVisitAt: Date | null
  readonly chargedTotal: bigint
  readonly paidTotal: bigint
  readonly consentSms: boolean
  readonly consentWhatsApp: boolean
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
  }
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
}
