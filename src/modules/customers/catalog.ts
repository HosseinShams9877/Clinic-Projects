/**
 * The Persian sentences and labels `customers` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the two exemptions the
 * rule names. Everything else in the module references these by key.
 *
 * ## The sentences, and the fix each one names
 *
 * `07-localization.md` §8 requires a message to name the **fix**. Two of the three
 * refusals below name a different one:
 *
 * | Key | The fix it names |
 * |---|---|
 * | `customer.duplicateMobile` | You are not creating a duplicate; this is the person's existing record. |
 * | `customer.notFound` | Nothing the caller can correct — the record is outside their scope. |
 * | `customer.mobileInvalid` | Type the mobile as `09xxxxxxxxx`. |
 *
 * `customer.duplicateMobile` is the sentence DoD 1's "offers the existing record"
 * path renders, and it is phrased as information rather than as a refusal: the desk
 * typed a person who is already in the file, which is the ordinary outcome at a
 * clinic whose customers come back, and the sentence points at the record rather
 * than at the person who typed it.
 */

import type {
  AcquisitionSource,
  CustomerLifecycle,
  LeadStatus,
} from '@/core/constants'

import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type CustomersMessageKey =
  | 'customer.duplicateMobile'
  | 'customer.notFound'
  | 'customer.mobileInvalid'

/**
 * The sentence for each key.
 *
 * Typed as a `Record` over the union, so a key with no sentence is a compile error
 * rather than an empty string on a screen.
 */
export const MESSAGES: Readonly<Record<CustomersMessageKey, string>> = {
  // The desk typed a mobile the file already holds. The sentence names the fact and
  // not the mistake, because at a clinic this is the common path, not an error.
  'customer.duplicateMobile': 'این شماره قبلاً ثبت شده است. پرونده مشتری را باز کنید.',

  // The 404-not-403 rule (`09-security.md` §6.3): the sentence cannot say whether
  // the record exists in another tenant or simply does not exist, because the
  // distinction is not the caller's to learn.
  'customer.notFound': 'این مشتری پیدا نشد.',

  'customer.mobileInvalid': 'شماره موبایل درست نیست. شماره را با صفر و بدون فاصله وارد کنید.',
}

/* ── §2.1 The two lives of one person, as the cartable and the profile name them */

/**
 * The two lifecycle values, as the lead cartable and the customer profile render
 * them.
 *
 * Named `CUSTOMER_LIFECYCLE_LABELS` because that is the name
 * `scripts/check-i18n.mjs` derives from the set name `CustomerLifecycle`, so a
 * badge and the check's own naming cannot drift apart.
 */
export const CUSTOMER_LIFECYCLE_LABELS: Readonly<Record<CustomerLifecycle, string>> = {
  LEAD: 'لید',
  CUSTOMER: 'مشتری',
}

/**
 * The lead cartable's four states, as `reception/leads.html`'s chips name them.
 *
 * The four are the cartable's own vocabulary — the chips a receptionist filters by
 * — and not a progress sequence: a lead can move from «جدید» to «از دست رفته»
 * without ever passing through «در پیگیری», and the cartable does not imply
 * otherwise.
 */
export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  NEW: 'جدید',
  FOLLOWING: `در پیگیری`,
  CONVERTED: 'تبدیل شده',
  LOST: `از دست رفته`,
}

/* ── §4.7 How a person reached the clinic, as the lead row and the report name it */

/**
 * The acquisition sources, as the lead form's select and the acquisition report
 * name them.
 *
 * A source survives a lead's conversion (DoD 2), so the label a person picks on the
 * lead form is the label the report counts later — which is why these are sentences
 * a receptionist recognises and not slugs restated in Persian.
 */
export const ACQUISITION_SOURCE_LABELS: Readonly<Record<AcquisitionSource, string>> = {
  INSTAGRAM: 'اینستاگرام',
  WHATSAPP: 'واتساپ',
  WEBSITE: `وب${ZWNJ}سایت`,
  PHONE: 'تماس',
  REFERRAL: `معرفی دوست`,
}
