/**
 * The shared shell's own Persian copy: the topbar controls and the notification
 * popover, used by every panel through PanelChrome.
 *
 * It lives beside the shell (src/app/catalog.ts is at its line cap) and is reachable to
 * the ESLint Persian-allowlist as a per-directory catalog. Shell copy, not a module's.
 */

/** The topbar's search field and icon-button labels. */
export const TOPBAR = {
  searchPlaceholder: 'جستجو با نام یا شماره موبایل',
  searchLabel: 'جستجو',
  messagesLabel: 'پیام‌ها',
  notificationsLabel: 'اعلان‌ها',
  menuLabel: 'منوی کاربر',
} as const

/** The notification bell's popover. */
export const NOTIFICATIONS_POPOVER = {
  title: 'اعلان‌ها',
  empty: 'اعلانی برای امروز نیست.',
  all: 'همه اعلان‌ها',
  /** «۳ مورد» — each row's own count, after the number it follows. */
  itemsSuffix: ' مورد',
} as const

/** The full notifications page — the bell's «همه اعلان‌ها» destination. */
export const NOTIFICATIONS_PAGE = {
  title: 'اعلان‌ها',
  lead: 'هر چیزی که نیاز به توجه شما دارد، یک‌جا.',
  empty: 'اعلانی برای امروز نیست.',
  markAll: 'علامت‌گذاری همه به‌عنوان خوانده‌شده',
  delete: 'حذف',
  open: 'باز کردن',
} as const

/**
 * The notification kinds the role-aware bell renders, one lead per cartable chip.
 *
 * `02-architecture.md` قاعده دوم: anything that needs follow-up is the secretary's
 * cartable, so the منشی bell holds the full set and the manager and doctor bells hold
 * only what is theirs to see — the manager's approvals and capacity signal, the
 * doctor's own unrecorded results and due cycles. The customer's bell is the four
 * surfaces their own dashboard holds. Each kind is one summary row with a live count,
 * which is the chip the spec names rather than a per-item feed.
 */
export const NOTIFICATION_KINDS = {
  /** منشی — the cartable's own first and loudest row (a زنگ خطر خودکار). */
  unrecordedResult: 'نتیجه ثبت‌نشده',
  /** منشی — the treatment-cycle call list that has fallen due. */
  cycleCalls: 'تماس چرخه درمان',
  /** منشی — balances past their due date. */
  overdueDebt: 'بدهی سررسیدگذشته',
  /** منشی — site/instagram/phone leads not yet answered. */
  newLead: 'لید تازه',
  /** منشی — automatic messages held or queued today, not yet sent. */
  heldMessage: 'پیام نگه‌داشته‌شده',
  /** مدیر — doctors' leave requests awaiting the manager's decision. */
  leaveRequest: 'درخواست مرخصی',
  /** مدیر — today's cancelled appointments, a capacity signal. */
  cancelledToday: 'نوبت‌های لغوشده امروز',
  /** پزشک — the doctor's own appointments with no result recorded. */
  myUnrecorded: 'نتیجه ثبت‌نشده',
  /** پزشک — the doctor's own cycles that have reached their due date. */
  myCycleDue: 'موعد چرخه درمان',
  /** مشتری — the customer's own upcoming appointments. */
  nextAppointment: 'نوبت بعدی',
  /** مشتری — balance the customer still owes. */
  myBalance: 'مانده‌حساب',
  /** مشتری — care instructions after a completed session. */
  careInstructions: 'مراقبت‌های پس از خدمت',
} as const
