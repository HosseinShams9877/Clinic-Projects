/**
 * The document-level Persian strings.
 *
 * One of Phase 1's rules is that **no Persian string literal appears in a
 * component** — it comes from the catalog. `layout.tsx` is a component, and its
 * `metadata` block is user-visible text: it is the browser tab title, the
 * bookmark, and the line a search engine shows. So it belongs here.
 *
 * It is a file in `src/app/` rather than in `@/core/localization/catalog` because
 * of the dependency direction (`02-architecture.md` §10 rule 3): `core` may not
 * know about `modules`, and it certainly may not know the product's own name. The
 * app tier owns its document metadata; `core` owns the vocabulary that is shared
 * by everything below it.
 *
 * `07-localization.md` §7.2 namespaces the catalog per module and specifies that
 * it is "a plain object, not a runtime lookup with a fallback chain". These are
 * plain strings, exported, and imported where they are used — the same shape, one
 * level up.
 *
 * `scripts/check-i18n.mjs` excludes this file from the Persian-literal rule for
 * the reason the catalog exists: this is where the literals are allowed to be.
 */

import { ZWNJ } from '@/core/localization'

/** The product's name. It is the tab title, the bookmark, and the install name. */
export const APP_NAME = 'سامانه مدیریت کلینیک'

/**
 * The tab title of any page other than the dashboard: `<page> | <app>`.
 *
 * Built from `APP_NAME` rather than written out, because `06-constants.md` §7 rule
 * 1 defines a value once and a second copy of the product's name is a second place
 * to change it.
 */
export const APP_TITLE_TEMPLATE = `%s | ${APP_NAME}`

/**
 * The description a search engine and a link preview show.
 *
 * «کلینیکهای» carries a ZWNJ (U+200C) between the noun and its plural suffix,
 * spelled through the constant rather than as the literal character for the reason
 * `catalog/common.ts` gives: the character is invisible, so a lost one is a lost
 * one nobody sees in a diff.
 */
export const APP_DESCRIPTION = `سامانه مدیریت نوبت، پرونده مشتریان و پیگیری درمان کلینیک${ZWNJ}های زیبایی`

/* ─────────────────────────────────────────────────────────────────────────────
 * The surfaces of Phase 1: the two ways in, the two login forms, and the four
 * panel shells.
 *
 * Everything below is app-tier copy. The module catalogs own a module's own
 * vocabulary — `LOGIN_LABELS` belongs to `auth` — and this file owns the copy the
 * app tier composes *from* those modules: the panel names, the navigation labels
 * and the sentences a form needs that no module raises. `02-architecture.md` §6
 * puts composition in `src/app/`, and copy is composition, not business logic.
 *
 * ## Why the panel names and the nav labels are here and not in the modules
 *
 * The page inventory (`02-architecture.md` §9) is the source of truth for which
 * pages belong to which panel, and it is expressed in routes, not in copy: the
 * document names `admin/debts.html` and never names the Persian on the link to it.
 * The routes are the app tier's, so the labels on them are too. A label that lived
 * in `debts`'s catalog would be a label Phase 3's `debts` module would have to
 * agree with, and the panel's inventory would then be readable from two places —
 * the routes here and the labels there — that only one of them controls.
 *
 * ## The plural suffixes
 *
 * «نوبت‌ها», «کمپین‌ها» and «گزارش‌ها» carry a ZWNJ before «ها» for the reason
 * `catalog/enums.ts` records at length: the source documents write these compounds
 * run together because a search for U+200C across `docs/knowledge/` returns
 * nothing, and standard Persian orthography joins them. The product renders
 * standard orthography.
 *
 * ## The four panel names
 *
 * `02-architecture.md` §9 names the panels by role — Manager, Doctor, Reception,
 * Customer — and gives no Persian for any of them. The four below are this tier's
 * own; a later design pass may rename them, and renaming is one edit here because
 * no component spells a panel name.
 *
 * The four panel *homes* are not this tier's invention: `02-architecture.md` §7
 * names them, in the `dashboard` row, as the role-scoped home surfaces —
 * «داشبورد من», «برنامه من», «میز کار امروز» and the customer's dashboard. They
 * are quoted here because the `dashboard` module that owns them is not built, and
 * Phase 1's shells need the names the homes will have.
 * ─────────────────────────────────────────────────────────────────────────── */

