/**
 * The public site's Persian copy — `02-architecture.md` §9's eight pages.
 *
 * `src/app/catalog.ts` is at ADR-0007's 1000-line ceiling, so the public surface's
 * copy lives in this module's own catalog, which is the other place
 * `eslint.config.mjs`'s `RENDER_IGNORES` allows a Persian literal. Every string the
 * eight pages render is here; a component that grows its own literal is a
 * localization finding.
 */

import { toPersianDigits } from '@/core/localization'

/** One item in the header's horizontal menu and the footer's link list. */
export interface PublicNavLink {
  readonly href: string
  readonly label: string
}

/** One card in the home page's trust bar (`08-ui-design-system.md` §31). */
export interface TrustItem {
  readonly icon: 'customers' | 'appointment' | 'success' | 'money'
  readonly title: string
  readonly subtitle: string
}

export const PUBLIC_LAYOUT = {
  title: {
    default: 'کلینیک زیبایی',
    template: '%s | کلینیک زیبایی',
  },
  description: 'کلینیک تخصصی زیبایی و پوست، با پزشکان مجرب و خدمات تخصصی.',
  /** The brand the header shows when the host names no active clinic. */
  brandFallback: 'کلینیک زیبایی',
  bookingCta: { href: '/booking', label: 'رزرو نوبت' },
  /** The header's three landmark names, for the screen reader and nobody else. */
  aria: {
    primaryNav: 'منوی اصلی',
    menu: 'منو',
    mobileNav: 'منوی موبایل',
  },
  nav: [
    { href: '/', label: 'خانه' },
    { href: '/services', label: 'خدمات' },
    { href: '/doctors', label: 'پزشکان' },
    { href: '/about', label: 'درباره ما' },
    { href: '/contact', label: 'تماس و مشاوره' },
    { href: '/panels', label: 'ورود کاربران' },
  ] as readonly PublicNavLink[],
  footer: {
    aboutTitle: 'درباره کلینیک',
    about:
      'کلینیک تخصصی زیبایی و پوست، با بیش از یک دهه تجربه در ارائه خدمات تخصصی پوست، مو و زیبایی.',
    linksTitle: 'دسترسی سریع',
    contactTitle: 'تماس با ما',
    hoursTitle: 'ساعات کاری',
    hours: 'شنبه تا پنجشنبه، ۹:۰۰ تا ۱۸:۰۰',
    copyright: (year: number) => `© ${toPersianDigits(year)} کلینیک زیبایی. تمامی حقوق محفوظ است.`,
  },
} as const

export const PUBLIC_HOME = {
  hero: {
    badge: 'کلینیک تخصصی پوست و زیبایی',
    title: 'زیبایی تو،',
    titleHighlight: 'با دستان متخصص',
    lead:
      'خدمات تخصصی پوست، مو و زیبایی را با جدیدترین دستگاه‌ها و پزشکان مجرب تجربه کن. رزرو نوبت آنلاین، فقط در چند دقیقه.',
    primaryCta: { href: '/booking', label: 'رزرو نوبت آنلاین' },
    secondaryCta: { href: '/services', label: 'مشاهده خدمات' },
    mediaAlt: 'فضای کلینیک',
  },
  trust: {
    title: 'چرا کلینیک ما؟',
    items: [
      { icon: 'customers', title: 'بیش از ۱۰٬۰۰۰ مراجع', subtitle: 'رضایت مراجعان ما' },
      { icon: 'appointment', title: 'رزرو آنلاین', subtitle: 'بدون انتظار و صف' },
      { icon: 'success', title: 'پزشکان متخصص', subtitle: 'با تجربه و مجرب' },
      { icon: 'money', title: 'قیمت شفاف', subtitle: 'مشاهده قبل از رزرو' },
    ] as readonly TrustItem[],
  },
  services: {
    title: 'خدمات ما',
    lead: 'مجموعه‌ای کامل از خدمات تخصصی پوست و زیبایی',
    viewAll: 'مشاهده همه خدمات',
    priceFrom: 'از',
    duration: (minutes: number) => `${toPersianDigits(minutes)} دقیقه`,
    empty: 'به‌زودی خدمات کلینیک در اینجا نمایش داده می‌شوند.',
  },
  doctors: {
    title: 'پزشکان ما',
    lead: 'تیم متخصص و باتجربه کلینیک',
    viewAll: 'مشاهده همه پزشکان',
    visit: 'صفحه پزشک',
    empty: 'به‌زودی پزشکان کلینیک در اینجا نمایش داده می‌شوند.',
  },
  beforeAfter: {
    title: 'نتایج درمان‌ها',
    lead: 'تصاویر قبل و بعد، با رضایت کتبی مراجعان',
    before: 'قبل',
    after: 'بعد',
    empty: 'نمونه‌ای با رضایت کتبی منتشر نشده است.',
  },
} as const

