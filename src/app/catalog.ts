

import { toPersianDigits, ZWNJ } from '@/core/localization'

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
  /** The reception panel's desk — the day's work list, named for the page itself. */
  desk: 'میز کار امروز',
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

export const APPOINTMENTS_PAGE = {
  reception: {
    title: 'نوبت‌های امروز',
    /** The line under the title, naming what the grid's columns are. */
    lead: 'ستون هر پزشک و ساعت نوبت‌های او. برای ثبت نوبت جدید، «نوبت جدید» را باز کنید.',
  },
  admin: {
    title: 'نمایش نوبت‌ها',
    /** The oversight page is read-only, and the sentence says so. */
    lead: 'این صفحه فقط مشاهده است. ثبت و تغییر نوبت در پنل پذیرش انجام می‌شود.',
    /** The filters' own headings. */
    filters: { doctor: 'پزشک', status: 'وضعیت', date: 'تاریخ' },
  },
  doctor: {
    title: 'برنامه من',
    lead: 'برنامه روز خود. ثبت سریع نوبت برای ساعت خالی خودتان.',
  },
  /** The tab bar's three views, keyed as the search param is. */
  tabs: { day: 'روز', week: 'هفته', cartable: 'کارتابل نتیجه ثبت نشده' },
  /** The day grid's empty states. */
  empty: {
    /** A doctor's column with no appointment on the shown day. */
    column: 'نوبتی برای این روز ثبت نشده است.',
    /** A whole day with no row at all. */
    day: 'هیچ نوبتی در این روز نیست.',
    /** The cartable when nothing is outstanding. */
    cartable: 'هیچ نتیجه ثبت‌نشده‌ای وجود ندارد.',
  },
  /** The grid's controls. */
  controls: {
    newAppointment: 'نوبت جدید',
    blockHours: 'بستن یک ساعت',
    arrived: 'حاضر شد',
    noShow: 'عدم حضور',
    cancel: 'لغو نوبت',
    reschedule: 'جابه‌جایی نوبت',
    result: 'ثبت نتیجه',
    today: 'برای امروز',
    previousDay: 'روز قبل',
    nextDay: 'روز بعد',
  },
  /** The column header of the grid's time axis. */
  timeColumn: 'ساعت',
  /** The weekday headers' label when a day has no doctor working it. */
  noDoctors: 'پزشکی در این روز کاری ندارد',
} as const satisfies Record<string, unknown>

/**
 * The three-step booking popup — `10-testing-strategy.md` line 308 names the steps:
 * service → day and time → name and mobile → deposit.
 *
 * The desk's popup is the same three steps in the reception's vocabulary, opened
 * from a slot the grid already knows: the service the visit is for, the day and
 * time the grid offered, and the person the visit is for. The public site's own
 * popup (`booking.html`) is Phase 8; the shell it renders in is this phase's, and
 * the two share an engine and differ in who is typing.
 *
 * Each step's own labels, its placeholders and the sentence it raises when a field
 * is not filled are below, because a step's copy is the step's and no other
 * surface's.
 */
