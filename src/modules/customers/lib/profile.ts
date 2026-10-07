/**
 * The profile's own writes — the consent flags, the clinical note, and the facts a
 * desk edits on an existing person.
 *
 * ## Why consent is a write the customer module owns
 *
 * Immutable rule 5 (`02-architecture.md`): customer consent outranks the clinic. The
 * four flags on `Customer` are what a send is checked against, so the write that
 * flips one is the write the notifications module will read, and it belongs with the
 * record it is about. A `ConsentRecord` row is written beside each change because the
 * flag alone does not say *when* or *how* the consent was given — the row is the
 * evidence, and a withdrawn consent is a row with `revokedAt` set rather than a
 * deleted row (§6 of the schema notes).
 *
 * ## Why the four flags are one call and not four
 *
 * The profile renders the four as one group of checkboxes and the desk submits them
 * together, so the module takes one object. A call that flipped only one flag would
 * leave the other three stale on the page that rendered them, and the four are one
 * consent decision a person makes about how the clinic may reach them.
 *
 * ## Why no `messageKey` on the not-found here
 *
 * `recordConsent` and `updateCustomerNote` load through the same 404 rule as the
 * profile read (`09-security.md` §6.3), so they raise the catalog key the profile
 * page already renders and not a second sentence for the same fact.
 */

import { Channel } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { NotFoundError } from '@/core/types'
import { can, requirePermission } from '@/modules/roles-permissions'

import type { CustomersMessageKey } from '../catalog'

/** The four channel-consent flags the profile renders. */
export interface ConsentFlags {
  readonly sms: boolean
  readonly whatsApp: boolean
  readonly phone: boolean
  readonly beforeAfter: boolean
}

/** The columns a consent write reads back, to render the row it just wrote. */
export const CONSENT_SELECT = {
  id: true,
  consentSms: true,
  consentWhatsApp: true,
  consentPhone: true,
  consentBeforeAfter: true,
} as const

/** The four flags as the profile's own shape. */
export interface ConsentRow {
  readonly id: string
  readonly consentSms: boolean
  readonly consentWhatsApp: boolean
  readonly consentPhone: boolean
  readonly consentBeforeAfter: boolean
}

/**
 * «تنظیمات ارسال» — how the clinic may reach this person.
 *
 * Writes the four flags and a `ConsentRecord` row per channel that changed, so a flag
 * flip is always accompanied by the evidence row §6 requires. A channel that did not
 * change gets no row, because a consent record is a decision and not a restatement.
 *
 * @throws PermissionError — the caller holds neither customer permission.
 * @throws NotFoundError — the customer is outside the caller's scope (`09-security.md`
 *   §6.3; a doctor may set consent on their own patient and not on another's).
 */
export async function recordConsent(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
  readonly flags: ConsentFlags
  /** How the consent was obtained, for the evidence row's `source`. */
  readonly source?: string
  /** When the consent was recorded; the caller's clock, and never the wall's. */
  readonly now: Date
}): Promise<ConsentRow> {
  requireCustomerRead(args.ctx)

  const row = await args.tx.customer.findFirst({
    where: customerScope(args.ctx, args.customerId),
    select: { ...CONSENT_SELECT },
  })
  if (row === null) {
    throw notFound(args.customerId)
  }

  return writeConsent(args.tx, {
    tenantId: args.ctx.tenantId,
    customerId: args.customerId,
    before: row,
    flags: args.flags,
    source: args.source ?? null,
    now: args.now,
  })
}

/**
 * The four flags and their evidence rows, written once for both callers.
 *
 * The desk's `recordConsent` and the panel's `recordOwnConsent` authorize differently
 * — a permission for the desk, ownership for the panel — and write identically, which
 * is what keeps a consent change's evidence rows the same fact whichever surface made
 * it. The row the caller already read is the `before`, so the two halves of the
 * decision — what changed, and what it changed to — are one read and not two that a
 * concurrent write could come between.
 */
export async function writeConsent(
  tx: TransactionClient,
  args: {
    readonly tenantId: string
    readonly customerId: string
    /** The row the caller's own scope check already produced. */
    readonly before: ConsentSelectRow
    readonly flags: ConsentFlags
    readonly source: string | null
    readonly now: Date
  },
): Promise<ConsentRow> {
  const updated = await tx.customer.update({
    where: { id: args.customerId },
    data: {
      consentSms: args.flags.sms,
      consentWhatsApp: args.flags.whatsApp,
      consentPhone: args.flags.phone,
      consentBeforeAfter: args.flags.beforeAfter,
    },
    select: CONSENT_SELECT,
  })

  const changes = changedChannels(args.before, args.flags)
  if (changes.length > 0) {
    await tx.consentRecord.createMany({
      data: changes.map(({ channel, granted }) => ({
        tenantId: args.tenantId,
        customerId: args.customerId,
        channel,
        granted,
        source: args.source ?? null,
        grantedAt: args.now,
        revokedAt: granted ? null : args.now,
      })),
    })
  }

  return updated
}