/** The two ways in, as `panels.html` presents them (`02-architecture.md` §9). */
export const PANELS_PAGE = {
  /** The entry page's own title. */
  title: 'ورود به سامانه',
  /** The line under it. */
  lead: 'یکی از دو مسیر ورود را انتخاب کنید.',
  staff: {
    /**
     * The card's description. It names the credential, which is what a person at
     * this door needs to know — and which the other card's credential differs from.
     * The card's heading is the link, and it is `LOGIN_LABELS.staffTitle` from
     * `auth`: the door's own name is the module's vocabulary and not this tier's.
     */
    description: 'ورود با شماره موبایل و گذرواژه',
  },
  customer: {
    description: `ورود با شماره موبایل و کد یک${ZWNJ}بار`,
  },
} as const

/**
 * The four panels' names, keyed as their routes are.
 *
 * `satisfies Record<string, string>` rather than `as const` alone, so a label is a
 * plain string at every use and the shell does not widen a literal into a key it
 * then has to narrow back.
 */
export const PANEL_NAMES = {
  admin: 'پنل مدیریت',
  doctor: 'پنل پزشک',
  reception: 'پنل پذیرش',
  account: 'پنل مشتری',
} as const satisfies Record<string, string>

/**
 * The four panels' home surfaces, as `02-architecture.md` §7 names them in the
 * `dashboard` row: «مدیر «داشبورد من»، پزشک «برنامه من»، منشی «میز کار امروز»،
 * مشتری dashboard». The customer's is the document's own transliterated word,
 * which is the Persian a clinic reads for a dashboard.
 */
export const PANEL_HOMES = {
  admin: 'داشبورد من',
  doctor: 'برنامه من',
  reception: 'میز کار امروز',
  account: 'داشبورد',
} as const satisfies Record<string, string>

/**
 * One sentence per panel naming its scope, shown under the home's title. The scope
 * is the page inventory of `02-architecture.md` §9 restated for a person, so the
 * sentence and the navigation beside it cannot disagree about what a panel holds.
 */
export const PANEL_SCOPE = {
  admin: 'نمای کامل کلینیک: نوبت‌ها، مشتریان، دوره‌های درمان، مانده‌حساب، کمپین‌ها، خدمات، کارکنان و گزارش‌ها.',
  doctor: 'برنامه روز خود، پرونده مراجعین و دوره‌های درمان خودتان.',
  reception: 'میز کار امروز: نوبت‌ها، دوره‌های درمان، مانده‌حساب، لیدها و مشتریان.',
  account: 'نوبت‌های خود، دوره‌های درمان، پرداخت‌ها و پرونده خودتان.',
} as const satisfies Record<string, string>

/**
 * The navigation labels of the four panels' pages.
 *
 * Keyed by the page rather than by the route, because two panels carry the same
 * page under different routes — `admin/customers` and `reception/customers` — and
 * one label per page keeps the pair from drifting apart. The two that are phrased
 * from the customer's side are the customer panel's own: «نوبت‌های من» against the
 * staff's «نوبت‌ها».
 */
export const NAV_LABELS = {
  /** The panel's home. The label is `PANEL_HOMES[panel]`, not this one. */
  appointments: `نوبت${ZWNJ}ها`,
  customers: 'مشتریان',
  /** `04-roles-permissions.md` §2's «دیدن ماندهحساب», without the verb a nav item does not need. */
  debts: `مانده${ZWNJ}حساب`,
  cycles: `چرخه${ZWNJ}های درمان`,
  campaigns: `کمپین${ZWNJ}ها`,
  services: 'خدمات',
  staff: 'کارکنان',
  reports: `گزارش${ZWNJ}ها`,
  settings: 'تنظیمات',
  /** `04-roles-permissions.md` §2's own phrase for the lead cartable. */
  leads: 'کارتابل لید',
  /** The customer panel's six — five destinations, the sixth being the way out. */
  accountAppointments: `نوبت${ZWNJ}های من`,
  accountCare: `مراقبت${ZWNJ}ها`,
  accountPayments: `پرداخت${ZWNJ}ها`,
  accountProfile: 'پروفایل',
  /** The topbar's sign-out. */
  logout: 'خروج',
} as const satisfies Record<string, string>

