/**
 * Admin-panel copy, split out of `src/app/catalog.ts`.
 *
 * `src/app/catalog.ts` sits at its 1000-line cap (`max-lines`), so the manager
 * pages' own Persian strings live here and the admin pages import them from this
 * file. Nothing in the main catalog was moved or renamed — this file only *adds*,
 * and the rule is the same one `src/app/reception/catalog.ts` keeps: no Persian
 * literal in a component, every manager sentence a key here.
 */

/** The customer file's manager-specific copy — the columns the desk's file does not hold. */
export const ADMIN_CUSTOMERS = {
  /** «۱۸ مشتری جدید این ماه» — the count is the page's own, from the dashboard's read. */
  subNewThisMonth: 'مشتری جدید این ماه',
  /** The table's own columns, in the order the manager's file renders them. */
  columns: {
    name: 'مشتری',
    mobile: 'شماره تماس',
    birthday: 'تولد',
    source: 'منبع',
    lastVisit: 'آخرین مراجعه',
    visits: 'مراجعه',
    balance: 'مانده',
    message: 'پیام',
    profile: 'پرونده',
  },
  /** The chip filter; the five group labels come from the audience-groups module. */
  filterAll: 'همه',
  /** The «پیام» column's answer to whether the customer may be messaged. */
  messageable: {
    yes: 'بله',
    no: 'خیر',
  },
  /** The header's two actions. */
  exportLabel: 'خروجی',
  addTrigger: 'ثبت مشتری',
  /** «نمایش ۸ از ۴۲۷ مشتری» — the card foot's own sentence, around the two counts. */
  showingPrefix: 'نمایش ',
  showingOf: ' از ',
  showingSuffix: ' مشتری',
  /** The «ثبت مشتری» dialog, whose fields are `createOrFindCustomer`'s and no others. */
  add: {
    title: 'ثبت مشتری',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    mobile: 'شماره موبایل',
    source: 'نحوه آشنایی',
    sourcePlaceholder: 'انتخاب کنید',
    submit: 'ثبت مشتری',
    cancel: 'انصراف',
    error: 'ثبت نشد. نام و شماره موبایل را بررسی کنید.',
  },
} as const

/**
 * The customer profile's manager-specific copy — the cards the demo composes the page
 * from, and the two tables' own columns.
 */
/**
 * The manager's debt oversight — the demo's `admin/debts.html`, whose copy the shared
 * `DEBTS_PAGE.admin` title and lead do not hold.
 *
 * The manager holds `view_debts` and not `follow_up_debt` (`04-roles-permissions.md`
 * §2.1), so every sentence here is a read's: the alert that names the one question the
 * page answers, the four tiles' labels, the per-doctor cards, the table's own columns
 * and the two units its status cell counts in.
 */
