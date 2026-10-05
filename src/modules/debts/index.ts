/**
 * The `debts` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private."
 *
 * ## What is public
 *
 * 1. **The four buckets** — the three page reads (`contactList`, `clinicDebts`,
 *    `doctorDebts`) and the customer profile's own summary. Each holds `view_debts`.
 * 2. **The two writes** — `recordFollowUp` and `rescheduleDueDate`, both gated by
 *    `follow_up_debt`, and the complete list of what a debt may be written on.
 * 3. **The bucket arithmetic** — `bucketOf` and `effectiveDueInstant`, so a page that
 *    renders a row's bucket reads the same function the list built it with.
 *
 * ## What is deliberately not
 *
 * There is no `deleteDebt`, no `settleDebt`, no `voidDebt`. `03-data-model.md` §4.4
 * forbids a debt deletion path, and the absence is the rule — a debt is settled by a
 * payment, and `payments` is the only writer of that fact. The balance is never an
 * argument to a write here, because a module that took one would be trusting a number
 * a caller computed instead of the ledger it is computed from.
 *
 * The Prisma client is not re-exported; functions take a `TransactionClient` because the
 * caller opened the scope.
 */

export type { DebtBuckets, DebtRow, DebtsMessageKey, DebtsModule } from './types'

export { DEBT_BUCKET_LABELS, DEBT_BUCKET_ORDER, MESSAGES } from './catalog'

export { clinicDebts, contactList, customerDebts, doctorDebts } from './lib/queries'

export { recordFollowUp, rescheduleDueDate } from './lib/follow-up'

export { bucketOf, effectiveDueInstant } from './lib/buckets'

export { DEFAULT_DEBT_SETTINGS, readDebtSettings, type DebtSettings } from './lib/settings'
