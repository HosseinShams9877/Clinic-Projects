/**
 * Admin-panel copy, split out of `src/app/catalog.ts`.
 */

/** The customer file's manager-specific copy */
export const ADMIN_CUSTOMERS = {
  subNewThisMonth: 'مشتری جدید این ماه',
  columns: {
    name: 'مشتری', mobile: 'شماره تماس', birthday: 'تولد', source: 'منبع',
    lastVisit: 'آخرین مراجعه', visits: 'مراجعه', balance: 'مانده', message: 'پیام', profile: 'پرونده',
  },
  filterAll: 'همه',
  messageable: { yes: 'بله', no: 'خیر' },
  exportLabel: 'خروجی',
  addTrigger: 'ثبت مشتری',
  showingPrefix: 'نمایش ', showingOf: ' از ', showingSuffix: ' مشتری',
  add: {
    title: 'ثبت مشتری', firstName: 'نام', lastName: 'نام خانوادگی', mobile: 'شماره موبایل',
    source: 'نحوه آشنایی', sourcePlaceholder: 'انتخاب کنید', submit: 'ثبت مشتری', cancel: 'انصراف',
    error: 'ثبت نشد. نام و شماره موبایل را بررسی کنید.',
  },
} as const

/**
 * The manager's debt oversight
 */
