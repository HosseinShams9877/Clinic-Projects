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

/** The last follow-up the desk recorded on a debt. */
export interface LastFollowUp {
  readonly at: Date
  readonly note: string | null
}

/** One row of the debtor list — an appointment that carries a balance. */
export interface DebtRow {
  readonly appointmentId: string
  readonly customerId: string
  readonly customerFirstName: string
  readonly customerLastName: string | null
  readonly customerMobile: string
  readonly doctorId: string
  readonly doctorName: string
  readonly serviceId: string | null
  readonly serviceName: string | null
  readonly charged: bigint
  readonly discount: bigint
  readonly paid: bigint
  readonly balance: bigint
  readonly dueLocalDate: string
  readonly lastFollowUp: LastFollowUp | null
  readonly nextContactAt: Date | null
  readonly dueDateOverride: Date | null
  readonly bucket: DebtBucket
  readonly daysOverdue: number
  readonly totalInstallments: number
  readonly paidInstallments: number
  readonly installmentSequence: number
  readonly installmentAmount: bigint
  /** 👈 شناسه قسط باز مربوط به این بدهی (اگه قسطی باشه)، وگرنه null */
  readonly installmentId: string | null
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