export const BOOKING_POPUP = {
  /** The three steps, in order, as the progress indicator names them. */
  steps: { service: 'خدمت', time: 'روز و ساعت', customer: 'مشتری' },
  titles: {
    service: 'چه خدمتی؟',
    time: 'چه روز و ساعتی؟',
    customer: 'برای چه کسی؟',
  },
  /** The summary the third step shows before the row is written. */
  summary: {
    service: 'خدمت',
    doctor: 'پزشک',
    time: 'زمان',
    price: 'مبلغ',
    deposit: 'بیعانه',
  },
  fields: {
    service: 'خدمت',
    doctor: 'پزشک',
    localDate: 'تاریخ',
    localTime: 'ساعت',
    customerId: 'مشتری',
    customerSearch: 'جستجوی مشتری با شماره موبایل یا نام',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    durationMinutes: 'مدت زمان (دقیقه)',
    priceAtBooking: 'مبلغ (تومان)',
    depositAmount: 'بیعانه (تومان)',
    blockReason: 'دلیل بستن ساعت',
    cancelReason: 'دلیل لغو',
  },
  hints: {
    /** The mobile hint, naming the format the normalizer expects. */
    mobile: 'با صفر شروع شود، بدون فاصله و خط تیره.',
    /** The price hint, naming the unit the field is in. */
    price: 'مبلغ به تومان وارد می‌شود.',
    deposit: 'بیعانه‌ای که هنگام رزرو دریافت می‌شود؛ صفر یعنی بدون بیعانه.',
    blockReason: 'اختیاری — مثلاً «جلسه تیم» یا «تعطیلی موقت».',
  },
  /** The new-customer branch, when the search names nobody. */
  newCustomer: {
    label: 'مشتری جدید',
    lead: 'این شماره در سیستم نیست. نام و نام خانوادگی را وارد کنید تا مشتری ساخته شود.',
  },
  actions: {
    back: 'بازگشت',
    next: 'مرحله بعد',
    confirm: 'ثبت نوبت',
    close: 'بستن',
  },
  /** The one sentence the popup shows when a step is missing a choice. */
  chooseService: 'ابتدا یک خدمت انتخاب کنید.',
  chooseTime: 'ابتدا روز و ساعت را انتخاب کنید.',
  chooseCustomer: 'ابتدا شماره موبایل مشتری را وارد کنید.',
  /** The page's own sentence when the tenant has no service to book against. */
  noServices: 'هیچ خدمتی برای ثبت نوبت تعریف نشده است.',
  /** The duration line under the time field, naming the service's own length. */
  duration: 'مدت زمان این خدمت',
} as const satisfies Record<string, unknown>

/**
 * The slot block popup's own copy — «بستن یک ساعت» is a booking the desk makes
 * against the calendar itself, and its sentence names the hour it closes.
 */
export const BLOCK_HOURS_POPUP = {
  title: 'بستن یک ساعت',
  lead: 'ساعت انتخاب شده برای پزشک بسته می‌شود و دیگر قابل رزرو نیست.',
} as const satisfies Record<string, unknown>

/* ── Phase 3: the customers, services and staff surfaces ─────────────────────
 *
 * The seven pages `02-architecture.md` §9 names for this phase — the reception's
 * customer file and lead cartable, the manager's customer file, the customer
 * profile, the services catalogue, the staff page, and the doctor's own patients.
 * Their copy is here for the same reason Phase 2's three appointments pages are:
 * the module owns the sentences its functions *raise* (`customer.notFound` and its
 * neighbours, through `MESSAGES`), while a page's own titles, column headers,
 * button labels and empty states are composition the app tier does from those.
 *
 * The module catalogs are not repeated here. A key reaches a page through the
 * failure-message lookup, which is the only path a key takes to a sentence.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * The three customer lists — reception, admin and the doctor's own — which are one
 * read through three permissions, and the copy that the three surfaces share.
 *
 * The three are the same rows and the same columns; the three leads differ, because
 * the desk's names the search it offers, the manager's names the oversight and the
 * doctor's names the scope. One object with a `panel` key would be one object whose
 * three halves a reader has to keep apart.
 */
export const CUSTOMERS_PAGE = {
  reception: {
    title: 'مشتریان',
    lead: 'پرونده مشتریان کلینیک. جستجو با نام یا شماره موبایل.',
  },
  admin: {
    title: 'همه مشتریان',
    lead: 'پرونده کامل مشتریان کلینیک، با تاریخچه نوبت‌ها و پرداخت‌ها.',
  },
  doctor: {
    title: 'مراجعین من',
    lead: 'پرونده مشتریانی که پزشک اول آن‌ها شما هستید.',
  },
  search: {
    label: 'جستجو',
    placeholder: 'نام یا شماره موبایل',
    /** The screen-reader name of the button that clears the field. */
    clear: 'پاک کردن جستجو',
  },
  columns: {
    name: 'نام و نام خانوادگی',
    mobile: 'شماره موبایل',
    lifecycle: 'وضعیت پرونده',
    leadStatus: 'وضعیت لید',
    primaryDoctor: 'پزشک اول',
    lastVisit: 'آخرین مراجعه',
    sessions: 'جلسات انجام شده',
    actions: 'عملیات',
  },
  actions: {
    open: 'باز کردن پرونده',
    book: 'ثبت نوبت',
  },
  empty: {
    /** A search that named nobody. */
    noResults: 'مشتری‌ای با این مشخصات پیدا نشد.',
    /** A file with no customers in it at all. */
    noCustomers: 'هنوز مشتری‌ای ثبت نشده است.',
    /** A doctor with no patients of their own. */
    noPatients: 'هنوز مراجعی برای شما ثبت نشده است.',
  },
} as const satisfies Record<string, unknown>

