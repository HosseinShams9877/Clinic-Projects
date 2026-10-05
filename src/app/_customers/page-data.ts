/**
 * The reads the six Phase 3 surfaces share, in one place.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and the composition the
 * customer and lead pages have in common is not the table — each page renders its
 * own — but the reads behind it: the customer file under either of the two scopes,
 * the lead cartable with its counts, and the profile with the two names its row
 * carries as ids. Those are one transaction's worth of queries, written once so the
 * reception desk, the manager and the doctor do not drift apart on what a list holds.
 *
 * ## Why the two scopes are one function
 *
 * `searchCustomers` and `ownPatients` are the module's two answers to one question —
 * «پرونده مشتریان» — and the difference between them is a permission the caller
 * holds, not a page the caller is. The app tier picks one with a `scope` the three
 * pages each name, so the two queries are two arms of one read and a page cannot
 * reach for the wrong one without naming it.
 *
 * ## Why two names are read here and not in the module
 *
 * The profile's row carries `primaryDoctorId` and `primaryClinicId`, and the names
 * that render beside them belong to the `staff` and the clinic tables — tables
 * `customers` does not own and cannot reach (`02-architecture.md` §10 rule 2). A
 * join belongs in the app tier, which is the one place allowed to compose two
 * modules' rows; reading them in the same transaction is what keeps the two from
 * being a profile rendered against a membership that just changed.
 *
 * ## What is deliberately not here
 *
 * A row. Nothing here writes, because a page is a read and a write is an action
 * (`actions.ts`).
 */

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

/** The profile, plus the two names its row carries as ids. */
export interface CustomerProfileData {
  readonly profile: CustomerProfile
  readonly primaryDoctorName: string | null
  readonly primaryClinicName: string | null
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
    rows: args.status === undefined || args.status === '' ? rows : rows.filter((row) => row.leadStatus === args.status),
    counts,
  }
}

/**
 * One customer's profile, with the two names the row's ids point at.
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

  const [doctor, clinic] = await Promise.all([
    profile.primaryDoctorId === null
      ? Promise.resolve(null)
      : membershipName(args.tx, args.ctx.tenantId, profile.primaryDoctorId),
    profile.primaryClinicId === null
      ? Promise.resolve(null)
      : clinicName(args.tx, args.ctx.tenantId, profile.primaryClinicId),
  ])

  return { profile, primaryDoctorName: doctor, primaryClinicName: clinic }
}

/**
 * The doctor names the two customer surfaces render, keyed by membership id.
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
    names[row.id] = row.user.lastName === null ? row.user.firstName : `${row.user.firstName} ${row.user.lastName}`
  }
  return names
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
  return row.user.lastName === null ? row.user.firstName : `${row.user.firstName} ${row.user.lastName}`
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
