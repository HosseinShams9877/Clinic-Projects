/**
 * Reception-panel copy, split out of `src/app/catalog.ts`.
 *
 * `src/app/catalog.ts` sits at its 1000-line cap, so the reception pages' own Persian
 * strings live here and are re-exported from the main catalog for callers that import
 * from there. Nothing in the main catalog was moved or renamed — this file only *adds*.
 * The rule is the same: no Persian literal in a component; every reception sentence is a
 * key here.
 */

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

