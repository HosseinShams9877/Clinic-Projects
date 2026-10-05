/**
 * The `payments` module's types — `02-architecture.md` §10 rule 2: the shapes the
 * barrel hands out are named here, and nothing else in the module invents one.
 */

import type { PaymentKind, PaymentMethod } from '@/core/constants'

/** Every catalog key this module can raise. */
export type PaymentsMessageKey =
  | 'payment.notFound'
  | 'payment.amountNotPositive'
  | 'payment.discountRefused'
  | 'payment.discountAboveCap'
  | 'payment.noRefundPolicy'
  | 'payment.nothingToRefund'
  | 'payment.discountNeedsReason'
  | 'payment.driftDetected'

/** One ledger row, as the customer's history renders it. */
export interface PaymentRow {
  readonly id: string
  readonly appointmentId: string
  readonly amount: bigint
  readonly discountAmount: bigint
  readonly discountReason: string | null
  readonly discountByUserId: string | null
  readonly method: PaymentMethod
  readonly kind: PaymentKind
  readonly note: string | null
  readonly paidAt: Date
}

/**
 * The three terms of `03-data-model.md` §4.1's formula, plus the balance itself.
 *
 * `balance` is computed and never stored; this object is the only shape the answer
 * takes, and it is built from the ledger every time.
 */
export interface BalanceSummary {
  /** Σ `appointments.priceAtBooking` over the scope the caller named. */
  readonly charged: bigint
  /** Σ `payments.discountAmount` over the same scope. */
  readonly discount: bigint
  /** Σ `payments.amount`, where a `REFUND` row is negative. */
  readonly paid: bigint
  /** `charged − discount − paid`, and never read from a column. */
  readonly balance: bigint
}

/** The facts a receipt records, as the desk's form collects them. */
export interface RecordPaymentInput {
  readonly appointmentId: string
  /** Positive. A `REFUND` is written through `recordRefund`, which negates it. */
  readonly amount: bigint
  readonly method: PaymentMethod
  readonly kind: PaymentKind
  /** Zero when the desk recorded no discount. */
  readonly discountAmount: bigint
  readonly discountReason: string | null
  readonly note: string | null
}

/** The reconciliation's own report, for the job's log and the failure it raises. */
export interface ReconciliationReport {
  readonly tenantsChecked: number
  readonly customersChecked: number
  readonly corrected: number
}

/** The module's contract, for `05-conventions.md` §15.5's override registry. */
export interface PaymentsModule {
  readonly name: 'payments'
}
