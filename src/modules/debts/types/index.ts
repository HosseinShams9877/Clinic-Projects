/**
 * The `debts` module's types — the shape of a computed debt and the follow-up it carries.
 */

import type { DebtBucket } from '@/core/constants'

/** Every catalog key this module can raise. */
export type DebtsMessageKey =
  | 'debt.notFound'
  | 'debt.dueDateRequired'
  | 'debt.alreadySettled'
  | 'debt.cannotMoveDueDate'
  | 'debt.noteTooLong'

/**
 * The last follow-up the desk recorded on a debt — the call it made, and what was
 * said on it.
 *
 * Kept as one object rather than two columns on the row so that "there is a
 * follow-up" is the object's own existence and not a truthiness check on a date
 * that could be null for two different reasons. `note` is the sentence the desk
 * wrote down and the next call reads back; it is optional, because a secretary in
 * a hurry may skip it, and a call with no comment is not an incomplete follow-up —
 * `at` is what says the call happened.
 */
export interface LastFollowUp {
  /** When the desk made the call — the instant `debtFollowUpAt` stores. */
  readonly at: Date
  /** What the desk wrote down on the call; `null` when it skipped the note. */
  readonly note: string | null
}

/**
 * One row of the debtor list — an appointment that carries a balance, with the
 * dates the desk's follow-up needs.
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
  readonly doctorName: string
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
  /**
   * The last follow-up the desk recorded, if any — the call and the note it left.
   * `null` when the desk has never called about this debt.
   */
  readonly lastFollowUp: LastFollowUp | null
  /** The next contact the desk promised, if any. */
  readonly nextContactAt: Date | null
  /** A due date the customer promised, overriding the computed one. */
  readonly dueDateOverride: Date | null
  /** The bucket the row is in, most severe first. */
  readonly bucket: DebtBucket
  /**
   * Whole days the debt is past its due date, at the read's own `now`. `0` when the
   * debt is due today; negative when the due date has not arrived.
   */
  readonly daysOverdue: number
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