export const ADMIN_DEBTS = {
  /** The blue bar under the header, which sets the page's one promise. */
  alert: 'این بخش گزارش مالی نیست. فقط به یک سؤال جواب می‌دهد: چه کسی چقدر بدهکار است و چند روز از سررسیدش گذشته.',
  /** The four tiles' own labels, in the order the page renders them. */
  kpi: {
    total: 'مجموع مانده',
    overdue: 'سررسید گذشته',
    avgDelay: 'میانگین تأخیر',
    collected: 'وصول‌شده این ماه',
  },
  /** «۹ مشتری» — the total tile's own sub-count, around the distinct-customer count. */
  totalSubSuffix: ' مشتری',
  /** «۵ مورد» — the past-due tile's own sub-count, around the past-due row count. */
  overdueSubSuffix: ' مورد',
  /** «۶ روز» — the delay tile's own unit, after the day count. */
  day: 'روز',
  /** The per-doctor card's own hint, around the two counts. */
  doctorHintDebtors: ' نفر',
  doctorHintOverdue: ' مورد بیش از ۷ روز',
  /** The doctor `<select>`'s own first option, which the empty value names. */
  allDoctors: 'همه پزشکان',
  /** The name a card renders for a doctor the membership read could not resolve. */
  doctorFallback: 'پزشک',
  /** The toolbar's own search field. */
  searchPlaceholder: 'نام یا شماره…',
  searchLabel: 'جستجوی بدهکاران',
  /** The chip bar's own «همه». */
  filterAll: 'همه',
  /** The table's own columns, in the order the page renders them. */
  columns: {
    customer: 'مشتری',
    service: 'بابت',
    doctor: 'پزشک',
    balance: 'مانده (تومان)',
    due: 'سررسید',
    status: 'وضعیت',
    followUp: 'آخرین پیگیری',
    action: 'اقدام',
  },
  /** The status cell's two badges, around the day count. */
  daysLateSuffix: 'روز گذشته',
  daysLeftSuffix: 'روز مانده',
  /** The day a debt is due today reads, which neither suffix fits. */
  dueToday: 'امروز سررسید',
  /** The follow-up cell's two answers, as the row's own column renders them. */
  followedUp: 'پیگیری شده',
  notFollowedUp: 'بدون پیگیری',
  /** The «اقدام» cell's own link, to the customer's manager profile. */
  profile: 'پرونده',
  /** The header's own export action. */
  exportLabel: 'خروجی',
  /** «نمایش ۹ مورد» — the card foot's own sentence, around the shown count. */
  showingPrefix: 'نمایش ',
  showingSuffix: ' مورد',
  /** The card foot's own explanation of what a due date is. */
  dueHint: 'سررسید = تاریخ جلسه‌ای که مبلغش کامل پرداخت نشد.',
  /** The table's own empty state, when the clinic holds no open balance. */
  empty: 'بدهی باز وجود ندارد.',
} as const

/**
 * The manager's cycle oversight — the demo's `admin/cycles.html`, whose copy the shared
 * `CYCLES_PAGE.admin` title and lead do not hold.
 *
 * The page is a read (the demo's own «فقط مشاهده» badge), so every sentence here is a
 * read's: the header's two counts, the alert that names the one question the page
 * answers, the four tiles, the two tabs, the two tables' own columns, and the
 * notification cell's two honest answers.
 */
