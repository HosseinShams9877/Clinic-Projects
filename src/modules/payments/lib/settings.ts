/**
 * The tenant's three financial settings, read from `TenantSettings`.
 *
 * `03-data-model.md` §6 puts them on the tenant's own row, and §4.4 names the two
 * that gate a payment: the discount ceiling that bounds toggle 3, and the refund
 * policy that decides what a cancellation hands back. Both are NULL-able, and for
 * each one NULL is a decision the clinic has not made rather than a value — a
 * secretary with no ceiling may not discount at all, and a clinic with no refund
 * policy may not refund at all.
 */

import { DepositRefundPolicy, DEFAULT_CLINIC_UTC_OFFSET_MINUTES, isMember } from '@/core/constants'
import { TOGGLE_DEFAULTS, Toggle } from '@/modules/roles-permissions'
import type { TransactionClient } from '@/core/db/scope'

/** The columns this module reads, named once so a rename touches one select. */
const SETTINGS_SELECT = {
  secretaryDiscountCap: true,
  depositRefundPolicy: true,
  toggles: true,
  utcOffsetMinutes: true,
} as const

/** What a payment path asks of the tenant's settings, resolved once per write. */
export interface PaymentSettings {
  /** Toggle 3 — whether a discount may be recorded at all (`04-roles-permissions.md` §4). */
  readonly discountAllowed: boolean
  /** «سقف تخفیف منشی» — NULL is no ceiling, which for a secretary is no discount. */
  readonly secretaryDiscountCap: bigint | null
  /** §4.4's policy — NULL is no refund until the manager sets one. */
  readonly depositRefundPolicy: DepositRefundPolicy | null
  readonly utcOffsetMinutes: number
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = Object.freeze({
  discountAllowed: TOGGLE_DEFAULTS[Toggle.SecretaryDiscount],
  secretaryDiscountCap: null,
  depositRefundPolicy: null,
  utcOffsetMinutes: DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
})

/** The tenant's settings, or the documented defaults when the row is absent. */
export async function readPaymentSettings(
  tx: TransactionClient,
  tenantId: string,
): Promise<PaymentSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: SETTINGS_SELECT,
  })
  if (row === null) return DEFAULT_PAYMENT_SETTINGS

  return Object.freeze({
    ...DEFAULT_PAYMENT_SETTINGS,
    discountAllowed: toggleOrDefault(row.toggles, Toggle.SecretaryDiscount),
    secretaryDiscountCap: row.secretaryDiscountCap,
    depositRefundPolicy: policyOrDefault(row.depositRefundPolicy),
    utcOffsetMinutes: row.utcOffsetMinutes,
  })
}

/** One toggle out of the JSON blob, or its documented default when the blob cannot answer. */
function toggleOrDefault(stored: string | null, key: Toggle): boolean {
  if (stored === null) return TOGGLE_DEFAULTS[key]
  try {
    const parsed: unknown = JSON.parse(stored) as unknown
    if (parsed === null || typeof parsed !== 'object') return TOGGLE_DEFAULTS[key]
    const value: unknown = (parsed as Record<string, unknown>)[key]
    return typeof value === 'boolean' ? value : TOGGLE_DEFAULTS[key]
  } catch {
    return TOGGLE_DEFAULTS[key]
  }
}

/** The stored policy when it is one of the three, else `null` — no policy, no refund. */
function policyOrDefault(stored: string | null): DepositRefundPolicy | null {
  if (stored !== null && isMember(DepositRefundPolicy, stored)) return stored
  return null
}