export const ADMIN_DEBTS = {
  alert: 'این بخش گزارش مالی نیست. فقط به یک سؤال جواب می‌دهد: چه کسی چقدر بدهکار است و چند روز از سررسیدش گذشته.',
  kpi: {
    total: 'مجموع مانده',
    totalAmount: 'مبلغ کل بدهی',
    overdue: 'سررسید گذشته',
    avgDelay: 'میانگین تأخیر',
    collected: 'وصول‌شده این ماه',
    totalSubSuffix: ' مشتری',
    overdueSubSuffix: ' مورد',
    between1and7: '۱ تا ۷ روز گذشته',
    over30: 'بیش از ۳۰ روز',
    day: 'روز',
    personSuffix: 'نفر',
  },
    detailsDialog: {
    title: 'جزئیات پرداخت و اقساط',
    totalAmount: 'مبلغ کل بدهی',
    paidAmount: 'مبلغ پرداخت شده',
    balance: 'مانده حساب',
    paymentType: 'نوع پرداخت',
    typeInstallment: 'قسطی / چکی',
    typeCash: 'یکجا (نقدی/کارتی)',
    currentStage: 'مرحله فعلی',
    installmentAmount: 'مبلغ هر قسط',
    remainingInstallments: 'تعداد اقساط باقی‌مانده',
    currentDueDate: 'تاریخ سررسید فعلی',
    service: 'بابت',
    unknownService: 'نامشخص',
    stageLabel: (current: string, total: string) => `قسط ${current} از ${total}`,
    remainingLabel: (count: string) => `${count} مرحله`,
    toman: 'تومان',
    close: 'بستن',
  },
  totalSubSuffix: ' مشتری',
  overdueSubSuffix: ' مورد',
  day: 'روز',
  doctorHintDebtors: ' نفر',
  doctorHintOverdue: ' مورد بیش از ۷ روز',
  allDoctors: 'همه پزشکان',
  doctorFallback: 'پزشک',
  searchPlaceholder: 'نام یا شماره…',
  searchLabel: 'جستجوی بدهکاران',
  filterAll: 'همه',
  filterPastDue: 'گذشته از سررسید',
  filterNearDue: 'نزدیک سررسید',
  filterOver7: 'بیش از ۷ روز',
  filterOver30: 'بیش از ۳۰ روز',
  amountFrom: 'از مبلغ',
  amountTo: 'تا مبلغ',
  columns: {
    customer: 'مشتری', service: 'بابت', doctor: 'پزشک', balance: 'مانده (تومان)',
    due: 'سررسید', status: 'وضعیت', followUp: 'آخرین پیگیری', action: 'اقدام',
  },
  daysLateSuffix: 'روز گذشته',
  daysLeftSuffix: 'روز مانده',
  dueToday: 'امروز سررسید',
  followedUp: 'پیگیری شده',
  notFollowedUp: 'بدون پیگیری',
  profile: 'پرونده',
  exportLabel: 'خروجی',
  showingPrefix: 'نمایش ',
  showingSuffix: ' مورد',
  dueHint: 'سررسید = تاریخ جلسه‌ای که مبلغش کامل پرداخت نشد.',
  empty: 'بدهی باز وجود ندارد.',
  installmentLabel: 'قسط ۱ از ۲',
  payButton: 'ثبت پرداخت',
  followUp: {
    title: 'ثبت نتیجه پیگیری',
    contactMethod: 'نوع ارتباط',
    phone: 'تماس تلفنی',
    sms: 'ارسال پیام',
    resultLabel: 'نتیجه تماس',
    result: {
      PROMISE_TO_PAY: 'وعده پرداخت', NO_ANSWER: 'تماس شد؛ پاسخ نداد', SMS_SENT: 'پیامک ارسال شد',
      DISCOUNT_REQUEST: 'درخواست تخفیف', PROMISE_TOMORROW: 'قول پرداخت تا فردا', AWAITING_REVIEW: 'در انتظار بررسی',
    },
    note: 'توضیحات', notePlaceholder: 'توضیحات خود را وارد کنید...', promiseDate: 'وعده پرداخت',
    promiseTime: 'ساعت', nextFollowUpDate: 'پیگیری بعدی', nextFollowUpTime: 'ساعت',
    reminder: 'ایجاد یادآوری - در زمان مقرر برای منشی ارسال شود', submit: 'ثبت نتیجه',
    cancel: 'انصراف', saving: 'در حال ثبت...', amountDue: 'مبلغ بدهی:', toman: 'تومان',
  },
  paymentDialog: {
    title: 'ثبت پرداخت',
    amountLabel: 'مبلغ دریافتی *',
    allAmount: 'همه مبلغ',
    methodLabel: 'روش پرداخت *',
    methods: {
      CASH: 'نقدی', POS: 'کارت‌خوان', CARD_TO_CARD: 'کارت به کارت',
      ONLINE: 'درگاه آنلاین', CHEQUE: 'چک', INSTALLMENT: 'قسط',
    },
    chequeCount: 'تعداد چک',
    installmentCount: 'تعداد قسط',
    countUnit: 'عدد',
    intervalLabel: 'فاصله سررسیدها',
    intervalOptions: { ONE_MONTH: 'هر ۱ ماه' },
    firstDueDate: 'سررسید اول',
    preview: { step: 'مرحله', dueDate: 'تاریخ سررسید', amount: 'مبلغ (تومان)' },
    of: 'از',
    trackingNumber: 'شماره پیگیری / شماره چک',
    trackingPlaceholder: 'مثلاً ۱۲۳۴۵۶',
    receiveDate: 'تاریخ دریافت',
    receiveTime: 'ساعت',
    note: 'توضیحات (اختیاری)',
    notePlaceholder: 'توضیحات پرداخت را وارد کنید...',
    cancel: 'انصراف',
    saving: 'در حال ثبت...',
    submit: 'ثبت پرداخت',
    quickAmount1Value: '15000000',
    quickAmount1Label: '۱۵,۰۰۰,۰۰۰',
    quickAmount2Value: '5000000',
    quickAmount2Label: '۵,۰۰۰,۰۰۰',
  },
} as const

/**
 * The manager's cycle oversight
 */