/**
 * The customer profile — `admin/customer/[id]`'s full record.
 *
 * The page's own copy is the section headings, the field labels and the empty
 * states; the customer's facts are the row's, and the consent flags are the four the
 * module writes.
 */
export const CUSTOMER_PROFILE_PAGE = {
  /** `{name}` is filled by the message renderer, and the digits with it. */
  title: 'پرونده {name}',
  lead: 'مشخصات، تاریخچه نوبت‌ها و پرداخت‌ها، و تنظیمات ارسال.',
  sections: {
    details: 'مشخصات',
    contact: 'راه‌های ارتباطی',
    medical: 'پرونده پزشکی',
    appointments: 'نوبت‌ها',
    payments: 'پرداخت‌ها',
    consent: 'تنظیمات ارسال',
  },
  fields: {
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    birthDate: 'تاریخ تولد',
    acquisitionSource: 'نحوه آشنایی',
    residenceArea: 'محله سکونت',
    primaryDoctor: 'پزشک اول',
    primaryClinic: 'کلینیک اصلی',
    firstVisit: 'اولین مراجعه',
    lastVisit: 'آخرین مراجعه',
    completedSessions: 'جلسات انجام شده',
    chargedTotal: 'مجموع مبالغ',
    paidTotal: 'مجموع پرداخت‌ها',
    balance: 'مانده حساب',
    medicalHistory: 'سوابق پزشکی',
    sensitivities: 'حساسیت‌ها',
    doctorNote: 'یادداشت پزشک',
  },
  consent: {
    sms: 'پیامک',
    whatsApp: 'واتساپ',
    phone: 'تماس تلفنی',
    beforeAfter: 'استفاده از عکس‌های قبل و بعد',
    lead: 'کانال‌هایی که کلینیک می‌تواند با آن‌ها با شما تماس بگیرد.',
    save: 'ذخیره تنظیمات ارسال',
    saved: 'تنظیمات ارسال ذخیره شد.',
  },
  note: {
    save: 'ذخیره یادداشت',
    saved: 'یادداشت ذخیره شد.',
    placeholder: 'یادداشت بالینی این مشتری را اینجا بنویسید.',
  },
  edit: {
    title: 'ویرایش پرونده',
    save: 'ذخیره تغییرات',
    saved: 'تغییرات پرونده ذخیره شد.',
    cancel: 'انصراف',
  },
  history: {
    date: 'تاریخ',
    time: 'ساعت',
    service: 'خدمت',
    doctor: 'پزشک',
    status: 'وضعیت',
    price: 'مبلغ',
    amount: 'مبلغ',
    method: 'روش پرداخت',
    kind: 'نوع پرداخت',
    paidAt: 'تاریخ پرداخت',
  },
  empty: {
    appointments: 'این مشتری هنوز نوبتی نداشته است.',
    payments: 'برای این مشتری پرداختی ثبت نشده است.',
  },
} as const satisfies Record<string, unknown>

/**
 * The lead cartable — its KPI row, its filter chips and its table.
 *
 * The four KPI labels are the cartable's own vocabulary and are the module's
 * `LEAD_STATUS_LABELS` restated as a count, kept in step by review and not by a
 * derived name — the four counts are not the four states, and a derivation would be
 * a derivation that drops the count.
 */
