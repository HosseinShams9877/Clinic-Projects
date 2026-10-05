/**
 * The `debts` module's types — the shape of a computed debt and the follow-up it carries.
 */

import type { DebtBucket } from '@/core/constants'

/** Every catalog key this module can raise. */
export type DebtsMessageKey =
  'debt.notFound' | 'debt.dueDateRequired' | 'debt.alreadySettled' | 'debt.cannotMoveDueDate'

/**
 * One row of the debtor list — an appointment that carries a balance, with the dates
 * the desk's follow-up needs.
 *
 * There is no `debts` table (`03-data-model.md` §4.3), so this object is what a debt
 * *is*: a computed view over an appointment and its payments. The `appointmentId` is
 * the row's own key, and the follow-up columns live on it.
 */
export interface DebtRow {
  readonly appointmentId: string
  readonly customerId: string
  readonly customerFirstName: string
  readonly customerLastName: string | null
  readonly customerMobile: string
  readonly doctorId: string
  readonly serviceId: string | null
  /** Σ `priceAtBooking` for this appointment. */
  readonly charged: bigint
  /** Σ `discountAmount` over its payments. */
  readonly discount: bigint
  /** Σ `amount` over its payments, `REFUND` rows negative. */
  readonly paid: bigint
  /** `charged − discount − paid`, computed and never stored. */
  readonly balance: bigint
  /** `scheduledAt + debtGraceDays`, as the local day the desk reads. */
  readonly dueLocalDate: string
  /** The follow-up the desk already recorded, if any. */
  readonly debtFollowUpAt: Date | null
  /** The next contact the desk promised, if any. */
  readonly debtNextContactAt: Date | null
  /** A due date the customer promised, overriding the computed one. */
  readonly debtDueDateOverride: Date | null
  /** The bucket the row is in, most severe first. */
  readonly bucket: DebtBucket
}

/** The four buckets, with the rows each one holds. */
export interface DebtBuckets {
  readonly overdue30: readonly DebtRow[]
  readonly overdue7: readonly DebtRow[]
  readonly overdue: readonly DebtRow[]
  readonly dueSoon: readonly DebtRow[]
}

/** The module's contract, for `05-conventions.md` §15.5's override registry. */
export interface DebtsModule {
  readonly name: 'debts'
}
