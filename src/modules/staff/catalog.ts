/**
 * The Persian sentences and labels `staff` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the two exemptions the
 * rule names. Everything else in the module references these by key.
 *
 * ## The sentences, and the fix each one names
 *
 * `07-localization.md` §8 requires a message to name the **fix**:
 *
 * | Key | The fix it names |
 * |---|---|
 * | `staff.notFound` | Nothing the caller can correct — the membership is outside their tenant. |
 * | `staff.mobileTaken` | The person is already on the staff list — open their membership instead. |
 * | `staff.mobileInvalid` | Type the mobile as `09xxxxxxxxx`. |
 * | `staff.nameRequired` | Type a name — the list cannot render a person without one. |
 * | `staff.passwordRequired` | Set a password the person can log in with. |
 * | `staff.roleInvalid` | Pick one of the three roles the matrix holds. |
 * | `staff.leaveAlreadyDecided` | The request is closed; there is nothing to change. |
 * | `staff.lastManager` | Appoint another manager first, then make the change. |
 *
 * The manager-column lock and the self-edit guard are not in this table because they
 * are not raised here: they are raised by `roles-permissions` (`assertOverridesAllowed`,
 * `assertNotSelfEdit`), which owns both rules and both sentences. This module calls
 * them and lets their keys reach the screen, because a rule stated in one module and
 * refused in another is a rule that drifts.
 *
 * `staff.lastManager` is the staff module's own restatement of `permission.lastManager`
 * for the *deactivation* path — the membership page's own refusal — and the sentence is
 * the same one for the same reason: there is one way to recover, and the sentence
 * names it.
 */

import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type StaffMessageKey =
  | 'staff.notFound'
  | 'staff.mobileTaken'
  | 'staff.mobileInvalid'
  | 'staff.nameRequired'
  | 'staff.passwordRequired'
  | 'staff.roleInvalid'
  | 'staff.leaveAlreadyDecided'
  | 'staff.lastManager'

/**
 * The sentence for each key.
 *
 * Typed as a `Record` over the union, so a key with no sentence is a compile error
 * rather than an empty string on a screen.
 */
export const MESSAGES: Readonly<Record<StaffMessageKey, string>> = {
  // `09-security.md` §6.3's 404-not-403 rule: the sentence cannot say whether the
  // membership exists in another tenant or simply does not, because the distinction is
  // not the caller's to learn.
  'staff.notFound': 'این کاربر پیدا نشد.',

  // The mobile is the staff member's identity (`user_tenant_mobile_key`), and an
  // existing person is the ordinary outcome of an invite rather than a mistake. The
  // sentence points at the row.
  'staff.mobileTaken': 'این شماره در فهرست کارکنان هست. پرونده کاربری را باز کنید.',

  'staff.mobileInvalid': 'شماره موبایل درست نیست. شماره را با صفر و بدون فاصله وارد کنید.',

  'staff.nameRequired': 'نام کاربر الزامی است.',

  'staff.passwordRequired': 'برای ورود، یک رمز عبور تعیین کنید.',

  'staff.roleInvalid': 'نقش باید یکی از مدیر، پزشک یا منشی باشد.',

  // The request is already approved or rejected. The sentence says the state and not
  // the mistake, because a second decision on a closed row is not a correction.
  'staff.leaveAlreadyDecided': 'این درخواست قبلاً بررسی شده است.',

  // The deactivation path's own refusal, mirroring `permission.lastManager`.
  'staff.lastManager': `این تغییر آخرین مدیر فعال کلینیک را حذف می${ZWNJ}کند. ابتدا مدیر دیگری تعیین کنید.`,
}

/* ── §6 The leave request's three states, as the staff page's badges name them */

/**
 * The three leave states, as `admin/staff.html`'s leave badges name them.
 *
 * Named `LEAVE_STATUS_LABELS` because that is the name `scripts/check-i18n.mjs`
 * derives from the set name `LeaveRequestStatus`, so a badge and the check's own naming
 * cannot drift apart.
 */
export const LEAVE_STATUS_LABELS: Readonly<Record<'PENDING' | 'APPROVED' | 'REJECTED', string>> = {
  PENDING: 'در انتظار',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
}