/**
 * The screen-reader names of the shell's icon-only controls and its navigation
 * region.
 *
 * An `aria-label` is user-visible text — a screen reader reads it — so §14 puts it
 * in a catalog and not in the component. The icons these label stay *decorative*
 * (`Icon` with no `label`), because a button that announces both its own
 * `aria-label` and an icon's announces the same thing twice.
 */
export const SHELL_ARIA = {
  /** The navigation region's name, which a screen reader uses to skip to it. */
  navigation: 'ناوبری اصلی',
  /** The hamburger's name — the §43 below-1000px drawer's only opener. */
  openMenu: 'باز کردن منو',
} as const satisfies Record<string, string>

/* ── The login forms ───────────────────────────────────────────────────────── */

/** The staff login page, which carries the customer form beside the staff one. */
export const STAFF_LOGIN_PAGE = {
  title: 'ورود کارکنان',
  /** The line above the two forms. */
  lead: 'کارکنان با گذرواژه و مشتریان با کد یک‌بار مصرف وارد می‌شوند.',
} as const

/** The customer login page's own copy, beyond `LOGIN_LABELS`. */
export const CUSTOMER_LOGIN_PAGE = {
  title: 'ورود مشتریان',
  /** The line above the form, naming the credential this door asks for. */
  lead: `کد یک${ZWNJ}بار مصرف به شماره موبایل شما پیامک می‌شود.`,
  /** The link back to the entry page, which is where the other door is. */
  backToEntry: 'بازگشت',
} as const

/**
 * The second step's sentence, naming the mobile the code went to.
 *
 * `09-security.md` §10 permits exactly this disclosure and no more: showing the
 * number confirms which mobile to check without revealing whether any other number
 * has an account. `{mobile}` is filled by the message renderer, which also converts
 * the substituted digits — the number arrives already formatted by `formatPhone`,
 * whose bidi isolates keep the leading zero at the right end (`07-localization.md`
 * §5), and the conversion is idempotent on it.
 */
export const CODE_SENT_TO = 'کد ارسال شده به شماره {mobile} را وارد کنید'

/** The countdown's label. The digits beside it are the minutes and seconds left. */
export const CODE_COUNTDOWN_LABEL = 'اعتبار کد'

/** What the countdown shows when the code's time is up. */
export const CODE_COUNTDOWN_DONE = 'اعتبار کد به پایان رسید'

/** The resend button, which asks for a new code on the same mobile. */
export const REQUEST_NEW_CODE = 'دریافت کد جدید'

/** The field-level sentences the forms raise before they call the module. */
export const FIELD_REQUIRED = {
  mobile: 'شماره موبایل را وارد کنید',
  password: 'گذرواژه را وارد کنید',
  code: 'کد را وارد کنید',
} as const satisfies Record<string, string>

/**
 * The field-level sentences for a value that is present but not acceptable, raised
 * by the same schemas the server re-validates against.
 *
 * `{length}` is filled by the message renderer, which converts the substituted
 * digits — the only place a number reaches these sentences.
 */
export const FIELD_INVALID = {
  mobile: 'شماره موبایل درست نیست.',
  /** The code's own length, which is `auth`'s `oneTimeCodeLength`. */
  codeLength: 'کد باید {length} رقم باشد.',
} as const satisfies Record<string, string>

/**
 * The sentence for a page whose host names no clinic.
 *
 * `02-architecture.md` §11 resolves the tenant from the subdomain, which is a fact
 * about the request and not something the caller typed. A host that names no active
 * tenant has no tenant to issue a code for, and the honest sentence says so without
 * naming the host.
 */
export const NO_TENANT_FOR_THIS_ADDRESS = 'ورود ممکن نیست؛ کلینیک این نشانی شناسایی نشد.'

/**
 * The global error boundary's copy (`09-security.md` §9 names the boundary).
 *
 * This is the page a person sees when the root layout itself failed, which means it
 * replaces the root layout and carries its own `<html>` and `<body>`. The sentence
 * says "try again" and means it: the boundary's own `retry` is the action, and the
 * sentence never blames the person or names an internal detail — `error.message` in
 * production is the framework's generic text and is not rendered here.
 */
export const GLOBAL_ERROR_PAGE = {
  title: 'خطای سامانه',
  lead: 'مشکلی پیش آمد. دوباره تلاش کنید.',
  retry: 'تلاش دوباره',
} as const satisfies Record<string, string>
