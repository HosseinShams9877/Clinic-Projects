/**
 * The `payments` module's complete public surface.
 */

export type {
  BalanceSummary,
  PaymentRow,
  PaymentsMessageKey,
  PaymentsModule,
  ReconciliationReport,
  RecordPaymentInput,
} from './types'

export {
  DEPOSIT_REFUND_POLICY_LABELS,
  MESSAGES,
  PAYMENT_FORM_MESSAGES,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
} from './catalog'

export { appointmentBalance, asBalance, customerBalance, isOwed } from './lib/balance'

export { cachedCustomerBalance, recomputeCustomerTotals } from './lib/cache'

export { assertDiscountAllowed } from './lib/discount'

export { customerCharges, customerLedger, customerPayments } from './lib/queries'

export { recordPayment, recordRefund, refundAmountFor } from './lib/record'

export { runReconciliation } from './lib/reconcile'

export {
  PAYMENTS_RECONCILE_JOB_KIND,
  RECONCILE_INTERVAL_MS,
  ensureReconcileJob,
  reconcileJobHandler,
} from './lib/job'

export { DEFAULT_PAYMENT_SETTINGS, readPaymentSettings, type PaymentSettings } from './lib/settings'

export {
  localDateField,
  paymentAmountField,
  recordPaymentSchema,
  type RecordPaymentForm,
} from './validation/record-payment'

export { paymentsThisMonth } from './lib/aggregate'