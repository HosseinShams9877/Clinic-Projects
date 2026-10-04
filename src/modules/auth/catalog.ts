/**
 * The Persian sentences `auth` raises and the labels it renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is one of the two places a literal is allowed to be
 * (`07-localization.md` §7.2). Every other file in the module refers to these by
 * key, and `core/types/errors.ts` carries a `messageKey` rather than a message for
 * exactly that reason.
 *
 * ## The login sentences, and what each one does not say
 *
 * `09-security.md` §10 requires that "login responses do not reveal whether a
 * mobile number exists", which means the sentence a wrong mobile number earns and
 * the sentence a wrong password earns are **the same sentence**. The two keys
 * `auth.login.failed` and `auth.otp.invalid` exist because they are shown in
 * different forms — a form-level error for the staff password form, a field-level
 * one for the customer code field — not because the copy differs in what it
 * discloses. Both are deliberately uninformative about *which* half was wrong.
 *
 * The sentences that do differentiate are the ones that tell a user the fix, per
 * `07-localization.md` §8's rule that a message names the recovery:
 *
 * | Key | The fix it names |
 * |---|---|
 * | `auth.otp.expired` | Request a new code — the code is not a secret that still helps. |
 * | `auth.otp.tooManyAttempts` | Stop guessing; the code is frozen and a new one is needed. |
 * | `auth.otp.rateLimited` | Wait — the request was accepted, just not yet. |
 * | `auth.account.inactive` | None. The account is closed, so the sentence says so without offering a retry the user cannot perform. |
 *
 * ## The ZWNJ
 *
 * «کد یک‌بار» carries a ZWNJ (U+200C) between «یک» and «بار», spelled through the
 * constant for the reason `catalog/common.ts` gives at length: the character is
 * invisible, and a literal one does not survive a copy-paste or a formatter.
 */

import { ZWNJ } from '@/core/localization'

/** The keys this module raises as `messageKey` on an `AppError`. */
export type AuthMessageKey =
  | 'auth.login.failed'
  | 'auth.otp.expired'
  | 'auth.otp.invalid'
  | 'auth.otp.rateLimited'
  | 'auth.otp.tooManyAttempts'
  | 'auth.account.inactive'

/**
 * The Persian sentence for each key.
 *
 * The record's key space is the union above, so a key without a sentence does not
 * compile — the completeness is in the type, not in a run-time check.
 */
export const MESSAGES: Readonly<Record<AuthMessageKey, string>> = {
  // Deliberately identical in what it discloses: it does not say which half failed.
  'auth.login.failed': 'شماره موبایل یا گذرواژه نادرست است.',
  'auth.otp.invalid': 'کد وارد شده نادرست است.',
  'auth.otp.expired': `کد یک${ZWNJ}بار مصرف شده است. کد جدیدی دریافت کنید.`,
  'auth.otp.tooManyAttempts': 'تعداد تلاش‌ها بیش از حد است. کد جدیدی دریافت کنید.',
  'auth.otp.rateLimited': 'درخواست شما ثبت شد. کمی بعد دوباره تلاش کنید.',
  'auth.account.inactive': 'این حساب غیرفعال است.',
}

/* ── Labels ─────────────────────────────────────────────────────────────────── */

/** The login page's own copy. The page renders these; the module raises the keys. */
export const LOGIN_LABELS = {
  /** The staff form's heading. */
  staffTitle: 'ورود کارکنان',
  /** The customer form's heading. */
  customerTitle: 'ورود مشتریان',
  /** The mobile field's label, shared by both forms. */
  mobile: 'شماره موبایل',
  /** The staff form's password field. */
  password: 'گذرواژه',
  /** The customer form's one-time-code field. */
  code: `کد یک${ZWNJ}بار`,
  /** The button that texts a code to the customer. */
  requestCode: 'دریافت کد',
  /** The submit button on both forms. */
  submit: 'ورود',
} as const

/** The English `placeholder` attributes — not user-visible text, so not catalogued. */
export const LOGIN_PLACEHOLDERS = {
  mobile: '09121234567',
  password: '••••••••',
  code: '۰۰۰۰۰۰',
} as const

/**
 * The two records' shapes, for a client component that receives them as props.
 *
 * A client component may not import this module's barrel for its values — the barrel
 * re-exports the login libraries, which reach Prisma, and Prisma does not belong in a
 * browser bundle. The page imports the barrel and hands the records down, and the
 * component types the props from here. A `type`-only import is erased at compile
 * time, so this names the shape without carrying the module.
 */
export type LoginLabels = typeof LOGIN_LABELS
export type LoginPlaceholders = typeof LOGIN_PLACEHOLDERS
