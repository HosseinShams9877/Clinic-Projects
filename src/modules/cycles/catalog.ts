/**
 * The Persian sentences and labels `cycles` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the exemptions the rule
 * names. Everything else in the module references these by key, and the three pages
 * reach them through the barrel.
 *
 * ## The sentences, and the fix each one names
 *
 * `07-localization.md` §8 requires a message to name the **fix**:
 *
 * | Key | The fix it names |
 * | `cycle.notFound` | The list moved underneath the action; reload the page. |
 * | `cycle.closed` | The cycle already ended, so there is nothing to record on it. |
 * | `cycle.reasonNotFromList` | Pick one of the six reasons the manager analyses. |
 * | `cycle.notBookable` | The service is no longer offered; choose another from the catalogue. |
 *
 * ## Why the abandonment sentence names the list
 *
 * `abandonmentReason` is a closed list because the specification says free text is
 * not analysable and the list is what tells the manager whether the problem is price
 * or outcome (`03-data-model.md` §2.4.1 rule 6). The sentence therefore does not say
 * "invalid value" — it says to choose from the list, which is the thing the person
 * can actually do, and the six are rendered beside it on the page from
 * `ABANDONMENT_REASON_LABELS`.
 */

import type { AbandonmentReason, CycleStatus } from '@/core/constants'



/** Every catalog key this module can raise. */
export type CyclesMessageKey =
  | 'cycle.notFound'
  | 'cycle.closed'
  | 'cycle.reasonNotFromList'
  | 'cycle.notBookable'
  | 'cycle.noInterval'

/**
 * The sentence for each key.
 *
 * Typed as a `Record` over the union, so a key with no sentence is a compile error
 * rather than an empty string on a screen.
 */
export const MESSAGES: Readonly<Record<CyclesMessageKey, string>> = {
  // The cycle the action named is not in this tenant — the 404-not-403 rule's
  // sentence, for a row another clinic holds.
  'cycle.notFound': 'این دوره درمان پیدا نشد.',

  // A cycle that already reached COMPLETED or ABANDONED accepts no further write.
  // The sentence names the reload, because the list underneath the form moved.
  'cycle.closed': `این دوره درمان به پایان رسیده است و قابل تغییر نیست. صفحه را دوباره بارگذاری کنید.`,

  // The one sentence the closed list exists to make unnecessary: a reason outside
  // the six is not analysable, and the fix is to pick one of them.
  'cycle.reasonNotFromList': 'دلیل رها کردن باید یکی از گزینه‌های لیست باشد.',

  // The service a cycle was built on is inactive, so its next session cannot be
  // booked from here; the desk chooses a current one from the catalogue.
  'cycle.notBookable': 'این خدمت دیگر ارائه نمی‌شود. گزینه دیگری را از فهرست خدمات انتخاب کنید.',

  // A service the clinic never configured an interval for cannot anchor a cycle's
  // spacing; the manager sets the interval in the catalogue first.
  'cycle.noInterval': 'برای این خدمت بازه جلسات تعیین نشده است. ابتدا بازه را در فهرست خدمات ثبت کنید.',
}

/* ── §4.5 The five cycle statuses ─────────────────────────────────────────── */

/**
 * The status labels, as the contact list and the oversight table render them.
 *
 * Named `CYCLE_STATUS_LABELS` because that is the name `scripts/check-i18n.mjs`
 * derives from the set name `CycleStatus`, so the badges and the check's own naming
 * cannot drift apart.
 */
export const CYCLE_STATUS_LABELS: Readonly<Record<CycleStatus, string>> = {
  ACTIVE: 'در حال انجام',
  DUE: 'موعد رسیده',
  AT_RISK: 'در معرض ریزش',
  COMPLETED: 'تکمیل شده',
  ABANDONED: 'رها شده',
}

/* ── §4.6 The six abandonment reasons ─────────────────────────────────────── */

/**
 * The closed list, as the abandonment form offers it and the drop-off report reads it.
 *
 * `03-data-model.md` §2.4.1 rule 6: the list is what tells the manager whether the
 * problem is price or outcome, so the six labels are the six the report groups by —
 * and a reason that is not one of them has no label and no row.
 */
export const ABANDONMENT_REASON_LABELS: Readonly<Record<AbandonmentReason, string>> = {
  PRICE: 'قیمت',
  NO_RESULT: 'نتیجه نگرفت',
  SIDE_EFFECTS: 'عوارض',
  DISTANCE: 'دور بودن مسیر',
  NO_TIME: 'وقت نداشتن',
  UNKNOWN: 'نامشخص',
}
