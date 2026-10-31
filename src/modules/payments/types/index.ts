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
  | 'payment.installmentNotFound'
  | 'payment.installmentCountInvalid'

/** One ledger row, as the customer's history renders it. */
export interface PaymentRow {
  readonly id: string
  readonly appointmentId: string
  readonly installmentId?: string | null
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
  /** Optional installment this receipt is allocated to. */
  readonly installmentId?: string | null
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

/**
 * مرحله‌ای که یک خطِ پرداخت به آن نسبت داده می‌شود — «قسط ۲ از ۴»، «چک»، یا
 * برچسبِ نوعِ خودِ پرداخت وقتی قسطی در کار نیست.
 */
export type PaymentLineStage =
  | { readonly kind: 'INSTALLMENT'; readonly sequence: number; readonly total: number }
  | { readonly kind: 'CHEQUE' }
  | { readonly kind: 'PAYMENT'; readonly label: string }

/**
 * یک خطِ پرداخت در گزارشِ مالی — ردیفِ جدولِ «جزئیات پرداخت».
 *
 * `stage` توسط `appointmentPaymentLines` از جمعِ تجمعیِ پرداخت‌های هر طرح ساخته
 * می‌شود، چون جدول `Payment` شماره‌ی مرحله را ذخیره نمی‌کند.
 */
export interface PaymentLine {
  readonly id: string
  readonly appointmentId: string
  readonly installmentId: string | null
  /** نامِ مشتری، برای ستونِ اولِ جدول. */
  readonly customerName: string
  /** مرحله‌ای که این پرداخت به آن تعلق دارد — `قسط ۲ از ۴` یا `چک`. */
  readonly stage: PaymentLineStage
  /** مبلغِ پرداخت‌شده به ریال؛ برای `REFUND` منفی است. */
  readonly amount: bigint
  readonly method: PaymentMethod
  /** تاریخِ پرداخت — `paidAt`. */
  readonly paidAt: Date
}

/** خلاصه‌ی درآمدِ یک بازه — همان چیزی که `financialSummary` برمی‌گرداند. */
export interface FinancialSummaryReport {
  readonly gross: bigint
  readonly discounts: bigint
  readonly refunds: bigint
  readonly paymentCount: number
  readonly refundCount: number
  readonly byMethod: ReadonlyArray<{
    readonly method: PaymentMethod
    readonly amount: bigint
    readonly count: number
  }>
}

/** The module's contract, for `05-conventions.md` §15.5's override registry. */
export interface PaymentsModule {
  readonly name: 'payments'
}