export const ADMIN_CYCLES = {
  /** «۴۸ دوره فعال · ۷ مشتری موعدشان رسیده» — the header's own two counts. */
  subActive: 'دوره فعال',
  subDue: 'مشتری موعدشان رسیده',
  /** The header's read-only badge, which names what the manager may do here. */
  readOnly: 'فقط مشاهده',
  /** The header's primary action, to the campaign builder that reads this list. */
  makeCampaign: 'ساخت کمپین از این فهرست',
  /** The blue bar, whose link points at the cycle settings the manager owns. */
  alert: 'تماس و جابه‌جایی جلسه کار منشی است. این صفحه برای این است که ببینید دوره‌ها کجا دارند از دست می‌روند و تعریف کدام خدمت باید عوض شود — فاصله و تعداد جلسات را در تنظیمات چرخه درمان تغییر می‌دهید.',
  alertSettings: 'تنظیمات ← چرخه درمان',
  /** The four tiles' own labels, in the order the page renders them. */
  kpi: {
    overdue: 'عقب‌افتاده',
    dueThisWeek: 'موعد این هفته',
    active: 'دوره درمان فعال',
    completionRate: 'نرخ تکمیل دوره',
  },
  /** The two tabs' own labels, as the `?tab=` links render them. */
  tabs: {
    due: 'موعد رسیده',
    active: 'دوره‌های فعال',
  },
  /** The chip bar's three labels; «همه» and the two states the due table filters by. */
  filterAll: 'همه',
  filterOverdue: 'عقب‌افتاده',
  filterNear: 'نزدیک',
  /** The due table's own columns, in the order the card renders them. */
  dueColumns: {
    customer: 'مشتری',
    service: 'خدمت',
    sessions: 'جلسه',
    lastVisit: 'آخرین مراجعه',
    nextDue: 'موعد بعدی',
    interval: 'فاصله',
    status: 'وضعیت',
    notification: 'اطلاع‌رسانی',
    doctor: 'پزشک',
  },
  /**
   * The notification cell's two answers.
   *
   * The demo's «پیامک رفت» / «در صف» are a send log the schema does not keep per cycle;
   * the row's own `lastContactAt` is the honest fact, so the cell answers the question
   * the row can answer — whether the desk has followed the course up.
   */
  notified: 'پیگیری شده',
  notNotified: 'اقدام نشده',
  /**
   * The four due states, derived from the row's own next-due day.
   *
   * The module's `CycleStatus` is the engine's own state; this ladder is the page's read
   * of it as a day distance, which is the question a manager asks of a due table.
   */
  dueState: {
    overdue: 'عقب‌افتاده',
    near: 'نزدیک',
    inWindow: 'در بازه',
    far: 'دور',
  },
  /** The active table's own columns, in the order the card renders them. */
  activeColumns: {
    customer: 'مشتری',
    service: 'خدمت',
    serviceDefault: 'پیش‌فرض خدمت',
    customerPlan: 'برنامه این مشتری',
    status: 'وضعیت',
  },
  /** The active table's two badges, as the plan's own comparison reads them. */
  customized: 'شخصی‌سازی شده',
  defaultPlan: 'پیش‌فرض',
  /** The units the interval and the plan labels read, once each. */
  units: {
    weeks: 'هفته',
    months: 'ماه',
    days: 'روز',
    sessions: 'جلسه',
    /** The unbounded course, which has no session count to render. */
    openEnded: 'نامحدود',
  },
  /** «نمایش ۷ مورد» — the card foot's own sentence, around the shown count. */
  showingPrefix: 'نمایش ',
  showingSuffix: ' مورد',
  /** The two tables' own empty states. */
  empty: {
    due: 'هیچ دوره فعالی با موعد مشخص وجود ندارد.',
    active: 'هنوز دوره‌ای ثبت نشده است.',
  },
} as const

/**
 * The manager's services catalogue — the demo's `admin/services.html`.
 *
 * The four categories' own names are the `services` module's catalog and are imported
 * and not retyped here; the only thing this file adds about them is the chip bar's own
 * «همه». The demo's fifth chip («مشاوره») names a category the module's closed set does
 * not hold, so the bar carries the four the set spells.
 */
export const ADMIN_SERVICES = {
  /** «۷ خدمت تعریف‌شده · ۶ خدمت فعال» — the header's own two counts. */
  subDefined: 'خدمت تعریف‌شده',
  subActive: 'خدمت فعال',
  /** The chip bar's own «همه»; the four after it are the module's own category labels. */
  filterAll: 'همه',
  /** The chip bar's own accessible name, which the nav element carries. */
  categoriesLabel: 'دسته‌بندی خدمات',
  /** The search field's own label, which the screen reader names and the eye does not. */
  searchLabel: 'جستجو در نام خدمت',
  /** The search field's own placeholder, which is the demo's own sentence. */
  searchPlaceholder: 'نام خدمت…',
  /** «۳۰ دقیقه» — the duration cell's own unit, after the number it reads. */
  durationSuffix: ' دقیقه',
  /** «نمایش ۷ مورد» — the card foot's own sentence, around the shown count. */
  showingPrefix: 'نمایش ',
  showingSuffix: ' خدمت',
} as const

/**
 *
 * The manager owns `manage_campaigns` (`04-roles-permissions.md` §2.1), and the page is
 * four things: the eight purposes a campaign is, the assistant that drafts one from a
 * sentence, the clinic's own campaigns, and the eight audiences they reach. What lives
 * here and not in `CAMPAIGNS_PAGE` is the copy the shared builder and the shared results
 * table cannot name — the cards the manager's page composes around them — because the
 * shared file is the reception panel's permission line as much as this page's.
 *
 * The eight types' own names and sentences are the `campaigns` module's catalog and are
 * imported, not retyped here; the only thing this file adds about them is nothing.
 */