export const ADMIN_CYCLES = {
  subActive: 'دوره فعال', subDue: 'مشتری موعدشان رسیده', readOnly: 'فقط مشاهده', makeCampaign: 'ساخت کمپین از این فهرست',
  alert: 'تماس و جابه‌جایی جلسه کار منشی است. این صفحه برای این است که ببینید دوره‌ها کجا دارند از دست می‌روند و تعریف کدام خدمت باید عوض شود — فاصله و تعداد جلسات را در تنظیمات چرخه درمان تغییر می‌دهید.',
  alertSettings: 'تنظیمات ← چرخه درمان',
  kpi: { overdue: 'عقب‌افتاده', dueThisWeek: 'موعد این هفته', active: 'دوره درمان فعال', completionRate: 'نرخ تکمیل دوره' },
  tabs: { due: 'موعد رسیده', active: 'دوره‌های فعال' },
  filterAll: 'همه', filterOverdue: 'عقب‌افتاده', filterNear: 'نزدیک',
  dueColumns: { customer: 'مشتری', service: 'خدمت', sessions: 'جلسه', lastVisit: 'آخرین مراجعه', nextDue: 'موعد بعدی', interval: 'فاصله', status: 'وضعیت', notification: 'اطلاع‌رسانی', doctor: 'پزشک' },
  notified: 'پیگیری شده', notNotified: 'اقدام نشده',
  dueState: { overdue: 'عقب‌افتاده', near: 'نزدیک', inWindow: 'در بازه', far: 'دور' },
  activeColumns: { customer: 'مشتری', service: 'خدمت', serviceDefault: 'پیش‌فرض خدمت', customerPlan: 'برنامه این مشتری', status: 'وضعیت' },
  customized: 'شخصی‌سازی شده', defaultPlan: 'پیش‌فرض',
  units: { weeks: 'هفته', months: 'ماه', days: 'روز', sessions: 'جلسه', openEnded: 'نامحدود' },
  showingPrefix: 'نمایش ', showingSuffix: ' مورد',
  empty: { due: 'هیچ دوره فعالی با موعد مشخص وجود ندارد.', active: 'هنوز دوره‌ای ثبت نشده است.' },
} as const

/**
 * The manager's services catalogue
 */
export const ADMIN_SERVICES = {
  subDefined: 'خدمت تعریف‌شده',
  subActive: 'خدمت فعال',
  filterAll: 'همه',
  categoriesLabel: 'دسته‌بندی خدمات',
  searchLabel: 'جستجو در نام خدمت',
  searchPlaceholder: 'نام خدمت…',
  durationSuffix: ' دقیقه',
  showingPrefix: 'نمایش ',
  showingSuffix: ' خدمت',
} as const

/**
 * The manager's campaigns
 */
