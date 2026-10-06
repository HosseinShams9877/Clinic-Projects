/**
 * The Persian sentences and labels `audience-groups` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the exemptions the rule
 * names. Everything else in the module references these by key.
 *
 * ## The eight names
 *
 * `03-data-model.md` §2.7's coverage map names the eight, and the names are the
 * specification's own: a label here is the phrase the manager reads on the builder
 * and the phrase the specification's scenario 4 uses to ask for a group. A renamed
 * label would be a group the manager cannot ask for by the name they know.
 */

import type { AudienceGroupKey } from '@/core/constants'
import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type AudienceGroupsMessageKey =
  | 'audienceGroups.groupNotFound'
  | 'audienceGroups.predicateUnparseable'
  | 'audienceGroups.nameRequired'
  | 'audienceGroups.conditionsRequired'

export const MESSAGES: Readonly<Record<AudienceGroupsMessageKey, string>> = {
  // A group the caller named that the tenant does not hold — the 404-not-403 rule's
  // own sentence, for a group id another clinic may well own.
  'audienceGroups.groupNotFound': 'این گروه در این کلینیک وجود ندارد.',

  // A `predicate` column the schema cannot parse. The column is JSON in a String,
  // and a row a hand-edit broke is a row the module refuses to re-interpret.
  'audienceGroups.predicateUnparseable': 'شرط ذخیره‌شده این گروه قابل خواندن نیست.',

  // An ad-hoc group with no name; the builder's own field error.
  'audienceGroups.nameRequired': 'نام گروه الزامی است.',

  // An ad-hoc group with no conditions, which is a group of everyone and therefore
  // not a group.
  'audienceGroups.conditionsRequired': 'حداقل یک شرط برای گروه لازم است.',
}

/**
 * The eight built-ins, as the builder lists them and the results table labels them.
 *
 * Named `AUDIENCE_GROUP_LABELS` because that is the name `scripts/check-i18n.mjs`
 * derives from the set name `AudienceGroupKey`.
 */
export const AUDIENCE_GROUP_LABELS: Readonly<Record<AudienceGroupKey, string>> = {
  // «متولدین این ماه» — `birthMonth = currentJalaliMonth`. Recurring monthly, which
  // is what makes the birthday campaign correct a year later.
  BIRTHDAY: `متولدین این ماه`,
  // «خوابیده‌ها» — last visit more than ۹۰ days ago and at least one session done.
  DORMANT: `خوابیده${ZWNJ}ها`,
  // «موعد رسیده» — an open cycle past its due date with no future appointment.
  CYCLE_DUE: `موعد رسیده`,
  // «وفادارها» — more than five completed sessions.
  LOYAL: `وفادارها`,
  // «بدهکاران» — an open balance past its due date.
  DEBTORS: `بدهکاران`,
  // «تازه‌واردها» — first visit within the last ۳۰ days.
  NEW: `تازه${ZWNJ}واردها`,
  // «دوره تکمیل شده» — a completed course, last session at least ۳۰ days ago.
  COMPLETED_COURSE: `دوره تکمیل شده`,
  // «یک‌باری‌ها» — one session, and not seen for ۶۰ days. The specification calls
  // this the group clinics never see and usually their largest.
  ONE_TIMERS: `یک${ZWNJ}باری${ZWNJ}ها`,
}

/**
 * One sentence per group, so the builder explains what a group is rather than only
 * naming it. The sentence states the predicate in the manager's own words, which is
 * also how a manager recognises the group they were looking for.
 */
export const AUDIENCE_GROUP_DESCRIPTIONS: Readonly<Record<AudienceGroupKey, string>> = {
  BIRTHDAY: `مشتریانی که ماه تولدشان در این ماه شمسی است.`,
  DORMANT: `مشتریانی که بیش از ۹۰ روز است مراجعه نکرده${ZWNJ}اند و حداقل یک جلسه داشته${ZWNJ}اند.`,
  CYCLE_DUE: `دوره‌های درمان باز که موعد جلسه بعدی رسیده و نوبت آینده ندارند.`,
  LOYAL: `مشتریانی که بیش از پنج جلسه تکمیل کرده${ZWNJ}اند.`,
  DEBTORS: `مشتریانی که بابت خدمات دریافتی مانده دارند و موعد پرداخت رسیده است.`,
  NEW: `مشتریانی که اولین مراجعهشان در ۳۰ روز گذشته بوده است.`,
  COMPLETED_COURSE: `مشتریانی که دوره درمانشان تکمیل شده و ۳۰ روز از آخرین جلسه می${ZWNJ}گذرد.`,
  ONE_TIMERS: `مشتریانی که یک جلسه داشته${ZWNJ}اند و ۶۰ روز است مراجعه نکرده${ZWNJ}اند.`,
}
