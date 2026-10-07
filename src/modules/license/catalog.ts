/**
 * The Persian surface of the licensing module.
 *
 * The sentences the blocking screen renders are here because a license that has
 * expired is the one state the product answers with prose rather than with a form,
 * and the prose has to say what the operator can do about it (`07-localization.md` §8
 * requires a message to name the fix).
 */

import type { LicenseStatus } from './types'

/** The licensing surface's own fields and sentences. */
export const LICENSE_FIELDS = Object.freeze({
  title: 'گواهی مجوز',
  lead: 'مجوز نصب این کلینیک روی سرور خودتان.',
  key: 'کلید مجوز',
  issuedTo: 'صادر شده برای',
  issuedAt: 'تاریخ صدور',
  expiresAt: 'تاریخ انقضا',
  maxUsers: 'سقف کاربران',
  activatedAt: 'تاریخ فعال‌سازی',
  notes: 'یادداشت',
  issue: 'صدور کلید جدید',
  save: 'ذخیره کلید مجوز',
  noKey: 'هیچ کلید مجوزی ثبت نشده است.',
}) satisfies Record<string, string>

/** The label of each validation status, as the status row renders it. */
export const LICENSE_STATUS_LABELS: Readonly<Record<LicenseStatus, string>> = Object.freeze({
  VALID: 'معتبر',
  EXPIRED: 'منقضی شده',
  INVALID: 'نامعتبر',
  MISSING: 'ثبت نشده',
})

/**
 * The sentence the blocking screen renders for each status that stops the instance.
 *
 * `VALID` has no sentence here because it is not a state the screen blocks on; the
 * product renders its panels. Each of the other three names the fix, which is the
 * one thing an operator staring at a locked instance needs.
 */
export const LICENSE_BLOCK_SENTENCES: Readonly<
  Record<Exclude<LicenseStatus, 'VALID'>, { readonly title: string; readonly fix: string }>
> = Object.freeze({
  EXPIRED: {
    title: 'مجوز این کلینیک منقضی شده است.',
    fix: 'برای تمدید مجوز با پشتیبانی تماس بگیرید. اطلاعات شما دست‌نخورده باقی می‌ماند.',
  },
  INVALID: {
    title: 'کلید مجوز نامعتبر است.',
    fix: 'کلید را از نامه صدور مجوز کپی کنید و دوباره وارد کنید.',
  },
  MISSING: {
    title: 'کلید مجوز ثبت نشده است.',
    fix: 'کلید مجوزی که برای این نصب صادر شده را وارد کنید.',
  },
})

/** Every message the licensing actions can raise. */
export type LicenseMessageKey = 'license.issued' | 'license.invalidKey'

export const MESSAGES: Readonly<Record<LicenseMessageKey, string>> = Object.freeze({
  'license.issued': 'کلید مجوز صادر شد.',
  // A key that is not the shape the issuer writes cannot be recorded.
  'license.invalidKey': 'کلید مجوز باید شکل درستی داشته باشد.',
})