export const LEADS_PAGE = {
  title: 'کارتابل لید',
  lead: 'افرادی که با کلینیک تماس گرفته‌اند و هنوز خدمتی دریافت نکرده‌اند.',
  counts: {
    new: 'بی‌پاسخ',
    following: 'در حال پیگیری',
    converted: 'تبدیل شده این ماه',
    lost: 'از دست رفته',
  },
  chips: {
    all: 'همه',
    new: 'جدید',
    following: 'در پیگیری',
    converted: 'تبدیل شده',
    lost: 'از دست رفته',
  },
  newLead: {
    title: 'ثبت لید دستی',
    lead: 'شماره و نام فردی که تماس گرفته یا مراجعه کرده است.',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    source: 'نحوه آشنایی',
    /** The sentence the source select renders when a filter named nothing. */
    sourceEmpty: 'هیچ منبعی با این نام پیدا نشد.',
    note: 'یادداشت',
    notePlaceholder: 'خلاصه تماس یا درخواست این فرد.',
    save: 'ثبت لید',
    saved: 'لید ثبت شد.',
  },
  columns: {
    name: 'نام و نام خانوادگی',
    mobile: 'شماره موبایل',
    source: 'نحوه آشنایی',
    status: 'وضعیت',
    nextContact: 'تماس بعدی',
    createdAt: 'تاریخ ثبت',
    actions: 'عملیات',
  },
  actions: {
    followUp: 'تماس',
    followUpTitle: 'ثبت پیگیری',
    nextContactAt: 'تاریخ تماس بعدی',
    confirm: 'ثبت پیگیری',
    book: 'نوبت',
    lost: 'از دست رفته',
    lostConfirm: 'این لید به عنوان از دست‌شده ثبت شود؟',
    lostConfirmYes: 'بله، از دست رفته',
    cancel: 'انصراف',
  },
  empty: 'هیچ لید بازی در کارتابل نیست.',
} as const satisfies Record<string, unknown>

/**
 * The treatment-cycle surfaces — the desk's contact list, the manager's oversight, and
 * the doctor's own courses.
 *
 * The three pages render the same row and differ in which rows and which writes, so the
 * copy names the three audiences and shares one set of column headers and action
 * labels: a course that the desk calls about is the same course the manager reads, and
 * a sentence spelled twice would be a sentence the two pages could disagree about.
 *
 * The abandonment reasons are not restated here — they are the closed list
 * `04-roles-permissions.md` §6 owns, and the page renders them from the cycles module's
 * own `ABANDONMENT_REASON_LABELS`.
 */
export const CYCLES_PAGE = {
  reception: {
    title: 'دوره‌های فعال با موعد رسیده',
    lead: 'مشتریانی که موعد جلسه بعدی رسیده و هنوز نوبت ندارند. تماس بگیرید و نتیجه را ثبت کنید.',
  },
  admin: {
    title: 'دوره‌های درمان',
    lead: 'نگاه کلی کلینیک به دوره‌های در حال انجام، موعد رسیده و ریزش. تکمیل دوره‌های نامحدود را مدیر انجام می‌دهد.',
  },
  doctor: {
    title: 'چرخه درمان',
    lead: 'دوره‌های درمانی که شما آن‌ها را انجام می‌دهید.',
  },
  columns: {
    customer: 'مشتری',
    service: 'خدمت',
    doctor: 'پزشک',
    progress: 'جلسات',
    /** The noun the unbounded course's progress column names, as in «۳ جلسه». */
    session: 'جلسه',
    /** The separator the bounded course's progress column reads, as in «۳ از ۶». */
    of: 'از',
    interval: 'فاصله',
    nextDue: 'موعد جلسه بعدی',
    lastContact: 'آخرین تماس',
    nextContact: 'تماس بعدی',
    status: 'وضعیت',
    reason: 'علت ریزش',
    mobile: 'شماره موبایل',
    actions: 'عملیات',
  },
  actions: {
    contact: 'ثبت نتیجه تماس',
    contactTitle: 'ثبت نتیجه تماس',
    nextContactAt: 'تاریخ تماس بعدی',
    confirm: 'ثبت',
    book: 'رزرو جلسه بعدی',
    bookDate: 'روز',
    bookTime: 'ساعت',
    abandon: 'منصرف شد',
    abandonTitle: 'ثبت ریزش دوره',
    abandonReason: 'علت ریزش',
    abandonReasonPrompt: 'علت ریزش را از فهرست انتخاب کنید.',
    abandonConfirmYes: 'بله، منصرف شد',
    complete: 'تکمیل دوره',
    completeConfirm: 'این دوره تکمیل شود؟ برای دوره‌های نامحدود تنها مدیر این کار را انجام می‌دهد.',
    completeConfirmYes: 'بله، تکمیل شد',
    cancel: 'انصراف',
    saved: 'ثبت شد.',
  },
  empty: {
    list: 'هیچ دوره‌ای برای تماس در دسترس نیست.',
    clinic: 'هنوز دوره‌ای ثبت نشده است.',
    doctor: 'شما هنوز دوره‌ای ندارید.',
  },
} as const satisfies Record<string, unknown>