export const ADMIN_CAMPAIGNS = {
  /** «۴ کمپین فعال · ۲۳ مراجعه از کمپین» — the header's own two counts. */
  subActive: 'کمپین فعال',
  subVisits: 'مراجعه از کمپین',
  /** The three tiles' own labels, in the order the row renders them. */
  kpi: {
    active: 'کمپین فعال',
    visits: 'مراجعه از کمپین',
    conversion: 'نرخ تبدیل',
  },
  /** «۳ مورد تکرارشونده» — the active tile's own sub-count, around the recurring count. */
  recurringSub: ' مورد تکرارشونده',
  /** The visits tile's own sub-line, which names the scope the count covers. */
  allCampaignsSub: 'مجموع همه کمپین‌ها',
  /** «۷۹ پیام ارسال شده» — the conversion tile's own sub-count, around the send total. */
  sendsSub: ' پیام ارسال شده',
  /** The «انواع کمپین» card's own heading and the sentence beside it. */
  typesTitle: 'انواع کمپین',
  typesHint: 'هر نوع، مخاطب و منطق خودش را دارد',
  /**
   * The assistant's card — the demo's «دستیار کمپین».
   *
   * The demo's output panel carries four figures the product does not compute: a parsed
   * rule list, an SMS cost, a conversion rate for a similar campaign, and a sample of the
   * audience. A rule list is the interpreter's private vocabulary and an SMS cost is a
   * price the schema holds nowhere, so the two are not rendered; the other two are the
   * ledger's own and the audience's own, and the panel renders them as reads.
   */
  assistant: {
    /** The card head's badge, which names the one thing the assistant will not do. */
    badge: 'پیش‌نویس می‌سازد، ارسال نمی‌کند',
    /** The textarea's own label. */
    label: 'به زبان خودتان بنویسید چه کمپینی می‌خواهید',
    /** The «ساخت پیش‌نویس» button. */
    build: 'ساخت پیش‌نویس',
    /** The sentence under the button, which names the boundary the assistant keeps. */
    hint: 'دستیار به داده پزشکی پرونده دسترسی ندارد — فقط رفتار مراجعه.',
    /** The output panel's own fields, once a proposal has come back. */
    understood: 'پیشنهاد دستیار',
    audience: 'مخاطب',
    conversion: 'نرخ تبدیل کمپین‌های این نوع',
    /** The conversion tile's own answer when no campaign of the type has sent yet. */
    conversionNone: '—',
    /** «نمونه‌ای از فهرست» — the audience sample's own label. */
    sample: 'نمونه‌ای از فهرست',
    /** «+ ۳۶ نفر دیگر» — the sample's own tail, around the rest of the count. */
    sampleMore: ' نفر دیگر',
    /** The proposed text's own label, above the textarea the manager edits. */
    messageLabel: 'متن پیشنهادی',
    /** The one action the output panel holds, which carries the proposal into the builder. */
    openBuilder: 'بررسی و شروع',
  },
  /**
   * The four example briefs the chips drop into the box.
   *
   * The demo's own four, kept as the four sentences the interpreter is most often asked
   * for; a chip is a shortcut to typing one, and nothing else.
   */
  examples: [
    {
      label: 'متولدین مهر',
      brief: 'یک کمپین برای همه مشتریانی که تاریخ تولدشان در مهر است',
    },
    {
      label: 'لیزری‌های غیرفعال',
      brief: 'کسانی که لیزر گرفته‌اند ولی بیش از چهار ماه است نیامده‌اند',
    },
    {
      label: 'مانده حساب بالای یک میلیون',
      brief: 'مشتریانی که بیش از یک میلیون تومان مانده حساب دارند',
    },
    { label: 'دوره ناتمام', brief: 'کسانی که دوره درمانشان نیمه‌کاره مانده' },
  ],
  /** «کمپین‌های من» — the results card's own heading and its filter chips. */
  resultsTitle: 'کمپین‌های من',
  /** The chip bar's own «همه»; the rest are the six statuses' own labels. */
  filterAll: 'همه',
  /** The table's own columns, in the order the card renders them. */
  columns: {
    campaign: 'کمپین',
    type: 'نوع',
    run: 'اجرا',
    channel: 'کانال',
    audience: 'مخاطب',
    sent: 'ارسال',
    visits: 'مراجعه',
    status: 'وضعیت',
    action: 'اقدام',
  },
  /** The run column's two badges, as the row's own schedule reads them. */
  runOnce: 'یک‌بار',
  runRecurring: 'تکرارشونده',
  /** «نمایش ۷ مورد» — the card foot's own sentence, around the shown count. */
  showingPrefix: 'نمایش ',
  showingSuffix: ' کمپین',
  /**
   * The audience card — the demo's «گروه‌های مخاطب».
   *
   * The eight are the module's own built-ins, and their names and sentences are its
   * catalog's; the one sentence here is the card's own, about the fact that a group is a
   * query and not a stored list.
   */
  groupsTitle: 'گروه‌های مخاطب',
  /** The head's own link, to the customers list a manual group would be built from. */
  groupsManual: 'ساخت گروه دستی از فهرست مشتریان',
  /** The card foot's own sentence, which names why a closed group still stays current. */
  groupsHint:
    'گروه‌ها ذخیره نمی‌شوند — در زمان ارسال دوباره از روی پرونده‌ها ساخته می‌شوند، پس کمپین همیشه با فهرست به‌روز کار می‌کند.',
  /** «۹۴ نفر» — the group card's own badge, after the group's own count. */
  groupCountSuffix: ' نفر',
  /**
   * The builder's own chrome — the demo's three-step wizard.
   *
   * The builder's field copy is the shared `CAMPAIGNS_PAGE.builder`'s, because the fields
   * are the reception panel's permission line as much as this page's; the steps are the
   * manager's own, and so are the two nav buttons and the one alert the demo's third step
   * carries. That alert's demo sentence claims a thirty-day attribution window the module
   * does not keep — attribution is the most recent send, and no window bounds it — so the
   * sentence here says what the module actually does.
   */
  wizard: {
    steps: {
      audience: '۱. مخاطب',
      message: '۲. پیام',
      schedule: '۳. زمان‌بندی',
    },
    prev: 'قبلی',
    next: 'بعدی',
    attribution:
      'هر نوبتی که مشتری پس از دریافت پیام این کمپین ثبت کند، به آخرین کمپینی که به او رسیده نسبت داده می‌شود.',
  },
} as const


