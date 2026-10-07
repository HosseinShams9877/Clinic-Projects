/**
 * The customer's own record — `09-security.md` §7's panel half of this module.
 *
 * The four reads and two writes the account panel's `dashboard.html`, `care.html` and
 * `profile.html` are built on. Like `appointments/lib/own-panel.ts`, the guard here is
 * a `where` clause and not a permission: §7 gives the customer panel no permission
 * primitive at all, because a customer's scope is their own `customerId` and not a
 * capability. The session resolved that id, these functions receive it, and a request
 * that named another customer's record finds nothing and raises the 404 the module
 * raises for a row outside the caller's scope.
 *
 * ## Why the consent write is here twice
 *
 * `recordConsent` in `lib/profile.ts` is the desk's path: it authorizes by a staff
 * permission and scopes by it, which is the right rule for a receptionist editing
 * someone's file. The customer's path authorizes by ownership — the only person who
 * may flip a customer's consent flags is the customer — and it writes the same flags
 * and the same evidence rows through the same `writeConsent` helper, so the two paths
 * cannot drift on what a consent change writes. §7 is explicit that the customer's
 * write set includes granting and revoking their own consent, and immutable rule 5
 * makes that revocation immediate everywhere a send is checked.
 *
 * ## What the panel does not read
 *
 * The doctor's note, the acquisition source, the staff-side medical history fields a
 * desk edits. Those are the clinic's view of the person; the panel is the person's own
 * view of their care and their consent, and a page that rendered the clinic's notes
 * would be a page rendering a document the audience never wrote.
 */

import type { TransactionClient } from '@/core/db/scope'
import { NotFoundError } from '@/core/types'

import type { CustomersMessageKey } from '../catalog'
import { CONSENT_SELECT, writeConsent } from './profile'
import type { ConsentFlags, ConsentRow } from './profile'

/** The profile the panel renders, which is the person's own facts and their consent. */
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

/** The care the panel's `care.html` renders, one card per service the person has had. */
export interface OwnCareInstruction {
  readonly id: string
  readonly serviceName: string
  readonly afterCare: string | null
  readonly beforeCare: string | null
}

/**
 * «پروفایل من» — the customer's own row, or `null` when the record is gone.
 *
 * The session resolved a customer, so a `null` here is a record the clinic removed
 * after the session opened; the page renders its empty state rather than a 404,
 * because the person is signed in and the honest answer is that the file is gone.
 */
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

/**
 * «ویرایش پروفایل» — the facts the customer edits themselves.
 *
 * The mobile is not an input, for the same reason `updateCustomerProfile` refuses it:
 * the mobile is the person's identity and the key the panel's own login resolves by.
 * A customer changing their own mobile is a dedupe decision the desk owns, and the
 * panel's form does not offer the field.
 *
 * @throws NotFoundError — the record is not in this tenant.
 */
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

/**
 * «تنظیمات ارسال» — the customer's own consent, granted or revoked.
 *
 * Writes the four flags and a `ConsentRecord` evidence row per message channel that
 * changed, through the same helper the desk's `recordConsent` uses. A revocation
 * writes `revokedAt`, which is what a send is checked against, so the suppression is
 * immediate on the next dispatch rather than on the next settings screen.
 *
 * @throws NotFoundError — the record is not in this tenant.
 */
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

/**
 * «دستورالعمل‌های مراقبتی» — the aftercare the clinic wrote for the services this
 * person has actually had.
 *
 * The catalogue's care text is public, but the panel shows the person the instructions
 * for *their own* treatments, so the read joins through the person's cycles and
 * appointments rather than listing the catalogue. A service with no care text is
 * absent, because a card with no body is not an instruction.
 */
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
