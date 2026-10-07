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

/* ── Phase 9: the customer panel's own surface ────────────────────────────── */

/**
 * `account/dashboard.html`, `account/care.html` and `account/profile.html` — the
 * three of `09-security.md` §7's pages that are the person's own record, and the one
 * place their copy lives (`src/app/catalog.ts` is at the length gate).
 *
 * The panel's fourth page, `account/appointments.html`, is `appointments`'s own
 * surface and its copy is in that module's catalog.
 */
export const CUSTOMER_PANEL = Object.freeze({
  /** The sentence an action renders for a failure it cannot name specifically. */
  failure: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.',
  /** «داشبورد من» — the three facts the person opens the panel for. */
  dashboard: {
    title: 'داشبورد من',
    lead: 'خلاصه درمان شما در یک نگاه.',
    nextAppointment: {
      title: 'نوبت بعدی',
      /** Rendered when no future session exists. */
      empty: 'نوبت پیش‌رویی ندارید.',
      /** The two facts the row shows beside the service's name. */
      withDoctor: 'پزشک',
      at: 'ساعت',
    },
    cycle: {
      title: 'پیشرفت درمان',
      /** The progress bar's own sentence, as the specification writes it. */
      progress: (completed: number, total: number) => `جلسه ${completed} از ${total}`,
      /** What the bar shows when a course has no end the clinic fixed. */
      unbounded: (completed: number) => `جلسه ${completed}`,
      /** The label under the bar for the session the course is walking toward. */
      completed: 'جلسه‌های انجام شده',
      /** Rendered when the person has no open course. */
      empty: 'دوره درمانی فعالی ندارید.',
    },
    care: {
      title: 'آخرین دستورالعمل‌های مراقبتی',
      /** The link the dashboard offers into the full list. */
      viewAll: 'همه دستورالعمل‌ها',
      /** Rendered when no service the person has had carries care text. */
      empty: 'دستورالعملی برای شما ثبت نشده است.',
    },
  },
  /** «دستورالعمل‌های مراقبتی» — the aftercare the clinic wrote for this person. */
  care: {
    title: 'دستورالعمل‌های مراقبتی',
    lead: 'مراقبت‌های قبل و بعد از جلسه‌های شما، از توضیحات خود خدمت.',
    /** The two halves of one card. */
    afterCare: 'بعد از جلسه',
    beforeCare: 'قبل از جلسه',
    /** Rendered when no service the person has had carries care text. */
    empty: 'دستورالعملی برای شما ثبت نشده است.',
  },
  /** «پروفایل من» — the person's own facts and their consent. */
  profile: {
    title: 'پروفایل من',
    lead: 'اطلاعات خود را ویرایش کنید و اجازه‌های ارسال پیام را مدیریت کنید.',
    fields: {
      firstName: 'نام',
      lastName: 'نام خانوادگی',
      mobile: 'شماره موبایل',
      birthDate: 'تاریخ تولد',
      residenceArea: 'محله سکونت',
    },
    /** The mobile's own note: the panel cannot change the person's identity key. */
    mobileNote: 'تغییر شماره موبایل از طریق کلینیک انجام می‌شود.',
    submit: 'ذخیره تغییرات',
    saved: 'تغییرات ذخیره شد.',
    consent: {
      title: 'اجازه‌های ارسال پیام',
      lead: 'شما تصمیم می‌گیرید کلینیک چگونه با شما در ارتباط باشد.',
      sms: 'پیامک',
      whatsApp: 'واتساپ',
      phone: 'تماس تلفنی',
      /** The before/after flag, which §9's rule 6 gates the images on. */
      beforeAfter: 'استفاده از تصاویر قبل و بعد',
      beforeAfterNote: 'در صورت لغو این اجازه، تصاویر شما بلافاصله از سایت حذف می‌شوند.',
      submit: 'ذخیره اجازه‌ها',
      saved: 'اجازه‌های شما به‌روز شد.',
    },
    /** Rendered when the person's record is gone while their session is still open. */
    missing: 'پروفایل شما یافت نشد. لطفاً با کلینیک تماس بگیرید.',
  },
})