export const ADMIN_CUSTOMER_PROFILE = {
  /** The header's booking action, which opens the manager's own day grid. */
  book: 'رزرو نوبت',
  /** The four KPI tiles above the two columns. */
  kpi: {
    visits: 'مراجعه',
    activeCycles: 'دوره فعال',
    balance: 'مانده‌حساب',
    totalPaid: 'جمع پرداختی',
  },
  /** The profile's six cards, as their own headings name them. */
  cards: {
    cycles: 'دوره‌های درمان',
    visits: 'تاریخچه مراجعه',
    payments: 'پرداخت‌ها',
    details: 'اطلاعات پایه',
    campaign: 'برای کمپین',
    messages: 'پیام‌های اخیر',
  },
  /** The cycles card's own columns, in the order the card renders them. */
  cycleColumns: {
    service: 'خدمت',
    doctor: 'پزشک',
    sessions: 'جلسه',
    interval: 'فاصله',
    nextDue: 'موعد بعدی',
    status: 'وضعیت',
  },
  /** The visit history's own columns. */
  visitColumns: {
    date: 'تاریخ',
    service: 'خدمت',
    doctor: 'پزشک',
    status: 'وضعیت',
    amount: 'مبلغ',
  },
  /** The interval's two units, as the course's own spacing reads. */
  unitWeeks: 'هفته',
  unitDays: 'روز',
  /** «۶ مورد اخیر» — the visit card head's own count. */
  recentSuffix: 'مورد اخیر',
  /** «۳ پیام در ۳۰ روز اخیر» — the messages card's own count. */
  messageCountSuffix: 'پیام در ۳۰ روز اخیر',
  /** The details card's own fields. */
  detailFields: {
    mobile: 'موبایل',
    birthDate: 'تاریخ تولد',
    firstVisit: 'اولین مراجعه',
    source: 'منبع آشنایی',
    doctor: 'پزشک اصلی',
    residence: 'محدوده سکونت',
    medicalHistory: 'سوابق پزشکی',
    sensitivities: 'حساسیت‌ها',
  },
  /** The sentence under the campaign card's group badges. */
  campaignHint:
    'این گروه‌ها همین حالا از رفتار مراجعه این مشتری ساخته می‌شوند و همان گروه‌هایی هستند که کمپین به آن‌ها می‌رسد.',
  /** The sentence a customer who is in no group reads. */
  campaignEmpty: 'این مشتری در هیچ‌یک از گروه‌های مخاطب نیست.',
  /** The three tables' own empty states. */
  empty: {
    cycles: 'این مشتری دوره درمانی ندارد.',
    messages: 'هنوز پیامی برای این مشتری ارسال نشده است.',
    payments: 'پرداختی برای این مشتری ثبت نشده است.',
  },
} as const

