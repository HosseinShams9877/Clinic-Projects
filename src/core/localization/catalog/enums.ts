/**
 * Persian labels for the closed sets of `docs/knowledge/06-constants.md` §4.
 *
 * `src/core/constants/enums.ts` states where these belong, quoting `§7 rule 3` of
 * the same document:
 *
 * > Persian labels do **not** live here. They live in the localization catalog,
 * > keyed by these codes, so that a missing label is a compile error rather than a
 * > blank on a screen.
 *
 * So this file is the catalog half of that arrangement, and `Record<Role, string>`
 * is what makes the claim literal: a set with a member and no label does not
 * compile, and neither does a label for a member that no longer exists.
 *
 * ## Keyed by the stored value, not by the constant
 *
 * The keys are the string literals (`'MANAGER'`, `'view_debts'`) rather than
 * computed accesses (`[Role.Manager]`). The two are equivalent to the type checker,
 * because `Role` **is** the union of those literals — but only the literal form is
 * greppable, and `scripts/check-i18n.mjs` reads this file as text to assert that
 * every member of every set has a label. A computed key would be invisible to that
 * check, and the check would pass by finding nothing.
 *
 * It also matches how the value arrives at runtime: the database column holds
 * `'view_debts'`, not a symbol, so the lookup is `PERMISSION_LABELS[row.permission]`.
 *
 * ## The ZWNJ, and a finding about the specification's own text
 *
 * Two labels below contain a **ZWNJ** (U+200C), written as `${ZWNJ}` for the reason
 * `catalog/common.ts` gives: the character is invisible, so a literal one survives
 * review and a copy-paste with nobody noticing its absence.
 *
 * They are written with the ZWNJ even though `06-constants.md` §4.2 writes
 * «جابهجایی» and «ماندهحساب» without one **anywhere in the document** — a search
 * for U+200C across all of `docs/knowledge/` returns no matches at all, so the
 * missing character is not specific to these two words. That is a property of how
 * the specification was written, not an orthographic decision: «جابهجایی» and
 * «ماندهحساب» are compounds, and standard Persian orthography joins them with a
 * ZWNJ. The product renders standard orthography; `normalizeForSearch` makes the
 * two spellings equal for search either way, which is what §8.4 of
 * `01-tech-stack.md` keeps «سهشنبه» and «سه شنبه» in one equivalence class for.
 *
 * It is recorded here rather than silently corrected because a label copied
 * verbatim from the specification will be missing its ZWNJ wherever one is due —
 * see the Phase 1 report's note on the source documents.
 */

import type { Permission, Role } from '@/core/constants'

import { ZWNJ } from '../digits'

/* ── §4.1 Roles ───────────────────────────────────────────────────────────── */

/** The three roles, as `admin/staff.html` names them. */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  MANAGER: 'مدیر',
  DOCTOR: 'پزشک',
  SECRETARY: 'منشی',
}

/* ── §4.2 Permissions ─────────────────────────────────────────────────────── */

/**
 * The sixteen permissions, as the settings screen lists them.
 *
 * These are shown to a manager who is deciding what a member of staff may do, so
 * each one is a verb phrase describing the capability — «دیدن ماندهحساب» — and not
 * the slug restated in Persian.
 */
export const PERMISSION_LABELS: Readonly<Record<Permission, string>> = {
  view_own_schedule: 'دیدن برنامه روز خودش',
  view_all_schedules: 'دیدن برنامه همه پزشکان',
  manage_appointments: `ثبت و جابه${ZWNJ}جایی نوبت`,
  record_appointment_result: 'ثبت نتیجه نوبت',
  view_own_customer_records: 'دیدن پرونده مراجعین خودش',
  view_all_customers: 'دیدن پرونده همه مشتریان',
  view_debts: `دیدن مانده${ZWNJ}حساب`,
  record_payment: 'ثبت دریافت وجه',
  follow_up_debt: 'پیگیری بدهی',
  view_own_cycles: 'دیدن چرخه درمان خودش',
  act_on_cycles: 'اقدام روی چرخه درمان',
  manage_leads: 'کارتابل لید',
  manage_campaigns: 'ساخت و اجرای کمپین',
  manage_services: 'تعریف خدمت و قیمت',
  manage_clinic_settings: 'تغییر تنظیمات کلینیک',
  manage_users: 'مدیریت کاربران و دسترسی',
}
