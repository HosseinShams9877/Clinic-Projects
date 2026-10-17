/**
 * The customer panel's own demo-match copy — the pieces the demo's account pages add
 * on top of the customers module's CUSTOMER_PANEL catalog.
 *
 * The main app catalog is at its 1000-line cap and CUSTOMER_PANEL is the module's, so
 * the account surfaces' extra Persian lives here, beside the pages that render it. The
 * lint allowlist covers this per-directory catalog file. Values that carry a derived
 * number are functions, the same shape the cycle progress label already uses.
 */

/** «سلام، مینا 🌷» — the dashboard greeting and its surrounding sections. */
export const ACCOUNT_DASHBOARD = {
  /** The greeting, around the person's own first name, with the demo's own flower. */
  greeting: (name: string): string => `سلام، ${name} 🌷`,
  lead: 'خلاصه وضعیت درمان و نوبت‌های شما',
  book: 'رزرو نوبت جدید',
  /** The prominent next-appointment banner. */
  next: {
    label: 'نزدیک‌ترین نوبت شما',
    at: 'ساعت',
    withDoctor: 'دکتر',
    details: 'جزئیات',
    reschedule: 'درخواست جابه‌جایی',
    /** «بیعانه {amount}» — the deposit the booking carries, when it carries one. */
    deposit: 'بیعانه',
    empty: 'نوبت پیش‌رویی ندارید.',
  },
  /** The three KPI tiles. */
  kpi: {
    upcoming: 'نوبت‌های پیش‌رو',
    remaining: 'جلسات باقی‌مانده',
    remainingSub: (total: number): string => `از بسته ${total} جلسه‌ای`,
    balance: 'مانده پرداخت',
    toman: 'تومان',
  },
  /** The latest-care card and its «همه» link. */
  care: {
    title: 'آخرین مراقبت‌های ثبت‌شده',
    all: 'همه',
    empty: 'دستورالعملی برای شما ثبت نشده است.',
  },
  /** The suggested-next-session card. */
  suggested: {
    title: 'جلسه بعدی پیشنهادی',
    due: 'موعد',
    empty: 'دوره درمانی فعالی ندارید.',
    book: 'رزرو این جلسه',
  },
  notes: {
    title: 'یادداشت‌های پزشک',
    empty: 'دستورالعملی برای شما ثبت نشده است.',
  },
} as const

/** «نوبت‌های من» — the appointments page's own card copy. */
export const ACCOUNT_APPOINTMENTS = {
  book: 'رزرو نوبت جدید',
  at: 'ساعت',
  /** «۲ نوبت پیش‌رو · ۸ نوبت در تاریخچه» — the header's count sub, in two parts. */
  countSub: (upcoming: string, past: string): string => `${upcoming} نوبت پیش‌رو · ${past} نوبت در تاریخچه`,
  rebook: 'رزرو مجدد',
  /** «بیعانه {amount}» — the deposit the booking carries. */
  deposit: 'بیعانه',
  noDeposit: 'بدون بیعانه',
} as const

/** «خدمات و مراقبت‌های من» — the care page's own copy. */
export const ACCOUNT_CARE = {
  title: 'خدمات و مراقبت‌های من',
  lead: 'تاریخچه خدمات انجام‌شده و دستورالعمل‌های مراقبتی ثبت‌شده توسط پزشک',
  bookNext: 'رزرو جلسه بعد',
} as const

/** «پرداخت‌های من» — the payments page's own KPI copy. */
export const ACCOUNT_PAYMENTS = {
  lead: 'سوابق بیعانه‌ها، تسویه‌ها و مانده حساب',
  totalPaid: 'مجموع پرداخت‌ها',
  balance: 'مانده پرداخت',
  count: 'تعداد تراکنش',
  toman: 'تومان',
  historyTitle: 'تاریخچه تراکنش‌ها',
} as const