/**
 * The services catalogue, and the deactivation that replaces deletion.
 *
 * The page renders the catalogue's own columns and the state that replaces a remove,
 * so its copy names the state and not a deletion: there is no delete button here and
 * no sentence for one, which is DoD 3 held at the surface as well as the module.
 */
export const SERVICES_PAGE = {
  title: 'خدمات',
  lead: 'فهرست خدمات کلینیک. غیرفعال کردن یک خدمت آن را از نوبت‌دهی حذف می‌کند ولی تاریخچه نوبت‌ها دست‌نخورده می‌ماند.',
  new: {
    title: 'افزودن خدمت',
    save: 'ثبت خدمت',
    saved: 'خدمت ثبت شد.',
    name: 'نام خدمت',
    category: 'دسته‌بندی',
    price: 'مبلغ (تومان)',
    deposit: 'بیعانه (تومان)',
    duration: 'مدت زمان (دقیقه)',
    sessions: 'تعداد جلسات پیش‌فرض',
    interval: 'فاصله بین جلسات (روز)',
    showPrice: 'نمایش مبلغ در سایت',
  },
  edit: {
    title: 'ویرایش خدمت',
    save: 'ذخیره تغییرات',
    saved: 'تغییرات خدمت ذخیره شد.',
    cancel: 'انصراف',
  },
  doctors: {
    title: 'پزشکان مجاز',
    lead: 'پزشکانی که می‌توانند این خدمت را انجام دهند.',
    save: 'ذخیره پزشکان',
    saved: 'پزشکان مجاز ذخیره شدند.',
    none: 'هیچ پزشکی در این کلینیک ثبت نشده است.',
  },
  columns: {
    name: 'نام خدمت',
    category: 'دسته‌بندی',
    price: 'مبلغ',
    duration: 'مدت زمان',
    deposit: 'بیعانه',
    doctors: 'پزشکان مجاز',
    status: 'وضعیت',
    actions: 'عملیات',
  },
  actions: {
    activate: 'فعال کردن',
    deactivate: 'غیرفعال کردن',
    deactivateConfirm: 'این خدمت از نوبت‌دهی حذف شود؟ تاریخچه نوبت‌های قبلی دست‌نخورده می‌ماند.',
    deactivateConfirmYes: 'بله، غیرفعال شود',
    doctors: 'پزشکان',
    edit: 'ویرایش',
  },
  empty: 'هنوز خدمتی ثبت نشده است.',
  validation: {
    money: 'مبلغ باید یک عدد صحیح به تومان باشد.',
    count: 'مدت زمان و تعداد جلسات باید عدد صحیح باشند.',
  },
} as const satisfies Record<string, unknown>

/**
 * The staff page — its permission matrix and its leave table.
 *
 * The matrix's own column header and row labels come from `@/core/localization`'s
 * `PERMISSION_LABELS` and `ROLE_LABELS`, because those are the closed sets and this
 * page renders them; nothing here restates a permission's name. The page's own copy
 * is the chrome around them.
 */