export const ADMIN_CAMPAIGNS = {
  subActive: 'کمپین فعال',
  subVisits: 'مراجعه از کمپین',
  kpi: { active: 'کمپین فعال', visits: 'مراجعه از کمپین', conversion: 'نرخ تبدیل' },
  recurringSub: ' مورد تکرارشونده',
  allCampaignsSub: 'مجموع همه کمپین‌ها',
  sendsSub: ' پیام ارسال شده',
  typesTitle: 'انواع کمپین',
  typesHint: 'هر نوع، مخاطب و منطق خودش را دارد',
  assistant: {
    badge: 'پیش‌نویس می‌سازد، ارسال نمی‌کند',
    label: 'به زبان خودتان بنویسید چه کمپینی می‌خواهید',
    build: 'ساخت پیش‌نویس',
    hint: 'دستیار به داده پزشکی پرونده دسترسی ندارد — فقط رفتار مراجعه.',
    understood: 'پیشنهاد دستیار',
    audience: 'مخاطب',
    conversion: 'نرخ تبدیل کمپین‌های این نوع',
    conversionNone: '—',
    sample: 'نمونه‌ای از فهرست',
    sampleMore: ' نفر دیگر',
    messageLabel: 'متن پیشنهادی',
    openBuilder: 'بررسی و شروع',
  },
  examples: [
    { label: 'متولدین مهر', brief: 'یک کمپین برای همه مشتریانی که تاریخ تولدشان در مهر است' },
    { label: 'لیزری‌های غیرفعال', brief: 'کسانی که لیزر گرفته‌اند ولی بیش از چهار ماه است نیامده‌اند' },
    { label: 'مانده حساب بالای یک میلیون', brief: 'مشتریانی که بیش از یک میلیون تومان مانده حساب دارند' },
    { label: 'دوره ناتمام', brief: 'کسانی که دوره درمانشان نیمه‌کاره مانده' },
  ],
  resultsTitle: 'کمپین‌های من',
  filterAll: 'همه',
  columns: {
    campaign: 'کمپین', type: 'نوع', run: 'اجرا', channel: 'کانال', audience: 'مخاطب',
    sent: 'ارسال', visits: 'مراجعه', status: 'وضعیت', action: 'اقدام',
  },
  runOnce: 'یک‌بار',
  runRecurring: 'تکرارشونده',
  showingPrefix: 'نمایش ',
  showingSuffix: ' کمپین',
  groupsTitle: 'گروه‌های مخاطب',
  groupsManual: 'ساخت گروه دستی از فهرست مشتریان',
  groupsHint: 'گروه‌ها ذخیره نمی‌شوند — در زمان ارسال دوباره از روی پرونده‌ها ساخته می‌شوند، پس کمپین همیشه با فهرست به‌روز کار می‌کند.',
  groupCountSuffix: ' نفر',
  wizard: {
    steps: { audience: '۱. مخاطب', message: '۲. پیام', schedule: '۳. زمان‌بندی' },
    prev: 'قبلی',
    next: 'بعدی',
    attribution: 'هر نوبتی که مشتری پس از دریافت پیام این کمپین ثبت کند، به آخرین کمپینی که به او رسیده نسبت داده می‌شود.',
  },
} as const

/**
 * The manager's customer profile
 */
export const ADMIN_CUSTOMER_PROFILE = {
  book: 'رزرو نوبت',
  tabs: { summary: 'خلاصه پرونده', injections: 'نقشه تزریق' },
  kpi: { visits: 'مراجعه', activeCycles: 'دوره فعال', balance: 'مانده‌حساب', totalPaid: 'جمع پرداختی' },
  cards: {
    cycles: 'دوره‌های درمان', visits: 'تاریخچه مراجعه', payments: 'پرداخت‌ها',
    details: 'اطلاعات پایه', campaign: 'برای کمپین', messages: 'پیام‌های اخیر',
  },
  cycleColumns: {
    service: 'خدمت', doctor: 'پزشک', sessions: 'جلسه',
    interval: 'فاصله', nextDue: 'موعد بعدی', status: 'وضعیت',
  },
  visitColumns: { date: 'تاریخ', service: 'خدمت', doctor: 'پزشک', status: 'وضعیت', amount: 'مبلغ' },
  unitWeeks: 'هفته',
  unitDays: 'روز',
  recentSuffix: 'مورد اخیر',
  messageCountSuffix: 'پیام در ۳۰ روز اخیر',
  detailFields: {
    mobile: 'موبایل', birthDate: 'تاریخ تولد', firstVisit: 'اولین مراجعه', source: 'منبع آشنایی',
    doctor: 'پزشک اصلی', residence: 'محدوده سکونت', medicalHistory: 'سوابق پزشکی', sensitivities: 'حساسیت‌ها',
  },
  campaignHint: 'این گروه‌ها همین حالا از رفتار مراجعه این مشتری ساخته می‌شوند و همان گروه‌هایی هستند که کمپین به آن‌ها می‌رسد.',
  campaignEmpty: 'این مشتری در هیچ‌یک از گروه‌های مخاطب نیست.',
  empty: {
    cycles: 'این مشتری دوره درمانی ندارد.',
    messages: 'هنوز پیامی برای این مشتری ارسال نشده است.',
    payments: 'پرداختی برای این مشتری ثبت نشده است.',
  },
} as const

/**
 * The manager's staff
 */
