/**
 * The lead lifecycle — `02-architecture.md` §7 gives `customers` the «کارتابل لید»
 * and the four states a lead passes through.
 *
 * A lead is a person the clinic has heard from and not yet served. The four states
 * (`06-constants.md`'s `LeadStatus`) are the cartable's own vocabulary, and the
 * cartable is `reception/leads.html`: the KPI row counts the four, the chips filter
 * by them, and the two actions a row carries — «تماس» and «نوبت» — are the two ways
 * a lead leaves the cartable.
 *
 * ## Why conversion is a state change and not a delete
 *
 * A converted lead does not leave the file: it becomes a customer (`§2.1`'s
 * `lifecycle` column flips, `leadStatus` becomes `CONVERTED`), and the row keeps the
 * `acquisitionSource` it was created with because that column is what the
 * acquisition report counts (`03-data-model.md` §2.1). Deleting a converted lead
 * would make every converted customer look like they arrived from nowhere, and would
 * destroy the one fact the marketing spend is justified by.
 *
 * The conversion itself happens in `lib/dedupe.ts`, on the booking path every lead
 * converts on. This file owns the cartable's reads and the two state changes a
 * person records at the desk: the follow-up note and the loss.
 *
 * ## Why `manage_leads` and not `view_all_customers`
 *
 * `04-roles-permissions.md` §3.4 maps `manage_leads` to this module's write
 * surface, and the doctor does not hold it — the lead cartable is the desk's. The
 * reads are `manage_leads` too, because a lead is a person who has not consented to
 * a record yet and the cartable is not the customer file.
 */

import { AcquisitionSource, isMember, LeadStatus } from '@/core/constants'
import type { TenantContext, TenantPrincipal } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { isValidMobile, normalizeMobile } from '@/core/localization'
import { NotFoundError, ValidationError, type AppErrorOptions } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { CustomersMessageKey } from '../catalog'

/** The columns the cartable renders. */
const LEAD_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  mobile: true,
  acquisitionSource: true,
  leadStatus: true,
  leadNextContactAt: true,
  createdAt: true,
} as const

/** One lead row, as the cartable renders it. */
export interface LeadRow {
  readonly id: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
  readonly acquisitionSource: string | null
  readonly leadStatus: string | null
  readonly leadNextContactAt: Date | null
  readonly createdAt: Date
}

/** The KPI row the cartable shows above the table. */
export interface LeadCounts {
  /** «بی‌پاسخ» — new, and not yet contacted. */
  readonly newCount: number
  /** «در حال پیگیری». */
  readonly followingCount: number
  /** «تبدیل شده این ماه». */
  readonly convertedCount: number
  /** «از دست رفته». */
  readonly lostCount: number
}

/**
 * The open leads the cartable lists — everyone whose lifecycle is still `LEAD`.
 *
 * Ordered by the next contact the desk owes them, so the person who has been
 * waiting longest is at the top. A lead with no `leadNextContactAt` sorts last,
 * which is where a brand-new lead belongs: the desk has not promised it anything yet.
 *
 * @throws PermissionError — the caller holds no `manage_leads`.
 */