export const STAFF_PAGE = {
  title: 'کارکنان',
  lead: 'نقش و دسترسی‌های هر کاربر، و درخواست‌های مرخصی پزشکان.',
  invite: {
    title: 'دعوت کاربر',
    lead: 'شماره موبایل، نام و نقش کاربر جدید را وارد کنید.',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    password: 'رمز عبور اولیه',
    role: 'نقش',
    save: 'دعوت کاربر',
    saved: 'کاربر دعوت شد.',
    cancel: 'انصراف',
  },
  matrix: {
    title: 'ماتریس دسترسی‌ها',
    lead: 'هر ستون یک نقش و هر ردیف یک دسترسی است. تغییرات بلافاصله اعمال می‌شوند.',
    /** The manager column's badge, rendered in place of the checkboxes it does not have. */
    managerLocked: 'همیشه',
    hint: 'ستون مدیر قفل است و کسی نمی‌تواند دسترسی خودش را تغییر دهد.',
    /** The modal's own note, which says the change is for this one person (`04-roles-permissions.md` §2.2). */
    note: 'تغییرات فقط برای همین کاربر اعمال می‌شوند.',
    /** The count's two halves, as the modal's header renders them: «۵ از ۱۶». */
    countOf: 'از',
    countTotal: 16,
    save: 'ذخیره دسترسی‌ها',
    saved: 'دسترسی‌ها ذخیره شدند.',
  },
  membership: {
    active: 'فعال',
    inactive: 'غیرفعال',
    activate: 'فعال کردن',
    deactivate: 'غیرفعال کردن',
    applyRole: 'اعمال نقش جدید',
    leaveTitle: 'درخواست‌های مرخصی',
    leaveEmpty: 'هیچ درخواست مرخصی‌ای وجود ندارد.',
    approve: 'تأیید',
    reject: 'رد',
    /** The leave table's own three headers, which the page's `columns` do not name. */
    leaveFrom: 'از تاریخ',
    leaveTo: 'تا تاریخ',
    leaveStatus: 'وضعیت',
    leaveApprover: 'تأییدکننده',
  },
  columns: {
    name: 'نام و نام خانوادگی',
    mobile: 'شماره موبایل',
    role: 'نقش',
    status: 'وضعیت',
    permissions: 'دسترسی‌ها',
    actions: 'عملیات',
  },
  empty: 'هنوز کاربری دعوت نشده است.',
  audit: {
    title: 'تاریخچه تغییرات دسترسی',
    empty: 'هیچ تغییری ثبت نشده است.',
    actor: 'انجام‌دهنده',
    action: 'عملیات',
    at: 'زمان',
    detail: 'جزئیات',
  },
} as const satisfies Record<string, unknown>

/**
 * The four debt surfaces' copy — Phase 5.
 *
 * The three staff pages are one row read through three permissions, and the copy each
 * one renders is its own because the three facts are different: the desk owes a call,
 * the manager oversees, and the doctor reads their own. The customer's own history is
 * the fourth surface and the one with no permission at all.
 */
export const DEBTS_PAGE = {
  reception: {
    title: 'بدهکاران',
    lead: 'بدهی‌های گذشته از سررسید، از قدیمی‌ترین. تماس بگیرید، نتیجه را ثبت کنید و در صورت نیاز سررسید را تغییر دهید.',
  },
  admin: {
    title: 'بدهی‌ها',
    lead: 'نگاه کلی کلینیک به بدهی‌های باز. این صفحه فقط خواندنی است؛ ثبت پرداخت و پیگیری در صفحه پیشخوان انجام می‌شود.',
  },
  doctor: {
    title: 'بدهی‌های من',
    lead: 'بدهی‌های مراجعینی که جلسه‌های آن‌ها را شما انجام داده‌اید.',
  },
  columns: {
    customer: 'مشتری',
    mobile: 'شماره موبایل',
    charged: 'مبلغ کل',
    discount: 'تخفیف',
    paid: 'پرداختی',
    balance: 'بدهی',
    dueDate: 'سررسید',
    followUp: 'آخرین پیگیری',
    nextContact: 'تماس بعدی',
    actions: 'عملیات',
  },
  buckets: {
    overdue30: 'بیش از ۳۰ روز',
    overdue7: 'بیش از ۷ روز',
    overdue: 'گذشته از سررسید',
    dueSoon: 'نزدیک سررسید',
    empty: 'بدهی‌ای در این دسته نیست.',
  },
  actions: {
    payment: 'ثبت پرداخت',
    paymentTitle: 'ثبت پرداخت',
    amount: 'مبلغ پرداختی',
    method: 'روش پرداخت',
    methodEmpty: 'روشی یافت نشد.',
    kind: 'نوع پرداخت',
    kindEmpty: 'نوعی یافت نشد.',
    discountAmount: 'مبلغ تخفیف',
    discountReason: 'علت تخفیف',
    note: 'یادداشت',
    confirm: 'ثبت',
    cancel: 'انصراف',
    followUp: 'ثبت پیگیری',
    followUpTitle: 'ثبت پیگیری',
    nextContactAt: 'تاریخ تماس بعدی',
    reschedule: 'تغییر سررسید',
    rescheduleTitle: 'تغییر سررسید',
    dueDate: 'سررسید جدید',
    saved: 'ثبت شد.',
  },
} as const satisfies Record<string, unknown>

