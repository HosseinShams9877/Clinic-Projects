/**
 * The injection map tab's own Persian copy.
 */

export const INJECTION_TAB = {
  /** The tab's own label, as the two profile pages render it. */
  label: 'نقشه تزریق',
  /** The tab's heading, inside the tab's own card. */
  title: 'نقشه تزریق',
  /** The button that opens the add dialog. */
  add: 'افزودن تزریق',
  /** The empty state, when the customer has no injections. */
  empty: 'هنوز تزریقی برای این مشتری ثبت نشده است.',
  /** «۱۳ مورد» — the count beside the tab's heading, around the row count. */
  countSuffix: 'مورد',
  /** The tab's two views, and the labels the view switch renders. */
  views: {
    map: 'نقشه',
    table: 'جدول',
  },
  /** The four KPI tiles above the table. */
  kpi: {
    total: 'تعداد تزریق',
    sessions: 'تعداد جلسات',
    totalCc: 'جمع سی‌سی',
    totalUnits: 'جمع واحد',
  },
  /** The filter that narrows the table to one session. */
  filter: {
    all: 'همه جلسات',
    label: 'جلسه',
  },
  /** The table's own columns, in the order the table renders them. */
  columns: {
    area: 'ناحیه',
    material: 'ماده و برند',
    amount: 'مقدار',
    depth: 'عمق',
    technique: 'تکنیک',
    batch: 'شماره بچ',
    session: 'جلسه',
    note: 'یادداشت',
    actions: 'عملیات',
  },
  /** The add dialog's own chrome. */
  dialog: {
    title: 'ثبت تزریق',
    area: 'ناحیه',
    material: 'ماده',
    brand: 'برند / محصول',
    brandPlaceholder: 'مثلاً: جوویدرم ولوما',
    amount: 'مقدار',
    amountPlaceholder: '۰٫۵',
    amountUnit: 'واحد',
    depth: 'عمق',
    technique: 'تکنیک',
    batchNumber: 'شماره بچ',
    batchPlaceholder: 'JV-00000',
    note: 'یادداشت (اختیاری)',
    sessionDate: 'تاریخ جلسه',
    submit: 'ثبت تزریق',
    cancel: 'انصراف',
    close: 'بستن',
    /** The select's first option, in each of the two required fields. */
    chooseArea: 'ناحیه را انتخاب کنید',
    chooseMaterial: 'ماده را انتخاب کنید',
  },
  /**
   * The three sentences a failed write renders, keyed by the error class.
   */
  errors: {
    customerNotFound: 'این مشتری پیدا نشد.',
    illegalValue: 'مقدار واردشده در فهرست مجاز نیست.',
    unexpected: 'ثبت تزریق انجام نشد. دوباره تلاش کنید.',
  },
  /** The blue info bar under the table. */
  hint: 'این داده پزشکی پرونده است — در دسترس مدیر، پزشک معالج و منشی.',
  /** The delete button's own label, confirm and error copy. */
  deleteLabel: 'حذف',
  deleteConfirm: 'این تزریق حذف شود؟',
  deleteFailed: 'حذف انجام نشد. دوباره تلاش کنید.',
} as const

export const INJECTION_MAP = {
  title: 'نقشه صورت',
  /** The empty state's sentence, when the customer has no injection at all. */
  empty: 'برای این مشتری هنوز تزریقی روی نقشه ثبت نشده است.',
  /** The legend's own heading, above the seven material swatches. */
  legend: 'تفکیک ماده',
  /** The side column's own heading, above the volume-per-area list. */
  topAreas: 'بیشترین حجم بر اساس ناحیه',
  /** The unit the volume list's own numbers carry, «سی‌سی». */
  ccUnit: 'سی‌سی',
  /** The unit the toxin's own numbers carry, «واحد». */
  unitUnit: 'واحد',
  /** The two summary cards above the map. */
  summary: {
    ha: 'جمع سی‌سی هیالورونیک اسید',
    botox: 'جمع واحد بوتاکس',
  },
} as const