/**
 * «یادداشت پزشک» — the clinical note the profile holds.
 *
 * The note is the one free-text field a doctor writes about a person, so the doctor's
 * own read is enough to write it: a doctor who may see the record may annotate it. A
 * secretary holds `view_all_customers` and reaches this function too, because the
 * note is also where the desk records what a caller said.
 *
 * @throws PermissionError — the caller holds neither customer permission.
 * @throws NotFoundError — the customer is outside the caller's scope.
 */
export async function updateCustomerNote(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
  readonly note: string | null
}): Promise<void> {
  requireCustomerRead(args.ctx)

  const row = await args.tx.customer.findFirst({
    where: customerScope(args.ctx, args.customerId),
    select: { id: true },
  })
  if (row === null) {
    throw notFound(args.customerId)
  }

  await args.tx.customer.update({
    where: { id: args.customerId },
    data: { doctorNote: args.note?.trim() || null },
  })
}

/**
 * «ویرایش پرونده» — the facts the desk edits on an existing person.
 *
 * The mobile is deliberately **not** an input here: the mobile is the person's
 * identity (`customer_mobile_key`), and changing it is a dedupe decision
 * `lib/dedupe.ts` owns. A name change rewrites `searchName`, because the column is
 * the search and not a display field.
 *
 * @throws PermissionError — the caller holds neither customer permission.
 * @throws NotFoundError — the customer is outside the caller's scope.
 */
export async function updateCustomerProfile(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
  readonly firstName?: string
  readonly lastName?: string | null
  readonly birthDate?: string | null
  readonly residenceArea?: string | null
  readonly medicalHistory?: string | null
  readonly sensitivities?: string | null
}): Promise<void> {
  requireCustomerRead(args.ctx)

  const row = await args.tx.customer.findFirst({
    where: customerScope(args.ctx, args.customerId),
    select: { id: true, firstName: true, lastName: true },
  })
  if (row === null) {
    throw notFound(args.customerId)
  }

  const firstName = args.firstName?.trim() ?? row.firstName
  const lastName = args.lastName === undefined ? row.lastName : (args.lastName?.trim() || null)
  const searchName = `${firstName} ${lastName ?? ''}`.trim()

  await args.tx.customer.update({
    where: { id: args.customerId },
    data: {
      firstName,
      lastName,
      searchName,
      birthDate: args.birthDate === undefined ? undefined : (args.birthDate || null),
      residenceArea: args.residenceArea === undefined ? undefined : (args.residenceArea || null),
      medicalHistory: args.medicalHistory === undefined ? undefined : (args.medicalHistory || null),
      sensitivities: args.sensitivities === undefined ? undefined : (args.sensitivities || null),
    },
  })
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/**
 * Either customer read permission — the same rule the profile read applies, so a
 * doctor's own patient and the clinic's file are one function and two scopes.
 */
function requireCustomerRead(ctx: TenantContext): void {
  if (can(ctx, 'view_all_customers')) return
  requirePermission(ctx, 'view_own_customer_records')
}

/**
 * The `where` one customer write reads through — the tenant, and the doctor's own
 * patients when the caller cannot see the whole file.
 *
 * Kept in step with `lib/queries.ts`'s `customerScope` by hand: the two are the same
 * rule, and a third copy would be a place the 404 boundary could drift.
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

/** The 404 a customer write raises — the same sentence the read path raises. */
function notFound(customerId: string): NotFoundError {
  return new NotFoundError(`Customer ${customerId} was not found in the caller's scope.`, {
    messageKey: 'customer.notFound' satisfies CustomersMessageKey,
    detail: { customerId },
  })
}

/**
 * The channels whose flag actually changed, each with its new value.
 *
 * A channel that kept its value is not a decision and gets no evidence row; a channel
 * that flipped to `false` gets `revokedAt`, which is what a send is checked against.
 *
 * Only the two message channels get a row: `Channel` has `SMS` and `WHATSAPP`, and the
 * other two flags — a phone call and a photograph — are not messages the system sends,
 * so there is no channel for a `ConsentRecord` to name. The flags themselves are all
 * four written above.
 */
function changedChannels(
  before: ConsentSelectRow,
  after: ConsentFlags,
): readonly { readonly channel: string; readonly granted: boolean }[] {
  const changes: { channel: string; granted: boolean }[] = []
  if (before.consentSms !== after.sms) changes.push({ channel: Channel.Sms, granted: after.sms })
  if (before.consentWhatsApp !== after.whatsApp) {
    changes.push({ channel: Channel.WhatsApp, granted: after.whatsApp })
  }
  return changes
}

/** The shape Prisma hands back from `CONSENT_SELECT`, named once so the mapper reads. */
type ConsentSelectRow = {
  readonly id: string
  readonly consentSms: boolean
  readonly consentWhatsApp: boolean
  readonly consentPhone: boolean
  readonly consentBeforeAfter: boolean
}
