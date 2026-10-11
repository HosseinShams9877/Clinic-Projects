/**
 * Copy for the shared app-level components (the pagination control).
 *
 * Lives beside those components and is reachable to the ESLint Persian-allowlist as a
 * per-directory `catalog.ts`. Not a module's copy — UI chrome shared across pages.
 */

/** The table pagination control's labels. */
export const PAGINATION = {
  prev: 'قبلی',
  next: 'بعدی',
  page: 'صفحه',
  of: 'از',
} as const