/**
 * The customer's own money — `account/payments.html`, «پرداخت‌های من».
 *
 * The panel has no permission primitive; the session's own `customerId` is the scope,
 * and the copy names what the customer sees rather than what the clinic owes.
 */
export const PAYMENTS_PAGE = {
  title: 'پرداخت‌های من',
  lead: 'پرداخت‌های شما و بدهی باز شما. هر پرداخت به یک نوبت ثبت شده است.',
  columns: {
    date: 'تاریخ',
    appointment: 'نوبت',
    kind: 'نوع',
    method: 'روش',
    amount: 'مبلغ',
    discount: 'تخفیف',
    note: 'یادداشت',
  },
  summary: {
    charged: 'مبلغ کل',
    discount: 'تخفیف',
    paid: 'پرداختی',
    balance: 'بدهی باز',
    settled: 'هیچ بدهی بازی ندارید.',
  },
  empty: 'هنوز پرداختی ثبت نشده است.',
} as const satisfies Record<string, unknown>


export const DESK_PAGE = {
  title: 'میز کار امروز',
  lead: 'کارهای امروز: نوبت‌ها، نتایج ثبت‌نشده، تماس دوره‌ها، مانده‌حساب، لیدهای جدید و پیام‌های امروز.',
  /** The six sections, as the page orders them — the day's own order of work. */
  sections: {
    appointments: 'نوبت‌های امروز',
    unrecorded: 'نتایج ثبت‌نشده',
    arrivals: 'منتظر ورود',
    cycles: 'تماس دوره‌های درمان',
    debts: 'مانده‌حساب سررسید شده',
    leads: 'لیدهای جدید',
    reminders: 'پیام‌های امروز',
  },
  /** The one-line summary the section's header carries beside its name. */
  counts: {
    one: 'یک مورد',
    /** Persian plural, for the counts above one. */
    many: (n: number) => `${toPersianDigits(n)} مورد`,
    none: 'موردی نیست',
  },
  columns: {
    time: 'ساعت',
    name: 'نام و نام خانوادگی',
    mobile: 'موبایل',
    service: 'خدمت',
    doctor: 'پزشک',
    status: 'وضعیت',
    kind: 'نوع پیام',
    text: 'متن پیام',
  },
  /** The cycle row's service and the session the desk owes a call about, one line. */
  sessionOf: (serviceName: string, sessionNumber: number) =>
    `${serviceName} — جلسه ${toPersianDigits(sessionNumber)}`,
  /** The row's link into the page that owns the work. */
  links: {
    allAppointments: 'همه نوبت‌ها',
    allCycles: 'همه دوره‌ها',
    allDebts: 'همه مانده‌حساب',
    allLeads: 'همه لیدها',
    allCustomers: 'همه مشتریان',
  },
  /** The page's whole point, shown when every section is empty. */
  empty: 'کار امروز تمام است.',
} as const satisfies Record<string, unknown>


