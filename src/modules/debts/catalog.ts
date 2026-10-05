/**
 * The Persian sentences `debts` raises, and the four bucket labels it renders.
 *
 * `05-conventions.md` §14: a Persian literal outside a catalog is a finding.
 * `07-localization.md` §8: a message names the fix.
 */

import { DebtBucket, type DebtBucket as DebtBucketKey } from '@/core/constants'
import type { DebtsMessageKey } from './types'

/** The sentence for each key — a key with no sentence is a compile error. */
export const MESSAGES: Readonly<Record<DebtsMessageKey, string>> = {
  // The appointment the action named is not in this tenant — the 404-not-403 rule.
  'debt.notFound': 'این بدهی پیدا نشد.',

  // A reschedule needs the day the customer promised; the fix is the picker.
  'debt.dueDateRequired': 'تاریخ جدید سررسید را انتخاب کنید.',

  // The balance is zero, so there is nothing to follow up on.
  'debt.alreadySettled': 'این بدهی تسویه شده است و قابل پیگیری نیست.',

  // Toggle 4 is off, so the desk may not move a due date; the manager turns it on.
  'debt.cannotMoveDueDate': 'تغییر سررسید توسط منشی غیرفعال است. مدیر باید آن را فعال کند.',
} satisfies Record<DebtsMessageKey, string>

/**
 * `03-data-model.md` §4.3's four buckets, in the severity order the list renders them.
 *
 * The order is the debt's own ladder: the most overdue row is the one the desk loses
 * the most by not calling, and the buckets are exclusive — a row lands in the first one
 * it qualifies for, which is what makes the four sets the four the desk sees.
 */
export const DEBT_BUCKET_LABELS: Readonly<Record<DebtBucketKey, string>> = {
  OVER_30_DAYS: 'بیش از ۳۰ روز',
  OVER_7_DAYS: 'بیش از ۷ روز',
  PAST_DUE: 'گذشته از سررسید',
  DUE_SOON: 'نزدیک سررسید',
}

/** The order the four lists are stacked in, most severe first. */
export const DEBT_BUCKET_ORDER: readonly DebtBucket[] = [
  DebtBucket.Over30Days,
  DebtBucket.Over7Days,
  DebtBucket.PastDue,
  DebtBucket.DueSoon,
]