/**
 * The manager's people surface — the demo's `admin/staff.html`, whose copy the shared
 * `STAFF_PAGE` does not hold.
 *
 * The sixteen permissions' own names are `core/localization`'s catalog and are imported
 * and not retyped; the sixteen sentences the matrix's second column reads are the
 * demo's own, kept here because no module holds a permission's explanation and a column
 * without them would be a column of names the manager already knows.
 */
export const ADMIN_STAFF = {
  /** «۵ کاربر · ۳ نقش» — the header's own two counts. */
  subUsers: 'کاربر',
  subRoles: 'نقش',
  /** The yellow-on-white rule the demo's own alert bar holds, above the two tables. */
  alert:
    'هر چیزی که قابل تغییر است، فقط اینجا و در تنظیمات عوض می‌شود — و همین‌جا مشخص می‌کنید کدام بخشِ آن به منشی یا پزشک دیگر سپرده شود. هیچ کاربری نمی‌تواند دسترسی خودش را بالا ببرد.',
  /** The matrix's second column, which names what a permission is and not only what it is called. */
  matrixDescription: 'توضیح',
  /**
   * The sixteen permissions' own sentences, keyed as the `Permission` set spells them.
   *
   * The demo's own wording, because the sentence a manager reads while deciding what a
   * person may do is the sentence the demo argued for; the name alone does not say what
   * a permission reaches.
   */
  permissionDescriptions: {
    view_own_schedule: 'هر پزشک فقط نوبت‌های خودش',
    view_all_schedules: 'نمای کل کلینیک',
    manage_appointments: 'ایجاد، لغو و انتقال نوبت',
    record_appointment_result: 'حاضر شد / نیامد / لغو',
    view_own_customer_records: 'سوابق، دوره‌ها، یادداشت',
    view_all_customers: 'کل بانک مشتریان',
    view_debts: 'فهرست بدهکاران',
    record_payment: 'ثبت پرداخت و تخفیف',
    follow_up_debt: 'تماس و ثبت نتیجه',
    view_own_cycles: 'دوره‌های مراجعین خودش',
    act_on_cycles: 'تماس، جابه‌جایی جلسه',
    manage_leads: 'لیدهای سایت و اینستاگرام',
    manage_campaigns: 'ارسال پیام گروهی',
    manage_services: 'افزودن خدمت، تغییر قیمت',
    manage_clinic_settings: 'ساعات، نوبت‌دهی، پیام‌ها',
    manage_users: 'افزودن کاربر، تغییر سطح',
  },
  /** «۵ دسترسی از ۱۶» — the count cell's own middle, around the two numbers. */
  permissionOf: ' دسترسی از ',
  /** The count cell's own answer when a row holds every permission the set spells. */
  permissionFull: 'دسترسی کامل',
  /** «نمایش ۵ کاربر» — the card foot's own sentence, around the shown count. */
  showingPrefix: 'نمایش ',
  showingSuffix: ' کاربر',
  /** «نمایش ۵ درخواست» — the leave table's own foot, around its shown count. */
  leaveShowingSuffix: ' درخواست',
  /** The «ساعت کاری» form a doctor's row opens. */
  workingHours: {
    trigger: 'ساعت کاری',
    title: 'ساعت کاری پزشک',
    lead: 'روزهایی که این پزشک کار می‌کند و ساعت شروع و پایان هر روز.',
    active: 'فعال',
    from: 'از',
    to: 'تا',
    save: 'ذخیره ساعت کاری',
    cancel: 'انصراف',
    close: 'بستن',
  },
} as const