export const CAMPAIGNS_PAGE = {
  title: `کمپین${ZWNJ}ها`,
  lead: 'ساخت کمپین با کمک دستیار، پیش‌نمایش تعداد مخاطبان، تأیید و فعال‌سازی، و گزارش ارسال‌ها.',
  builder: {
    title: 'کمپین جدید',
    lead: 'متن کوتاهی بنویسید؛ دستیار یک پیشنهاد می‌دهد. می‌توانید آن را ویرایش کنید.',
    /** The assistant's box, which the manager fills before the form is. */
    assistant: {
      title: 'دستیار کمپین',
      lead: 'هدف کمپین را به فارسی بنویسید تا گروه مخاطبان و متن پیشنهاد شوند.',
      placeholder: 'مثلاً: یک کمپین بساز برای همه مشتریانی که تاریخ تولدشان در مهر است',
      interpret: 'پیشنهاد بگیر',
      /** The label of the button that takes a proposal into the builder's fields. */
      apply: 'اعمال پیشنهاد',
    },
    fields: {
      name: 'نام کمپین',
      type: 'نوع کمپین',
      channel: 'کانال ارسال',
      audienceGroup: 'گروه مخاطبان',
      messageText: 'متن پیام',
      scheduleKind: 'زمان‌بندی',
      localDate: 'تاریخ ارسال',
      localTime: 'ساعت ارسال',
      dailyCap: 'سقف ارسال روزانه',
      isRecurring: 'تکرار شونده',
    },
    /** The schedule field's three options, keyed as the enum is. */
    scheduleOptions: {
      ONE_TIME: 'یک‌بار',
      DAILY_AT: 'روزانه در ساعت مشخص',
      MONTHLY_DAY: 'ماهانه در روز مشخص',
    },
       hints: {
      /** The count the preview renders beside the group the manager chose. */
      audienceCount: (n: number) => `${toPersianDigits(n)} مشتری در این گروه`,
      /** The count's loading state, before a number arrives. */
      audienceCountLoading: 'در حال شمارش مخاطبان…',
      /** The `{name}` and `{amount}` placeholders the text may carry. */
      placeholders: 'از {name} برای نام مشتری و {amount} برای مبلغ مانده استفاده کنید.',
      dailyCap: 'خالی یعنی بدون سقف.',
      /** The Jalali date field's placeholder, as the builder's form shows it. */
      datePlaceholder: '۱۴۰۵-۰۷-۰۱',
      /** The time field's own placeholder, which is also the value it carries by default. */
      defaultTime: '09:00',
    },
    validation: {
      /** The date the schedule kinds below a recurring one need and the form did not send. */
      scheduleRequired: 'تاریخ ارسال کمپین الزامی است.',
      /** A daily cap that is not a whole number, which the column cannot store. */
      dailyCap: 'سقف ارسال روزانه باید یک عدد صحیح باشد.',
    },
    actions: {
      create: 'ساخت پیش‌نویس کمپین',
      created: 'پیش‌نویس کمپین ساخته شد.',
      cancel: 'انصراف',
    },
  },
  /** The row's own five states, each the one action a state permits. */
  rowActions: {
    submit: 'ارسال برای تأیید',
    submitted: 'کمپین برای تأیید ارسال شد.',
    approve: 'تأیید',
    approved: 'کمپین تأیید شد.',
    activate: 'فعال کردن',
    activated: 'کمپین فعال شد.',
    pause: 'توقف موقت',
    paused: 'کمپین متوقف شد.',
    resume: 'از سرگیری',
    resumed: 'کمپین از سر گرفته شد.',
    /** The gate's own sentence, when the approver is the creator. */
    cannotApproveOwn: 'تأیید کمپین باید توسط شخص دیگری غیر از سازنده آن انجام شود.',
  },
  /** The results table's own columns and counts. */
  results: {
    title: 'گزارش کمپین‌ها',
    columns: {
      name: 'نام کمپین',
      type: 'نوع',
      audience: 'گروه مخاطبان',
      status: 'وضعیت',
      schedule: 'زمان‌بندی',
      sent: 'ارسال شده',
      suppressed: 'متوقف شده',
      appointments: 'نوبت‌های ناشی از کمپین',
      createdAt: 'تاریخ ساخت',
      actions: 'عملیات',
    },
    /** The two counts a row carries, as one line each. */
    counts: {
      none: 'بدون ارسال',
      one: 'یک ارسال',
      many: (n: number) => `${toPersianDigits(n)} ارسال`,
    },
    empty: 'هنوز کمپینی ساخته نشده است.',
  },
} as const satisfies Record<string, unknown>
