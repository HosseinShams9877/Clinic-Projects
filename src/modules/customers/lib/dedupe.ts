/**
 * Mobile as the unique key, and the dedupe that key exists to enforce — DoD 1.
 *
 * `03-data-model.md` §2.1's Decision 1 makes the mobile the person's identity, and
 * `customer_mobile_key` on `(tenantId, mobile)` is the index that makes a second row
 * for the same person a write the database refuses. This file is the module layer
 * that sits in front of it: the caller asks for a person by mobile and name, and
 * gets back either the row the file already holds or a new one — never a duplicate,
 * and never a row that belongs to another tenant.
 *
 * ## Why the tenant is the caller's and never an argument
 *
 * `tenantId` comes from `ctx.tenantId`, which the caller's transaction is already
 * scoped to. The unique index is `(tenantId, mobile)` and not `mobile`, so the same
 * number in **two tenants is two people**, and the two are unrelated — a clinic's
 * customer and another clinic's customer who happen to share a number. A dedupe that
 * read the mobile without the tenant would offer a stranger's record, and a dedupe
 * that took the tenant as an argument would be a dedupe a caller could aim at a
 * tenant that is not theirs.
 *
 * The cross-tenant case (DoD 1's second half) therefore needs no code of its own:
 * the lookup is scoped to the caller's tenant, finds nothing, and creates. The test
 * asserts it, and the assertion that matters is the one that writes the other
 * tenant's row through the *unscoped* client first, because that is the only writer
 * the extension does not narrow.
 *
 * ## Why a found lead is converted here
 *
 * A lead is a person the clinic has spoken to and not yet served. The booking is the
 * first service, so a booking made against a LEAD row is the conversion
 * (`02-architecture.md` §7 gives `customers` the lead lifecycle), and doing it here
 * is what makes the conversion happen on the one path every booking takes rather
 * than on the paths a page happens to call. `acquisitionSource` is kept: the column
 * the lead was created with is the column the acquisition report counts, and a
 * conversion that cleared it would make every converted lead look like it arrived
 * from nowhere (DoD 2).
 *
 * ## Why no permission is checked here
 *
 * The two callers hold two different permissions: the booking path holds
 * `manage_appointments` and the lead desk holds `manage_leads`. A doctor's
 * quick-book — three permissions, none of them `manage_leads` — reaches this
 * function through the booking path, and requiring a customer permission here would
 * make the doctor's own shortcut unable to book a new person. The permission is the
 * caller's business and is checked at the caller; this function's invariant is the
 * key, and it is the one the index keeps.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import {
  CustomerLifecycle,
  LeadStatus,
} from '@/core/constants'
import {
  isValidMobile,
  normalizeForSearch,
  normalizeMobile,
} from '@/core/localization'
import { ValidationError } from '@/core/types'

import type { CustomersMessageKey } from '../catalog'

/** The columns a created or found row is read back with. */
const CUSTOMER_SELECT = {
  id: true,
  lifecycle: true,
  firstName: true,
  lastName: true,
  mobile: true,
  acquisitionSource: true,
} as const

/** The answer a caller gets: the person's id, and whether the file already had them. */
export interface DedupedCustomer {
  /** The customer id the caller writes its booking or its lead against. */
  readonly id: string
  /** Whether a row was created. `false` means the caller is looking at an existing person. */
  readonly created: boolean
  /** Whether a lead was converted to a customer by this call (DoD 2). */
  readonly convertedFromLead: boolean
  /** The person's name, for the sentence the caller renders when nothing was created. */
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
}

/**
 * The person behind a mobile — an existing row, or a new one.
 *
 * Same tenant and the mobile is known: the existing row, and `created: false`. Same
 * tenant and the mobile is a lead: the row, converted to `CUSTOMER`, with its
 * acquisition source kept. Different tenant: a new row, because `(tenantId, mobile)`
 * is the key and a second tenant's person is a second person.
 *
 * @throws ValidationError — the mobile is not a mobile. Raised here rather than on
 *   the form so the shape the column stores is the shape one place validates.
 */
export async function createOrFindCustomer(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
  /** How the person reached the clinic, kept through the conversion (DoD 2). */
  readonly acquisitionSource?: string
}): Promise<DedupedCustomer> {
  const mobile = normalizeMobile(args.mobile)
  if (!isValidMobile(mobile)) {
    throw new ValidationError(
      `The value ${JSON.stringify(args.mobile)} is not a valid mobile number.`,
      {
        messageKey: 'customer.mobileInvalid' satisfies CustomersMessageKey,
        detail: { tenantId: args.ctx.tenantId },
      },
    )
  }

  const existing = await args.tx.customer.findUnique({
    where: { tenantId_mobile: { tenantId: args.ctx.tenantId, mobile } },
    select: CUSTOMER_SELECT,
  })

  if (existing !== null) {
    if (existing.lifecycle !== CustomerLifecycle.Lead) {
      return { ...existing, created: false, convertedFromLead: false }
    }

    // «تبدیل شده» — the lead becomes a customer on the booking this call is making.
    // The source stays what it was; see the file header.
    await args.tx.customer.update({
      where: { id: existing.id },
      data: {
        lifecycle: CustomerLifecycle.Customer,
        leadStatus: LeadStatus.Converted,
        leadNextContactAt: null,
      },
    })
    return { ...existing, created: false, convertedFromLead: true }
  }

  const firstName = args.firstName.trim()
  const lastName = args.lastName?.trim() || null

  const created = await args.tx.customer.create({
    data: {
      tenantId: args.ctx.tenantId,
      mobile,
      firstName,
      lastName,
      searchName: normalizeForSearch(`${firstName} ${lastName ?? ''}`),
      lifecycle: CustomerLifecycle.Customer,
      acquisitionSource: args.acquisitionSource ?? null,
    },
    select: CUSTOMER_SELECT,
  })

  return { ...created, created: true, convertedFromLead: false }
}