export const PUBLIC_SERVICES = {
  title: 'خدمات کلینیک',
  lead: 'مجموعه‌ای کامل از خدمات تخصصی پوست، مو و زیبایی',
  searchPlaceholder: 'جستجوی خدمت…',
  priceFrom: 'از',
  free: 'رایگان',
  duration: (minutes: number) => `${toPersianDigits(minutes)} دقیقه`,
  sessions: (count: number) => `${toPersianDigits(count)} جلسه`,
  book: 'رزرو این خدمت',
  empty: 'هیچ خدمتی برای نمایش وجود ندارد.',
} as const

export const PUBLIC_SERVICE_DETAIL = {
  book: 'رزرو این خدمت',
  duration: (minutes: number) => `${toPersianDigits(minutes)} دقیقه`,
  priceFrom: 'از',
  free: 'رایگان',
  depositNote: (amount: string) => `این خدمت نیاز به پیش‌پرداخت ${amount} دارد.`,
  sections: {
    description: 'توضیحات خدمت',
    beforeCare: 'توصیه‌های قبل از درمان',
    afterCare: 'توصیه‌های بعد از درمان',
    notSuitableFor: 'مناسب برای چه کسانی نیست',
    doctors: 'پزشکان ارائه‌دهنده',
    beforeAfter: 'نتایج درمان',
    before: 'قبل',
    after: 'بعد',
  },
  notSet: 'توضیحاتی برای این بخش ثبت نشده است.',
  doctorsEmpty: 'پزشکی برای این خدمت تعریف نشده است.',
} as const

export const PUBLIC_BOOKING = {
  title: 'رزرو نوبت آنلاین',
  lead: 'در سه مرحله ساده نوبت خود را رزرو کن',
  steps: {
    service: 'انتخاب خدمت',
    time: 'انتخاب زمان',
    details: 'اطلاعات تماس',
  },
  labels: {
    service: 'خدمت',
    doctor: 'پزشک',
    day: 'روز',
    time: 'ساعت',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    note: 'توضیحات (اختیاری)',
  },
  hints: {
    mobile: 'با این شماره، پیامک‌های یادآوری برایت ارسال می‌شود.',
    pickDay: 'یک روز را انتخاب کن.',
    noSlots: 'برای این روز زمان خالی وجود ندارد. روز دیگری را انتخاب کن.',
    depositRequired: 'این خدمت برای رزرو آنلاین نیاز به پیش‌پرداخت دارد.',
  },
  actions: {
    next: 'مرحله بعد',
    back: 'بازگشت',
    confirm: 'تأیید و رزرو نوبت',
    submitting: 'در حال رزرو…',
  },
  /** The two formatted lines a service card carries, and the one failure the island raises. */
  formats: {
    duration: (minutes: number) => `${toPersianDigits(minutes)} دقیقه`,
    deposit: (amount: string) => ` · پیش‌پرداخت ${amount}`,
    slotsFailure: 'خطا در دریافت زمان‌ها',
  },
  result: {
    successTitle: 'نوبت تو رزرو شد!',
    success: (day: string, time: string) => `روز ${day} ساعت ${time}`,
    cycleHint: (current: number, total: number, days: number) =>
      `جلسه ${toPersianDigits(current)} از ${toPersianDigits(total)}، موعد بعدی ${toPersianDigits(days)} روز بعد`,
    failure: 'رزرو نوبت انجام نشد. دوباره تلاش کن یا با کلینیک تماس بگیر.',
    another: 'رزرو نوبت دیگر',
  },
  empty: 'هیچ خدمتی برای رزرو وجود ندارد.',
} as const

export const PUBLIC_DOCTORS = {
  title: 'پزشکان کلینیک',
  lead: 'با پزشکان متخصص و باتجربه کلینیک آشنا شو',
  visit: 'رزرو نوبت با این پزشک',
  role: 'پزشک متخصص',
  empty: 'هیچ پزشکی برای نمایش وجود ندارد.',
} as const

