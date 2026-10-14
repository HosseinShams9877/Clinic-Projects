/**
 * The injection map tab's own Persian copy.
 *
 * The five closed sets' labels are the module's catalog and are imported, not
 * retyped here; this file is the tab's own chrome — the tab's title, the form's
 * field labels, the table's columns, the four KPI tile labels, and the three
 * sentences a failed write renders.
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
   *
   * A failed write is one of three facts: the customer was not in the caller's
   * tenant, a closed-set value the form sent was not one the set holds, or the
   * platform itself failed. Each names a different fix, and the third is the one
   * apology the action falls through to.
   */
  errors: {
    customerNotFound: 'این مشتری پیدا نشد.',
    illegalValue: 'مقدار واردشده در فهرست مجاز نیست.',
    unexpected: 'ثبت تزریق انجام نشد. دوباره تلاش کنید.',
  },
  /** The blue info bar under the table. */
  hint: 'این داده پزشکی پرونده است — در دسترس مدیر، پزشک معالج و منشی.',
} as const