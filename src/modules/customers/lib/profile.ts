/**
 * The profile's own writes — the consent flags, the clinical note, and the facts a
 * desk edits on an existing person.
 */

import { Channel } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { NotFoundError } from '@/core/types'
import { can, requirePermission } from '@/modules/roles-permissions'

import type { CustomersMessageKey } from '../catalog'

export interface ConsentFlags {
  readonly sms: boolean
  readonly whatsApp: boolean
  readonly phone: boolean
  readonly beforeAfter: boolean
}

export const CONSENT_SELECT = {
  id: true,
  consentSms: true,
  consentWhatsApp: true,
  consentPhone: true,
  consentBeforeAfter: true,
} as const

export interface ConsentRow {
  readonly id: string
  readonly consentSms: boolean
  readonly consentWhatsApp: boolean
  readonly consentPhone: boolean
  readonly consentBeforeAfter: boolean
}

export async function recordConsent(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
  readonly flags: ConsentFlags
  readonly source?: string
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

export async function writeConsent(
  tx: TransactionClient,
  args: {
    readonly tenantId: string
    readonly customerId: string
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

  const text = args.note?.trim()
  if (!text) return

  await args.tx.customerNote.create({
    data: {
      tenantId: args.ctx.tenantId,
      customerId: args.customerId,
      authorId: args.ctx.userId,
      text,
    },
  })
}

export interface CustomerNoteRow {
  readonly id: string
  readonly text: string
  readonly createdAt: Date
  readonly authorName: string | null
}

export async function getCustomerNotes(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<readonly CustomerNoteRow[]> {
  const rows = await args.tx.customerNote.findMany({
    where: { tenantId: args.tenantId, customerId: args.customerId },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { firstName: true, lastName: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    createdAt: row.createdAt,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName ?? ''}`.trim() : null,
  }))
}

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

function requireCustomerRead(ctx: TenantContext): void {
  if (can(ctx, 'view_all_customers')) return
  requirePermission(ctx, 'view_own_customer_records')
}

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

function notFound(customerId: string): NotFoundError {
  return new NotFoundError(`Customer ${customerId} was not found in the caller's scope.`, {
    messageKey: 'customer.notFound' satisfies CustomersMessageKey,
    detail: { customerId },
  })
}

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

type ConsentSelectRow = {
  readonly id: string
  readonly consentSms: boolean
  readonly consentWhatsApp: boolean
  readonly consentPhone: boolean
  readonly consentBeforeAfter: boolean
}