export const PUBLIC_ABOUT = {
  title: 'درباره کلینیک',
  lead: 'یک دهه تجربه در زیبایی و سلامت پوست',
  storyTitle: 'داستان ما',
  story: [
    'کلینیک ما با هدف ارائه خدمات تخصصی پوست و زیبایی، با استانداردهای روز دنیا آغاز به کار کرد.',
    'ما باور داریم زیبایی، نتیجه‌ی سلامت است. به همین دلیل هر درمان را با توجه به سلامت پوست تو طراحی می‌کنیم.',
  ],
  valuesTitle: 'ارزش‌های ما',
  values: [
    { icon: 'success' as const, title: 'تخصص', description: 'پزشکان متخصص و آموزش‌دیده' },
    { icon: 'customers' as const, title: 'اعتماد', description: 'هزاران مراجع راضی' },
    { icon: 'appointment' as const, title: 'نظم', description: 'نوبت‌دهی منظم و بدون انتظار' },
    { icon: 'money' as const, title: 'شفافیت', description: 'قیمت روشن قبل از درمان' },
  ],
  statsTitle: 'کلینیک در یک نگاه',
  stats: [
    { value: 10, label: 'سال تجربه' },
    { value: 10000, label: 'مراجع راضی' },
    { value: 12, label: 'پزشک متخصص' },
    { value: 25, label: 'خدمت تخصصی' },
  ],
} as const

export const PUBLIC_CONTACT = {
  title: 'تماس و مشاوره',
  lead: 'فرم مشاوره را پر کن، کارشناسان ما در اولین فرصت با تو تماس می‌گیرند',
  labels: {
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    service: 'خدمت مورد نظر',
    note: 'توضیحات (اختیاری)',
  },
  hints: {
    mobile: 'با این شماره با تو تماس گرفته می‌شود.',
  },
  submit: 'درخواست مشاوره',
  submitting: 'در حال ارسال…',
  result: {
    successTitle: 'درخواست تو ثبت شد!',
    success:
      'کارشناسان ما در اولین فرصت با تو تماس می‌گیرند. می‌توانی همین حالا نوبت خود را آنلاین رزرو کنی.',
    failure: 'ارسال درخواست انجام نشد. دوباره تلاش کن یا با کلینیک تماس بگیر.',
  },
  infoTitle: 'راه‌های ارتباطی',
  phoneTitle: 'تماس تلفنی',
  phoneValue: '۰۲۱-۱۲۳۴۵۶۷۸',
  addressTitle: 'آدرس',
  addressValue: 'تهران، خیابان ولیعصر، کلینیک زیبایی',
  hoursTitle: 'ساعات کاری',
  hours: 'شنبه تا پنجشنبه، ۹:۰۰ تا ۱۸:۰۰',
  bookCta: 'رزرو نوبت آنلاین',
} as const

export const PUBLIC_PANELS = {
  title: 'ورود کاربران',
  lead: 'درخواستی که داری انتخاب کن',
  staff: {
    title: 'ورود کارکنان',
    description: 'پزشکان، منشیان و مدیران کلینیک با رمز عبور وارد می‌شوند.',
    action: 'ورود کارکنان',
  },
  customer: {
    title: 'ورود مراجعان',
    description: 'مراجعان کلینیک با شماره موبایل و کد یکبار مصرف وارد می‌شوند.',
    action: 'ورود مراجعان',
  },
} as const

/**
 * The two Server Actions' sentences, keyed by the failure they answer.
 *
 * The actions are the only two writes the public surface makes, and both answer with a
 * sentence rather than an error: a thrown error is the framework's own English page, and
 * the Persian sentence the module raised on purpose is the one the visitor needed. Each
 * sentence names the fix (`07-localization.md` §8) — pick another time, pick another
 * day, call the clinic — because a refusal that names no fix is a dead end on a page
 * nobody is staffing.
 */
export const PUBLIC_FAILURES = {
  /** The host named no tenant, so there is no clinic to book or to write a lead for. */
  tenantUnknown: 'کلینیک شناسایی نشد.',
  /** A `ValidationError` — a required field the form did not collect. */
  incomplete: 'اطلاعات وارد شده کامل نیست.',
  mobileInvalid: 'شماره موبایل درست نیست.',
  booking: {
    slotTaken: 'این ساعت قبلاً رزرو شده است. زمان دیگری را انتخاب کن.',
    closed: 'این روز برای رزرو باز نیست. روز دیگری را انتخاب کن.',
    depositRequired: 'این خدمت نیاز به پیش‌پرداخت دارد و از طریق سایت قابل رزرو نیست.',
    notBookable: 'این خدمت در حال حاضر قابل رزرو نیست.',
    unknown: 'رزرو نوبت انجام نشد. دوباره تلاش کن یا با کلینیک تماس بگیر.',
  },
  consultation: {
    /** The prefix the desk reads before the service the person asked about. */
    servicePrefix: 'خدمت: ',
    duplicate: 'درخواست تو قبلاً ثبت شده است. کارشناسان ما با تو تماس می‌گیرند.',
    unknown: 'ارسال درخواست انجام نشد. دوباره تلاش کن یا با کلینیک تماس بگیر.',
  },
} as const
