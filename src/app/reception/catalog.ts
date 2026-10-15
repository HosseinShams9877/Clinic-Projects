/**
 * Reception-panel copy, split out of `src/app/catalog.ts`.
 *
 * `src/app/catalog.ts` sits at its 1000-line cap, so the reception pages' own Persian
 * strings live here and are re-exported from the main catalog for callers that import
 * from there. Nothing in the main catalog was moved or renamed — this file only *adds*.
 * The rule is the same: no Persian literal in a component; every reception sentence is a
 * key here.
 */

import { ZWNJ } from '@/core/localization'

/** The appointments page's reception-specific copy (beyond the shared `APPOINTMENTS_PAGE`). */
export const RECEPTION_APPOINTMENTS = {
  /** The grid footer legend: how a booked cell says who booked it. */
  legend: {
    platform: 'رزرو مشتری در سایت',
    secretary: 'ثبت شما',
  },
  /** The row the grid draws for the gap between a doctor's two shifts. */
  breakRow: 'استراحت میان دو شیفت',
  /** The reminder card's badge + follow-up action, by the message's category. */
  reminder: {
    cycle: { badge: 'چرخه درمان', action: 'دیدن فهرست' },
    balance: { badge: 'بدهکاری', action: 'یادآوری پرداخت' },
    followUp: { badge: 'پیگیری', action: 'کارتابل لید' },
    general: { badge: 'یادآوری', action: 'دیدن فهرست' },
  },
} as const

/** The desk («میز کار امروز») copy the page composes inline, kept out of the component. */
export const RECEPTION_DESK = {
  /** «نتیجه نوبت {ساعت} ثبت نشده» — the unrecorded-result task, around the time. */
  taskResultPendingPre: 'نتیجه نوبت ',
  taskResultPendingPost: ' ثبت نشده',
  /** «{n} بدهی سررسیدشان گذشته» — the past-due debts task. */
  taskDebtsOverdue: 'بدهی سررسیدشان گذشته',
  /** «مجموع {مبلغ}» — the summed overdue balance line. */
  taskDebtTotalPre: 'مجموع ',
  /** «{n} کار برای امروز» — the header's task count. */
  countTasksSuffix: 'کار برای امروز',
  /** The task rows' action-button labels. */
  actionRecordResult: 'ثبت نتیجه',
  actionFollowDebt: 'پیگیری بدهی',
  actionSendMessage: 'ارسال پیام',
} as const


/** The cycles page's reception-specific copy — the KPI tiles, the tabs, and the chip filter. */
export const RECEPTION_CYCLES = {
  /** The four KPI tiles above the contact-list table. */
  kpi: {
    overdue: 'عقب‌افتاده',
    todayContact: 'تماس امروز',
    sessionsToday: 'جلسه ثبت‌شده امروز',
    autoSms: 'پیامک خودکار رفته',
  },
  /**
   * The page's two tabs: the follow-up queue the clock has made, and every open
   * course beside it.
   */
  tabs: {
    list: 'در لیست تماس',
    active: 'همه‌ی فعال‌ها',
    ariaLabel: 'نمایش چرخه‌های درمان',
  },
  /** The chip filter above the table. */
  filter: {
    all: 'همه',
    overdue: 'عقب‌افتاده',
    notContacted: 'تماس نگرفته',
  },
} as const

/**
 * The debts page's reception-specific copy — the three KPI tiles above the buckets.
 *
 * The average-delay tile is gone: an average across debts of different sizes is not a
 * debt, and the row's own `daysOverdue` column carries the fact per debt, which is what
 * the desk actually calls about. Three tiles remain — the total, the past-due count,
 * and what came in this month.
 */
export const RECEPTION_DEBTS = {
  kpi: {
    collected: 'وصول‌شده این ماه',
    overdue: 'سررسید گذشته',
    total: 'مجموع مانده',
  },
  /** The «روز» unit, appended to a day count in a row's own `daysOverdue` column. */
  days: 'روز',
  /** The chip filter's «all» label; the bucket labels come from the module. */
  filterAll: 'همه',
  /** The «ثبت دریافت» (m-pay) form's merged fields. */
  pay: {
    remainingAfter: 'مانده پس از این',
    newDueDate: 'اگر تسویه نشد، سررسید جدید',
  },
} as const

