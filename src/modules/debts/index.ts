// src/modules/debts/index.ts

/**
 * The `debts` module's complete public surface.
 */

export type { DebtBuckets, DebtRow, DebtsMessageKey, DebtsModule, LastFollowUp } from './types'

export { DEBT_BUCKET_LABELS, DEBT_BUCKET_ORDER, MESSAGES } from './catalog'

export { clinicDebts, contactList, customerDebts, doctorDebts } from './lib/queries'

export { recordFollowUp, rescheduleDueDate, getFollowUpsForAppointment } from './lib/follow-up'

export { bucketOf, daysOverdueOf, effectiveDueInstant } from './lib/buckets'

export { DEFAULT_DEBT_SETTINGS, readDebtSettings, type DebtSettings } from './lib/settings'