export async function listLeads(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly LeadRow[]> {
  requireLeads(args.ctx)

  const rows = await args.tx.customer.findMany({
    where: { tenantId: args.ctx.tenantId, lifecycle: 'LEAD' },
    orderBy: [{ leadNextContactAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: LEAD_SELECT,
  })

  return rows.map(asLeadRow)
}

/**
 * The four numbers the KPI row shows.
 *
 * Read as four counts and not as one grouped query, because the four are four
 * separate badges a page renders independently and a grouped result would arrive as
 * a row per state the page then has to pivot. SQLite has no `FILTER` clause the two
 * engines share, so the four counts are four `where`s.
 *
 * @throws PermissionError — the caller holds no `manage_leads`.
 */
export async function leadCounts(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<LeadCounts> {
  requireLeads(args.ctx)
  const tenantId = args.ctx.tenantId

  const [newCount, followingCount, convertedCount, lostCount] = await Promise.all([
    args.tx.customer.count({
      where: { tenantId, lifecycle: 'LEAD', leadStatus: LeadStatus.New },
    }),
    args.tx.customer.count({
      where: { tenantId, lifecycle: 'LEAD', leadStatus: LeadStatus.Following },
    }),
    args.tx.customer.count({
      where: { tenantId, lifecycle: 'CUSTOMER', leadStatus: LeadStatus.Converted },
    }),
    args.tx.customer.count({
      where: { tenantId, lifecycle: 'LEAD', leadStatus: LeadStatus.Lost },
    }),
  ])

  return { newCount, followingCount, convertedCount, lostCount }
}

/**
 * «ثبت لید دستی» — the desk writes down a person who called or walked in.
 *
 * A lead is created by mobile, and a mobile the file already holds is not a new
 * lead: it is the existing person, and the desk is looking at their record. The
 * caller renders `customer.duplicateMobile` and links to the profile, which is
 * DoD 1's "offers the existing record instead of creating a duplicate".
 *
 * @throws PermissionError — the caller holds no `manage_leads`.
 * @throws ValidationError — the mobile is not a mobile, or the source is not one
 *   of the five the constants close.
 */
export async function createLead(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
  readonly acquisitionSource?: string
  readonly note?: string
}): Promise<LeadRow> {
  requireLeads(args.ctx)

  const mobile = normalizeMobile(args.mobile)
  if (!isValidMobile(mobile)) {
    throw customerValidationError(
      `The value ${JSON.stringify(args.mobile)} is not a valid mobile number.`,
      'customer.mobileInvalid',
      {},
    )
  }

  const source = sourceOrDefault(args.acquisitionSource)
  return createLeadRow(args, source)
}

/**
 * The public site's lead — the consultation form's submit.
 *
 * The same row and the same validation as the desk's `createLead`, without the desk's
 * `manage_leads`: the site holds no role, and the principal is the surface itself. The
 * source is fixed to `Website` here and is not an argument, because the form is the only
 * surface this path serves and a body that named a source would be a bucket the report
 * counts that the caller picked.
 */
export async function createPublicLead(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantPrincipal
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
  readonly note?: string
}): Promise<LeadRow> {
  return createLeadRow(args, AcquisitionSource.Website)
}

/** The write the two lead paths share, so the row they write is one shape. */
async function createLeadRow(
  args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext | TenantPrincipal
    readonly mobile: string
    readonly firstName: string
    readonly lastName?: string
    readonly note?: string
  },
  source: string | null,
): Promise<LeadRow> {
  const mobile = normalizeMobile(args.mobile)
  if (!isValidMobile(mobile)) {
    throw customerValidationError(
      `The value ${JSON.stringify(args.mobile)} is not a valid mobile number.`,
      'customer.mobileInvalid',
      {},
    )
  }

  const firstName = args.firstName.trim()
  const lastName = args.lastName?.trim() || null

  const created = await args.tx.customer.create({
    data: {
      tenantId: args.ctx.tenantId,
      mobile,
      firstName,
      lastName,
      searchName: `${firstName} ${lastName ?? ''}`,
      lifecycle: 'LEAD',
      leadStatus: LeadStatus.New,
      doctorNote: args.note?.trim() || null,
      acquisitionSource: source,
    },
    select: LEAD_SELECT,
  })

  return asLeadRow(created)
}

/**
 * «تماس» — the desk records that it followed a lead up.
 *
 * Moves the lead to `FOLLOWING` and stamps the next contact the desk owes, which is
 * what puts the row back at the top of the cartable. A lead already converted or
 * lost is left alone: a follow-up on a closed lead is a note on a customer, not a
 * state change here.
 *
 * @throws PermissionError — the caller holds no `manage_leads`.
 * @throws NotFoundError — the lead is outside the caller's tenant (`09-security.md`
 *   §6.3's 404-not-403 rule).
 */
export async function recordFollowUp(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly leadId: string
  readonly nextContactAt: Date
}): Promise<LeadRow> {
  requireLeads(args.ctx)

  const lead = await loadLead(args.tx, args.ctx, args.leadId)
  if (lead.lifecycle !== 'LEAD' || lead.leadStatus === LeadStatus.Converted) {
    throw customerValidationError(
      `Lead ${args.leadId} is ${lead.lifecycle}/${lead.leadStatus ?? 'null'} and cannot be followed up.`,
      'customer.notFound',
      { leadId: args.leadId },
    )
  }

  const updated = await args.tx.customer.update({
    where: { id: lead.id },
    data: {
      leadStatus: LeadStatus.Following,
      leadNextContactAt: args.nextContactAt,
    },
    select: LEAD_SELECT,
  })

  return asLeadRow(updated)
}

