/**
 * The `payments` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private."
 *
 * ## What is public
 *
 * 1. **The writers** — `recordPayment` and `recordRefund`, the only two functions in
 *    the product that write a row to `payments`. `03-data-model.md` §2.5 is explicit
 *    that there is no delete path; a correction is a new `REFUND` row, which is the
 *    second writer above and not a third.
 * 2. **The balance** — `customerBalance` and `appointmentBalance`, the reads §4.1's
 *    formula is computed in, plus `asBalance` for the one caller that already holds the
 *    three terms.
 * 3. **The cache** — `recomputeCustomerTotals` and `cachedCustomerBalance`, the
 *    recomputable sums §4.3 permits and the reconciliation keeps honest.
 * 4. **The reconciliation and its job** — `runReconciliation`, the handler the worker
 *    registry builds, and `ensureReconcileJob`, the seed a settings write calls.
 * 5. **The reads** — the customer's ledger, for «پرداخت‌های من».
 * 6. **The guard and the settings it reads** — `assertDiscountAllowed` and
 *    `refundAmountFor`, so the two policy decisions a page has to render are the
 *    module's own and not a re-derivation in the form.
 *
 * ## What is deliberately not
 *
 * The Prisma client is not re-exported; functions take a `TransactionClient` because
 * the caller opened the scope. `depositReceived` is private — a refund reads it, and a
 * caller that needed the number would be recomputing a ledger the module already
 * summed. And there is no `deletePayment`, `removePayment`, `voidPayment` or any other
 * name for a deletion: §2.5 forbids one, and the absence is the rule.
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
