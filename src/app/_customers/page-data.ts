

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

import {
  customerProfile,
  leadCounts,
  listLeads,
  ownPatients,
  searchCustomers,
  type CustomerListRow,
  type CustomerProfile,
  type LeadCounts,
  type LeadRow,
} from '@/modules/customers'
import {
  customerInjections,
  injectionCounts,
  type InjectionCounts,
  type InjectionRow,
} from '@/modules/injections'

/** Either customer read permission; the page names which one it is rendering under. */
export type CustomerScope = 'all' | 'own'

/** The customer file, the scope it was read under, and the names its doctor column needs. */
export interface CustomersListData {
  readonly rows: readonly CustomerListRow[]
  /** The names the `primaryDoctorId` column renders, keyed by membership id. */
  readonly doctorNames: Readonly<Record<string, string>>
}

/** The lead cartable, its four counts, and the chip the URL carries. */
export interface LeadsCartableData {
  readonly rows: readonly LeadRow[]
  readonly counts: LeadCounts
}

/** The profile, plus the two names its row carries as ids, and its injections. */
export interface CustomerProfileData {
  readonly profile: CustomerProfile
  readonly primaryDoctorName: string | null
  readonly primaryClinicName: string | null
  /** The customer's injections, newest first — the «نقشه تزریق» tab's own read. */
  readonly injections: readonly InjectionRow[]
  /** The four counts above the injection table. */
  readonly injectionCounts: InjectionCounts
}

/**
 * The customer file under the scope the page names, searched by name or mobile.
 *
 * The doctor names are read alongside because the file's column renders one and the
 * module's row carries an id; a page that rendered the id would render a uuid and a
 * page that skipped the column would skip a fact the catalogue owns.
 */
export async function loadCustomersList(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly scope: CustomerScope
  readonly query?: string
}): Promise<CustomersListData> {
  const rows =
    args.scope === 'own'
      ? await ownPatients({ tx: args.tx, ctx: args.ctx, query: args.query })
      : await searchCustomers({ tx: args.tx, ctx: args.ctx, query: args.query })

  const ids = rows.map((row) => row.primaryDoctorId).filter((id): id is string => id !== null)
  return { rows, doctorNames: await loadDoctorNames(args.tx, args.ctx.tenantId, ids) }
}

/**
 * The lead cartable, filtered by the chip the URL carries.
 *
 * `listLeads` reads the whole cartable because the four counts are over the same four
 * states, and the chip narrows what the table renders — a filter in the app tier is
 * one fewer arm in a query the counts already need whole.
 */
export async function loadLeadsCartable(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly status?: string
}): Promise<LeadsCartableData> {
  const [rows, counts] = await Promise.all([
    listLeads({ tx: args.tx, ctx: args.ctx }),
    leadCounts({ tx: args.tx, ctx: args.ctx }),
  ])

  return {
    rows:
      args.status === undefined || args.status === ''
        ? rows
        : rows.filter((row) => row.leadStatus === args.status),
    counts,
  }
}

/**
 * One customer's profile, with the two names the row's ids point at and its
 * injections.
 *
 * @throws NotFoundError — the customer is outside the caller's tenant, or is another
 *   doctor's patient and the caller cannot see all customers (`09-security.md` §6.3).
 */
export async function loadCustomerProfile(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
}): Promise<CustomerProfileData> {
  const profile = await customerProfile({
    tx: args.tx,
    ctx: args.ctx,
    customerId: args.customerId,
  })

  const [doctor, clinic, injections, counts] = await Promise.all([
    profile.primaryDoctorId === null
      ? Promise.resolve(null)
      : membershipName(args.tx, args.ctx.tenantId, profile.primaryDoctorId),
    profile.primaryClinicId === null
      ? Promise.resolve(null)
      : clinicName(args.tx, args.ctx.tenantId, profile.primaryClinicId),
    customerInjections({ tx: args.tx, ctx: args.ctx, customerId: args.customerId }),
    injectionCounts({ tx: args.tx, ctx: args.ctx, customerId: args.customerId }),
  ])

  return {
    profile,
    primaryDoctorName: doctor,
    primaryClinicName: clinic,
    injections,
    injectionCounts: counts,
  }
}

