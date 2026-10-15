/**
 * The storage module's message catalog — the Persian sentences a page renders
 * for a failure this module raises.
 *
 * `05-conventions.md` §7: an `AppError` carries a `messageKey`, and the key is
 * resolved to a sentence in exactly one place per surface. This file is the
 * module's half of that, and `src/app/_shared/module-failure.ts` is wired to it
 * below.
 */

export const MESSAGES = {
  'storage.emptyFile': 'فایلی برای ذخیره ارسال نشد.',
  'storage.fileTooLarge': 'حجم فایل بیش از حد مجاز است.',
  'storage.unsupportedType': 'فرمت فایل پشتیبانی نمی‌شود.',
  'storage.writeFailed': 'ذخیره‌ی فایل ناموفق بود. لطفاً دوباره تلاش کنید.',
  'storage.blobUnavailable': 'سرویس ذخیره‌سازی در دسترس نیست. لطفاً بعداً تلاش کنید.',
  'storage.notFound': 'فایل مورد نظر یافت نشد.',
} as const

export type StorageMessageKey = keyof typeof MESSAGES