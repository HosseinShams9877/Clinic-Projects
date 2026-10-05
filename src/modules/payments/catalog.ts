/**
 * The Persian sentences `payments` raises, and the labels its two closed sets render.
 *
 * `05-conventions.md` §14: a Persian literal outside a catalog is a finding.
 * `07-localization.md` §8: a message names the fix, not the fact.
 */

import type { DepositRefundPolicy, PaymentKind, PaymentMethod } from '@/core/constants'
import type { PaymentsMessageKey } from './types'

/** The sentence for each key — a key with no sentence is a compile error. */
export const MESSAGES: Readonly<Record<PaymentsMessageKey, string>> = {
  // The appointment the payment names is not in this tenant — the 404-not-403 rule.
  'payment.notFound': 'این نوبت پیدا نشد.',

  // A receipt of zero or less is not a receipt; the fix is a positive amount.
  'payment.amountNotPositive': 'مبلغ پرداختی باید بیشتر از صفر باشد.',

  // Toggle 3 is off, so nobody on this clinic may discount; the manager turns it on.
  'payment.discountRefused': 'ثبت تخفیف غیرفعال است. مدیر باید آن را در تنظیمات فعال کند.',

  // The discount passes the secretary's ceiling; the fix is the ceiling's own value.
  'payment.discountAboveCap': 'این تخفیف بیشتر از سقف مجاز منشی است.',

  // No refund policy is set, so a refund has no amount to use; the manager sets it.
  'payment.noRefundPolicy': 'سیاست بازگشت بیعانه تعیین نشده است. مدیر آن را در تنظیمات ثبت می‌کند.',

  // The appointment carried no deposit, so there is nothing to hand back.
  'payment.nothingToRefund': 'این نوبت بیعانه‌ای ثبت نشده که قابل بازگشت باشد.',

  // A discount is a fact the clinic analyses, so it needs the reason alongside it.
  'payment.discountNeedsReason': 'برای ثبت تخفیف، علت آن را بنویسید.',

  // The nightly job found a cache that is not the ledger; an operator must look.
  'payment.driftDetected': 'مجموع‌های ثبت‌شده با دفتر مالی هم‌خوانی ندارد. این مورد بررسی شود.',
} satisfies Record<PaymentsMessageKey, string>

/* ── §2.5 The two closed sets a receipt carries ─────────────────────────────── */

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'نقدی',
  CARD: 'کارت',
  ONLINE: 'آنلاین',
}

export const PAYMENT_KIND_LABELS: Readonly<Record<PaymentKind, string>> = {
  DEPOSIT: 'بیعانه',
  PARTIAL: 'جزیی',
  FINAL: 'تسویه',
  REFUND: 'بازگشت',
}

/** §4.4's three policies, as the settings screen offers and the refund reads them. */
export const DEPOSIT_REFUND_POLICY_LABELS: Readonly<Record<DepositRefundPolicy, string>> = {
  FULL: 'کامل',
  HALF: 'نیمی',
  NONE: 'بدون بازگشت',
}

/** The form's own sentences — app-tier validation, whose copy no module raises. */
export const PAYMENT_FORM_MESSAGES = {
  amountRequired: 'مبلغ را وارد کنید',
  amountNotNumber: 'مبلغ باید عدد باشد',
  methodRequired: 'روش پرداخت را انتخاب کنید',
  kindRequired: 'نوع پرداخت را انتخاب کنید',
  dayRequired: 'تاریخ را انتخاب کنید',
} as const
