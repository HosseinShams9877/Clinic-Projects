/**
 * The customer's own record — `09-security.md` §7's panel half of this module.
 */

import type { TransactionClient } from '@/core/db/scope'
import { NotFoundError } from '@/core/types'

import type { CustomersMessageKey } from '../catalog'
import { CONSENT_SELECT, writeConsent } from './profile'
import type { ConsentFlags, ConsentRow, CustomerNoteRow } from './profile'

export interface OwnProfile {
  readonly id: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
  readonly birthDate: string | null
  readonly residenceArea: string | null
  readonly consentSms: boolean
  readonly consentWhatsApp: boolean
  readonly consentPhone: boolean
  readonly consentBeforeAfter: boolean
}

export interface OwnCareInstruction {
  readonly id: string
  readonly serviceName: string
  readonly afterCare: string | null
  readonly beforeCare: string | null
}

export async function readOwnProfile(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<OwnProfile | null> {
  const row = await args.tx.customer.findFirst({
    where: { id: args.customerId, tenantId: args.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mobile: true,
      birthDate: true,
      residenceArea: true,
      consentSms: true,
      consentWhatsApp: true,
      consentPhone: true,
      consentBeforeAfter: true,
    },
  })
  if (row === null) return null
  return Object.freeze(row)
}

export async function updateOwnProfile(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly firstName?: string
  readonly lastName?: string | null
  readonly birthDate?: string | null
  readonly residenceArea?: string | null
}): Promise<void> {
  const row = await args.tx.customer.findFirst({
    where: { id: args.customerId, tenantId: args.tenantId },
    select: { id: true, firstName: true, lastName: true },
  })
  if (row === null) {
    throw new NotFoundError(`Customer ${args.customerId} was not found in this tenant.`, {
      messageKey: 'customer.notFound' satisfies CustomersMessageKey,
      detail: { customerId: args.customerId },
    })
  }

  const firstName = args.firstName?.trim() ?? row.firstName
  const lastName = args.lastName === undefined ? row.lastName : (args.lastName?.trim() || null)

  await args.tx.customer.update({
    where: { id: args.customerId },
    data: {
      firstName,
      lastName,
      searchName: `${firstName} ${lastName ?? ''}`.trim(),
      birthDate: args.birthDate === undefined ? undefined : (args.birthDate || null),
      residenceArea: args.residenceArea === undefined ? undefined : (args.residenceArea || null),
    },
  })
}

export async function recordOwnConsent(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly flags: ConsentFlags
  readonly now: Date
}): Promise<ConsentRow> {
  const row = await args.tx.customer.findFirst({
    where: { id: args.customerId, tenantId: args.tenantId },
    select: CONSENT_SELECT,
  })
  if (row === null) {
    throw new NotFoundError(`Customer ${args.customerId} was not found in this tenant.`, {
      messageKey: 'customer.notFound' satisfies CustomersMessageKey,
      detail: { customerId: args.customerId },
    })
  }

  return writeConsent(args.tx, {
    tenantId: args.tenantId,
    customerId: args.customerId,
    before: row,
    flags: args.flags,
    source: 'customer-panel',
    now: args.now,
  })
}

export async function ownCareInstructions(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<readonly OwnCareInstruction[]> {
  const [fromCycles, fromAppointments] = await Promise.all([
    args.tx.treatmentCycle.findMany({
      where: { tenantId: args.tenantId, customerId: args.customerId },
      select: { service: { select: { id: true, name: true, afterCare: true, beforeCare: true } } },
    }),
    args.tx.appointment.findMany({
      where: {
        tenantId: args.tenantId,
        customerId: args.customerId,
        isSlotBlock: false,
        serviceId: { not: null },
      },
      select: { service: { select: { id: true, name: true, afterCare: true, beforeCare: true } } },
    }),
  ])

  const seen = new Set<string>()
  const out: OwnCareInstruction[] = []
  for (const { service } of [...fromCycles, ...fromAppointments]) {
    if (service === null || seen.has(service.id) || service.afterCare === null) continue
    seen.add(service.id)
    out.push(
      Object.freeze({
        id: service.id,
        serviceName: service.name,
        afterCare: service.afterCare,
        beforeCare: service.beforeCare,
      }),
    )
  }
  return out
}

export async function getOwnNotes(args: {
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