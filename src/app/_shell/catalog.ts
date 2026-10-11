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
} as const
