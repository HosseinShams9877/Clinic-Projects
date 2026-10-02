/**
 * The eight behavioral toggles of `04-roles-permissions.md` §4.
 *
 * These are **not** permissions and the specification is emphatic about the
 * difference:
 *
 * > «تفاوتش با ماتریس این است که ماتریس می‌گوید "چه کسی چه صفحه‌ای را دارد" و
 * > این‌ها می‌گویند "در آن صفحه چقدر اختیار دارد".»
 * >
 * > *The matrix says who has which page; these say how much authority they have
 * > inside that page.*
 *
 * So they do not travel on `TenantContext` and `can()` does not read them. A
 * secretary who holds `record_payment` opens the payment form either way; toggle 3
 * decides whether the discount field on that form is usable, and toggle 5 whether
 * the price field on the service screen is. Both live in
 * **تنظیمات › اختیارات** (`admin/settings.html`, tab `t5`), a settings screen, and
 * neither changes the answer to "may this person be here at all".
 *
 * ## The codes are ours; the labels are not
 *
 * §4 is a table of eight numbered rows, each with a Persian label, a description
 * and a default. It names no code for any of them, and neither does
 * `03-data-model.md` §6 — so the `SCREAMING_SNAKE` members below are this
 * repository's naming, chosen to follow the shape `06-constants.md` §4 uses for
 * every other closed set. The **numbering and the defaults are the document's** and
 * the test suite pins both: `toggles.test.ts` asserts the eight codes in §4's order
 * and asserts the split §4 states — روشن for 1, 3, 4 and 8; خاموش for 2, 5, 6 and 7.
 *
 * The Persian labels are deliberately **not** here. A label belongs in the catalog
 * when something renders it, and the screen that renders these is the settings
 * screen — panel UI that Phase 1 does not build. Adding eight long Persian
 * sentences no surface reads would be copy nothing can check against a screen, which
 * is the failure mode `scripts/check-i18n.mjs` describes from the other side: "a
 * label with no set member is copy nothing can render". They land with the screen.
 */

import { isMember } from '@/core/constants'

/**
 * The eight toggles, keyed as the settings screen names them.
 *
 * `as const` object plus a derived union, never a native `enum` — the shape every
 * closed set in this repository uses (`05-conventions.md` §2), and the shape that
 * makes `Record<Toggle, boolean>` a completeness check.
 */
export const Toggle = {
  DoctorSelfBooking: 'DOCTOR_SELF_BOOKING',
  DoctorCloseOwnHours: 'DOCTOR_CLOSE_OWN_HOURS',
  SecretaryDiscount: 'SECRETARY_DISCOUNT',
  SecretaryMoveDueDate: 'SECRETARY_MOVE_DUE_DATE',
  SecretaryEditPrice: 'SECRETARY_EDIT_PRICE',
  OnlineBookingNoDeposit: 'ONLINE_BOOKING_NO_DEPOSIT',
  BookingOnHolidays: 'BOOKING_ON_HOLIDAYS',
  AutoLeadFromSiteForm: 'AUTO_LEAD_FROM_SITE_FORM',
} as const
export type Toggle = (typeof Toggle)[keyof typeof Toggle]

/**
 * The eight toggles in §4's documented order, 1–8.
 *
 * The order is load-bearing in the same way `PERMISSIONS`' is: §4 numbers the table
 * by it, the settings screen renders the rows in it, and `toggles.test.ts` names
 * each case by its number. A set would lose the sequence, and the sequence is part
 * of the specification.
 */
export const TOGGLES = [
  Toggle.DoctorSelfBooking,
  Toggle.DoctorCloseOwnHours,
  Toggle.SecretaryDiscount,
  Toggle.SecretaryMoveDueDate,
  Toggle.SecretaryEditPrice,
  Toggle.OnlineBookingNoDeposit,
  Toggle.BookingOnHolidays,
  Toggle.AutoLeadFromSiteForm,
] as const satisfies readonly Toggle[]

/**
 * The default of each toggle, read from §4's «پیش‌فرض» column.
 *
 * Four are on (1, 3, 4, 8) and four off (2, 5, 6, 7), and each one that is off
 * carries its reason in §4's own description — «توصیه نمی‌شود — قیمت باید یکدست
 * بماند» for the price toggle, «بدون بیعانه، نرخ عدم حضور بالا می‌رود» for the
 * deposit one. A default here is a decision about the clinic's risk rather than a
 * preference, which is why these are constants: a default a release could change
 * silently is a default that would move a clinic's no-show rate in a commit nobody
 * read.
 *
 * Frozen, so that a screen which reads the record cannot write to the default.
 */
export const TOGGLE_DEFAULTS: Readonly<Record<Toggle, boolean>> = Object.freeze({
  DOCTOR_SELF_BOOKING: true,
  DOCTOR_CLOSE_OWN_HOURS: false,
  SECRETARY_DISCOUNT: true,
  SECRETARY_MOVE_DUE_DATE: true,
  SECRETARY_EDIT_PRICE: false,
  ONLINE_BOOKING_NO_DEPOSIT: false,
  BOOKING_ON_HOLIDAYS: false,
  AUTO_LEAD_FROM_SITE_FORM: true,
})

/**
 * Whether a stored value is one of the eight.
 *
 * The settings blob is a `String` holding JSON (`03-data-model.md` §5), so a value
 * read out of it is `unknown` until something narrows it. This is that step, and it
 * delegates to `isMember` so that the membership test is the same one every other
 * closed set in the product uses.
 */
export function isToggle(value: unknown): value is Toggle {
  return isMember(Toggle, value)
}