/**
 * The doctor names the customer surfaces render, keyed by **membership** id.
 *
 * `Customer.primaryDoctorId` points at a `Membership`, so the id a customer row
 * carries is a membership id and the lookup is against `membership`. A row that
 * carries a `User.id` instead (`Appointment.doctorId`, and through it `DebtRow` and
 * `CycleRow`) uses `loadDoctorNamesByUserId` below.
 *
 * Read once for a whole list so a file of a hundred customers is one query for its
 * doctor column and not a hundred; the ids the column holds are the memberships the
 * tenant has, so the read is bounded by the staff the tenant employs.
 */
export async function loadDoctorNames(
  tx: TransactionClient,
  tenantId: string,
  ids: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (ids.length === 0) return {}
  const rows = await tx.membership.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, tenantId: true, user: { select: { firstName: true, lastName: true } } },
  })
  if (rows.length === 0) return {}
  const names: Record<string, string> = {}
  for (const row of rows) {
    if (row.tenantId !== tenantId) continue
    names[row.id] =
      row.user.lastName === null ? row.user.firstName : `${row.user.firstName} ${row.user.lastName}`
  }
  return names
}

/**
 * The doctor names the debts and cycles surfaces render, keyed by **user** id.
 *
 * `loadDoctorNames` keys by membership id, which is what `Customer.primaryDoctorId`
 * holds. `DebtRow.doctorId` and `CycleRow.doctorId` are different: they come from
 * `Appointment.doctorId`, which is a `User.id` and not a `Membership.id`. The two
 * ids are one person described by two tables, and a lookup that used the wrong one
 * returned `{}` for every id — which is why the debts page's doctor column read
 * «پزشک» before this read existed.
 *
 * Read once for a whole list, and scoped to the tenant: the ids the column holds are
 * the users the tenant has, so the read is bounded by the staff the tenant employs.
 */
export async function loadDoctorNamesByUserId(
  tx: TransactionClient,
  tenantId: string,
  ids: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (ids.length === 0) return {}
  const rows = await tx.user.findMany({
    where: { id: { in: [...ids] }, tenantId },
    select: { id: true, firstName: true, lastName: true },
  })
  const names: Record<string, string> = {}
  for (const row of rows) {
    names[row.id] = row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
  }
  return names
}

/**
 * The customer ids → mobiles map, for the pages that render a cycle or a debt beside
 * the person it belongs to.
 *
 * The cycles and debts reads carry `customerId` and not the mobile, because the module
 * that owns the row owns its own columns and the mobile is the customer module's; the
 * app tier looks it up here, the same way `loadDoctorNames` covers the doctor column.
 * The read is bounded by the rows the page already holds and scoped to the tenant, so a
 * page cannot dial a number that is not its own customer's.
 */
export async function loadCustomerMobiles(
  tx: TransactionClient,
  tenantId: string,
  ids: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (ids.length === 0) return {}
  const rows = await tx.customer.findMany({
    where: { id: { in: [...ids] }, tenantId },
    select: { id: true, mobile: true },
  })
  return Object.fromEntries(rows.map((row) => [row.id, row.mobile]))
}

/** One membership's person's name, or `null` when the row is not the caller's tenant's. */
async function membershipName(
  tx: TransactionClient,
  tenantId: string,
  membershipId: string,
): Promise<string | null> {
  const row = await tx.membership.findFirst({
    where: { id: membershipId },
    select: { tenantId: true, user: { select: { firstName: true, lastName: true } } },
  })
  if (row === null || row.tenantId !== tenantId) return null
  return row.user.lastName === null
    ? row.user.firstName
    : `${row.user.firstName} ${row.user.lastName}`
}

/** One clinic's name, or `null` when the row is not the caller's tenant's. */
async function clinicName(
  tx: TransactionClient,
  tenantId: string,
  clinicId: string,
): Promise<string | null> {
  const row = await tx.clinic.findFirst({
    where: { id: clinicId },
    select: { tenantId: true, name: true },
  })
  if (row === null || row.tenantId !== tenantId) return null
  return row.name
}