export const ADMIN_STAFF = {
  subUsers: 'کاربر',
  subRoles: 'نقش',
  alert: 'هر چیزی که قابل تغییر است، فقط اینجا و در تنظیمات عوض می‌شود — و همین‌جا مشخص می‌کنید کدام بخشِ آن به منشی یا پزشک دیگر سپرده شود. هیچ کاربری نمی‌تواند دسترسی خودش را بالا ببرد.',
  matrixDescription: 'توضیح',
  permissionDescriptions: {
    view_own_schedule: 'هر پزشک فقط نوبت‌های خودش', view_all_schedules: 'نمای کل کلینیک',
    manage_appointments: 'ایجاد، لغو و انتقال نوبت', record_appointment_result: 'حاضر شد / نیامد / لغو',
    view_own_customer_records: 'سوابق، دوره‌ها، یادداشت', view_all_customers: 'کل بانک مشتریان',
    view_debts: 'فهرست بدهکاران', record_payment: 'ثبت پرداخت و تخفیف', follow_up_debt: 'تماس و ثبت نتیجه',
    view_own_cycles: 'دوره‌های مراجعین خودش', act_on_cycles: 'تماس، جابه‌جایی جلسه',
    manage_leads: 'لیدهای سایت و اینستاگرام', manage_campaigns: 'ارسال پیام گروهی',
    manage_services: 'افزودن خدمت، تغییر قیمت', manage_clinic_settings: 'ساعات، نوبت‌دهی، پیام‌ها',
    manage_users: 'افزودن کاربر، تغییر سطح',
  },
  permissionOf: ' دسترسی از ',
  permissionFull: 'دسترسی کامل',
  showingPrefix: 'نمایش ',
  showingSuffix: ' کاربر',
  leaveShowingSuffix: ' درخواست',
  workingHours: {
    trigger: 'ساعت کاری', title: 'ساعت کاری پزشک',
    lead: 'روزهایی که این پزشک کار می‌کند و ساعت شروع و پایان هر روز.',
    active: 'فعال', from: 'از', to: 'تا', save: 'ذخیره ساعت کاری', cancel: 'انصراف', close: 'بستن',
    defaultTitle: 'ساعت کاری پیش‌فرض', rangesTitle: 'بازه‌های سفارشی',
    rangesHint: 'اگر بازه‌ای تعریف شود، جایگزین ساعت پیش‌فرض همان روز می‌شود.',
    rangesEmpty: 'هنوز بازه سفارشی تعریف نشده — پیش‌فرض نیم‌ساعته فعال است.',
    slotMinutesLabel: 'مدت نوبت (دقیقه)', removeRange: 'حذف بازه', addRange: 'افزودن بازه',
  },
} as const

/**
 * The manager's reports
 */
export const ADMIN_REPORTS = {
  rangeLabel: 'بازه گزارش',
  rangeThisMonth: 'این ماه',
  rangeLastMonth: 'ماه گذشته',
  rangeQuarter: '۳ ماه اخیر',
  spanJoin: ' — ',
  noMoneyAlert: 'گزارش مالی اینجا نیست. اعدادی که ماندگاری مشتری را توضیح می‌دهند اینجاست — همان‌هایی که می‌شود رویشان تصمیم گرفت.',
  previousSpan: 'بازه قبل ',
  customRangeHint: 'بازه دلخواه',
  sessionsThisMonth: 'نوبت این بازه',
  personSuffix: ' نفر',
  sessionLabel: 'جلسه ',
  steepestDropStart: 'بیشترین ریزش بین جلسه ',
  steepestDropMiddle: ' و جلسه ',
  steepestDropEnd: ' است — یادآوری قبل از جلسه بعد بیشترین بازده را دارد.',
  inactiveNoteStart: ' نفر بیش از ۱۸۰ روز نیامده‌اند — گروه مخاطبِ «مشتریان غیرفعال» دقیقاً همین‌هاست. ',
  winbackLink: 'ساخت کمپین بازگشت',
} as const