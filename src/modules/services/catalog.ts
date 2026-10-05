/**
 * The Persian sentences and labels `services` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the two exemptions the
 * rule names. Everything else in the module references these by key.
 *
 * ## The sentences, and the fix each one names
 *
 * `07-localization.md` §8 requires a message to name the **fix**. Both refusals
 * below name a different one:
 *
 * | Key | The fix it names |
 * |---|---|
 * | `service.nameRequired` | Type a name — the catalogue cannot hold a service without one. |
 * | `service.nameTaken` | Choose a different name — the clinic has a service by this one. |
 * | `service.notBookable` | Reactivate the service, or pick one the clinic still offers. |
 *
 * Neither sentence is about deactivation, and that is deliberate: the deactivation
 * path refuses nothing. A manager deactivates a service and the service is gone from
 * the picker; the refusal is on the *booking* path, where a service the clinic no
 * longer offers cannot be booked, and the fix is to reactivate it.
 *
 * ## Why there is no `service.deleted` key
 *
 * DoD 3: the delete path does not exist. There is no sentence for it, no button that
 * renders one, and no function that would raise it — the absence of the key is the
 * invariant, and adding it would be adding the surface.
 */

import type { ServiceCategory } from '@/core/constants'

import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type ServicesMessageKey =
  | 'service.nameRequired'
  | 'service.nameTaken'
  | 'service.notBookable'
  | 'service.notFound'

/**
 * The sentence for each key.
 *
 * Typed as a `Record` over the union, so a key with no sentence is a compile error
 * rather than an empty string on a screen.
 */
export const MESSAGES: Readonly<Record<ServicesMessageKey, string>> = {
  // The name is the service's identity (`service_tenant_name_key`), so an empty name is
  // a row the catalogue cannot render and the picker cannot name.
  'service.nameRequired': 'نام خدمت الزامی است.',

  // The name is the service's identity (`service_tenant_name_key`). The sentence names
  // the duplicate and not the person who typed it, because two services by one name in
  // a clinic is a catalogue that has drifted rather than a typing mistake.
  'service.nameTaken': 'یک خدمت با این نام قبلاً ثبت شده است. نام دیگری وارد کنید.',

  // The booking path's refusal. The fix is on the service's own page and not on the
  // booking form, so the sentence points there.
  'service.notBookable': 'این خدمت فعلاً فعال نیست. ابتدا آن را فعال کنید.',

  // `09-security.md` §6.3's 404-not-403 rule: the sentence cannot say whether the
  // service exists in another tenant or simply does not, because the distinction is
  // not the caller's to learn.
  'service.notFound': 'این خدمت پیدا نشد.',
}

/* ── §2.3 The four categories, as the catalogue's filter chips name them */

/**
 * The four service categories, as `admin/services.html`'s filter chips and the
 * booking picker name them.
 *
 * Named `SERVICE_CATEGORY_LABELS` because that is the name `scripts/check-i18n.mjs`
 * derives from the set name `ServiceCategory`, so a chip and the check's own naming
 * cannot drift apart.
 */
export const SERVICE_CATEGORY_LABELS: Readonly<Record<ServiceCategory, string>> = {
  SKIN: 'پوست',
  LASER: 'لیزر',
  INJECTION: `تزریق${ZWNJ}زیبایی`,
  HAIR: 'مو',
}

/* ── §2.3 The two states, as the catalogue's status badge names them */

/** The two `isActive` values, as the catalogue's status column names them. */
export const SERVICE_STATUS_LABELS: Readonly<Record<'ACTIVE' | 'INACTIVE', string>> = {
  ACTIVE: 'فعال',
  INACTIVE: 'غیرفعال',
}
