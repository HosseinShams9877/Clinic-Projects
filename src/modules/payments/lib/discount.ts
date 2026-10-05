/**
 * The discount guard — DoD 5 and immutable rule 7.
 *
 * `04-roles-permissions.md` §4's toggle 3 is not a permission: it says how much
 * authority a person has *inside* the payment page, and `can()` deliberately does not
 * read it. This file is where the payment path asks it, and the answer is two checks:
 *
 * - **The toggle off refuses any discount at all** — manager included, because the
 *   toggle is the clinic's decision about its own prices and not a per-person one.
 * - **The secretary's cap bounds the amount** — «سقف تخفیف منشی», a separate field
 *   (`04-roles-permissions.md` §4). NULL is no ceiling set, which for a secretary is
 *   no discount at all. A manager is not bounded by the secretary's ceiling.
 *
 * A discount that fails either check throws, and the receipt is never written — the
 * guard runs before the row, not after it.
 */

import { DomainError } from '@/core/types'
import { Role } from '@/core/constants'

import type { PaymentSettings } from './settings'

/**
 * Refuses a discount the tenant does not allow, and names why.
 *
 * @throws DomainError — `payment.discountRefused` when toggle 3 is off;
 *   `payment.discountAboveCap` when a secretary passes the ceiling.
 */
export function assertDiscountAllowed(args: {
  readonly settings: PaymentSettings
  /** The person recording the receipt, whose role the cap reads. */
  readonly role: Role
  readonly amount: bigint
}): void {
  if (!args.settings.discountAllowed) {
    throw new DomainError('Discount recording is disabled for this tenant', {
      messageKey: 'payment.discountRefused',
    })
  }
  if (args.amount <= 0n) return

  if (args.role === Role.Secretary) {
    const cap = args.settings.secretaryDiscountCap
    if (cap === null || args.amount > cap) {
      throw new DomainError(
        `Discount of ${args.amount} exceeds the secretary ceiling of ${cap ?? 'unset'}`,
        { messageKey: 'payment.discountAboveCap' },
      )
    }
  }
}