/**
 * «از دست رفته» — the desk closes a lead it could not reach.
 *
 * The row stays, with its source and its history, because a lost lead is still a
 * fact the acquisition report counts and a person who may come back. Nothing in
 * this module deletes a person.
 *
 * @throws PermissionError — the caller holds no `manage_leads`.
 * @throws NotFoundError — the lead is outside the caller's tenant.
 */
export async function markLeadLost(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly leadId: string
}): Promise<LeadRow> {
  requireLeads(args.ctx)

  const lead = await loadLead(args.tx, args.ctx, args.leadId)
  const updated = await args.tx.customer.update({
    where: { id: lead.id },
    data: { leadStatus: LeadStatus.Lost },
    select: LEAD_SELECT,
  })

  return asLeadRow(updated)
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** `manage_leads` — the permission the matrix gives the desk for this surface. */
function requireLeads(ctx: TenantContext): void {
  requirePermission(ctx, 'manage_leads')
}

/** One row as the cartable's own shape. */
function asLeadRow(row: LeadSelectRow): LeadRow {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    mobile: row.mobile,
    acquisitionSource: row.acquisitionSource,
    leadStatus: row.leadStatus,
    leadNextContactAt: row.leadNextContactAt,
    createdAt: row.createdAt,
  }
}

/** The shape Prisma hands back from `LEAD_SELECT`, named once so the mapper reads. */
type LeadSelectRow = {
  readonly id: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
  readonly acquisitionSource: string | null
  readonly leadStatus: string | null
  readonly leadNextContactAt: Date | null
  readonly createdAt: Date
}

/**
 * The source the constants close, or nothing.
 *
 * `AcquisitionSource` has five members and the form offers exactly those five, so an
 * unknown value is dropped rather than stored: a source the report does not
 * recognise is a bucket that counts nothing.
 */
function sourceOrDefault(source: string | undefined): string | null {
  if (source === undefined) return null
  return isMember(AcquisitionSource, source) ? source : null
}

/**
 * Loads one lead as the caller's tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant, which is
 *   `09-security.md` §6.3's 404-not-403 rule.
 */
async function loadLead(
  tx: TransactionClient,
  ctx: TenantContext,
  leadId: string,
): Promise<{ readonly id: string; readonly lifecycle: string; readonly leadStatus: string | null }> {
  const row = await tx.customer.findFirst({
    where: { id: leadId, tenantId: ctx.tenantId },
    select: { id: true, lifecycle: true, leadStatus: true },
  })
  if (row === null) {
    throw new NotFoundError(`Lead ${leadId} was not found in this tenant.`, {
      messageKey: 'customer.notFound' satisfies CustomersMessageKey,
      detail: { leadId },
    })
  }
  return row
}

/** A `ValidationError` carrying a catalog key, built once for the three raises. */
function customerValidationError(
  message: string,
  key: CustomersMessageKey,
  params: AppErrorOptions['messageParams'],
): never {
  throw new ValidationError(message, { messageKey: key, messageParams: params })
}