/** The leads page's reception-specific copy — the four KPI tiles. */
export const RECEPTION_LEADS = {
  kpi: {
    unanswered: 'بی‌پاسخ',
    conversionRate: 'نرخ تبدیل',
    total: 'کل لیدها',
    following: 'در حال پیگیری',
  },
} as const

/** The customers page's reception-specific copy — the lifecycle chips and the detail route. */
export const RECEPTION_CUSTOMERS = {
  /** The lifecycle chip filter above the directory table. */
  filter: {
    all: 'همه',
    customer: 'مشتری',
    lead: 'لید',
  },
  /** The read-only detail route's own copy. */
  detail: {
    back: 'بازگشت به فهرست مشتریان',
  },
  /** The read-only record's two tabs. */
  tabs: {
    summary: 'خلاصه پرونده',
    injections: 'نقشه تزریق',
  },
  /** The «افزودن مشتری» dialog. */
  add: {
    trigger: 'افزودن مشتری',
    title: 'افزودن مشتری',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    source: 'نحوه آشنایی',
    sourcePlaceholder: 'انتخاب کنید',
    submit: 'ثبت مشتری',
    cancel: 'انصراف',
    error: 'ثبت نشد. نام و شماره موبایل را بررسی کنید.',
  },
  /** The CSV export button. */
  exportLabel: 'خروجی Excel',
} as const

/**
 * The four debt surfaces' copy — Phase 5.
 */
export const DEBTS_PAGE = {
  reception: {
    title: `مانده${ZWNJ}حساب`,
    lead: 'بدهی‌های گذشته از سررسید، از قدیمی‌ترین. تماس بگیرید، نتیجه را ثبت کنید و در صورت نیاز سررسید را تغییر دهید.',
  },
  admin: {
    title: `مانده${ZWNJ}حساب`,
    lead: 'نگاه کلی کلینیک به بدهی‌های باز. این صفحه فقط خواندنی است؛ ثبت پرداخت و پیگیری در صفحه پیشخوان انجام می‌شود.',
  },
  doctor: {
    title: `مانده${ZWNJ}حساب`,
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
    daysOverdue: 'روز تأخیر',
    lastFollowUp: 'آخرین پیگیری',
    nextContact: 'تماس بعدی',
    actions: 'عملیات',
  },
  tabs: {
    everyone: 'همه بدهکاران',
    all: 'همه پیگیری‌ها',
    today: 'پیگیری امروز',
    unfollowed: 'بدون پیگیری',
  },
  buckets: {
    overdue30: 'بیش از ۳۰ روز',
    overdue7: 'بیش از ۷ روز',
    overdue: 'گذشته از سررسید',
    dueSoon: 'نزدیک سررسید',
    empty: 'بدهی‌ای در این دسته نیست.',
  },
  search: {
    label: 'جستجو',
    placeholder: 'نام یا شماره موبایل',
    clear: 'پاک کردن جستجو',
  },
  filter: {
    doctor: 'پزشک',
    allDoctors: 'همه پزشکان',
    followUpDate: 'تاریخ پیگیری',
  },
  total: {
    label: 'جمع کل',
    filteredLabel: 'جمع نتایج فیلترشده',
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
    followUpNote: 'خلاصه تماس',
    followUpNotePlaceholder: 'مثلاً: قول داد آخر هفته پرداخت کند.',
    previousFollowUp: 'یادداشت تماس قبلی',
    previousNoteLabel: 'یادداشت',
    previousAtLabel: 'تاریخ',
    noPreviousNote: 'بدون یادداشت',
    reschedule: 'تغییر سررسید',
    rescheduleTitle: 'تغییر سررسید',
    dueDate: 'سررسید جدید',
    saved: 'ثبت شد.',
  },
  dash: '—',
  days: 'روز',
} as const satisfies Record<string, unknown>