/**
 * The reports page's manager-specific copy — the demo's own surface, which the
 * `reports` module's catalog does not hold because the module names the seven
 * reports and this page names the tiles and the notes the demo arranges them into.
 *
 * The sentences that carry a derived number are split around it, because a Persian
 * literal cannot take a placeholder and the number is the page's own read.
 */
export const ADMIN_REPORTS = {
  /** The head's own select, which names the three ranges the URL may spell. */
  rangeLabel: 'بازه گزارش',
  rangeThisMonth: 'این ماه',
  rangeLastMonth: 'ماه گذشته',
  rangeQuarter: '۳ ماه اخیر',
  /** The head's own sentence under the title, joining the two ends of a span. */
  spanJoin: ' — ',
  /** The alert the page holds, which is the demo's own argument for the page's scope. */
  noMoneyAlert:
    'گزارش مالی اینجا نیست. اعدادی که ماندگاری مشتری را توضیح می‌دهند اینجاست — همان‌هایی که می‌شود رویشان تصمیم گرفت.',
  /** «بازه قبل ۵۸٪» — the tile's own sub-line, around the previous span's rate. */
  previousSpan: 'بازه قبل ',
  /** The two date fields' own card, which the demo's select does not replace. */
  customRangeHint: 'بازه دلخواه',
  /** The comparison table's own second column, which is the range's session count. */
  sessionsThisMonth: 'نوبت این بازه',
  /** «۱۴۸ نفر» — the distribution's own count cell, after the number it follows. */
  personSuffix: ' نفر',
  /** «جلسه ۲» — the curve's own row label, around the session number. */
  sessionLabel: 'جلسه ',
  /**
   * The curve's own derived note, in three parts around the two session numbers the
   * steepest drop falls between. Empty when the curve holds fewer than two points.
   */
  steepestDropStart: 'بیشترین ریزش بین جلسه ',
  steepestDropMiddle: ' و جلسه ',
  steepestDropEnd: ' است — یادآوری قبل از جلسه بعد بیشترین بازده را دارد.',
  /**
   * The distribution's own derived note, in two parts around the count of customers
   * who have not been back in over six months.
   */
  inactiveNoteStart: ' نفر بیش از ۱۸۰ روز نیامده‌اند — گروه مخاطبِ «مشتریان غیرفعال» دقیقاً همین‌هاست. ',
  /** The note's own link, which is the winback campaign's own builder. */
  winbackLink: 'ساخت کمپین بازگشت',
} as const
