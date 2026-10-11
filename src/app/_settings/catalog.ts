/**
 * The settings page's own Persian copy — the strings the six tabs render that are
 * not the module's own.
 *
 * `src/app/catalog.ts` sits at the 1000-line cap, so a screen's own copy lives in
 * its own `catalog.ts` — the pattern `src/app/reception/catalog.ts` and
 * `src/app/admin/catalog.ts` already keep. This file is the settings page's own,
 * and the ESLint allowlist already covers `src/app/*​/catalog.ts`, so a string here
 * is a string the lint rule accepts.
 *
 * ## Why the template editor's samples are here
 *
 * The template editor (`template-editor.tsx`) is a client component that cannot
 * import `@/modules/messages` — that module's barrel reaches `node:async_hooks`.
 * The sample values the preview substitutes and the label above the preview line
 * live here instead, and the client imports them from this file, which has no
 * Node built-in in its own import graph.
 */

/**
 * The sample value the template editor's preview substitutes for each placeholder.
 *
 * A short Persian word, because the preview's job is to read as a real sentence —
 * «{name} عزیز، نوبت شما در تاریخ {date} ...» filled in with «علی» and «۱۴۰۵/۰۷/۰۱»
 * is what a manager recognises. Numbers are numbers so their Persian-digit
 * conversion shows. A key this map does not hold falls through unchanged.
 */
export const TEMPLATE_EDITOR_SAMPLES: Readonly<Record<string, string | number>> = {
  name: 'علی',
  date: '۱۴۰۵/۰۷/۰۱',
  time: '۱۰:۳۰',
  serviceName: 'فیشیال تخصصی',
  sessionNumber: 3,
  amount: 500000,
}

/** The label above the template editor's preview line. */
export const TEMPLATE_EDITOR_PREVIEW_LABEL = 'پیش‌نمایش: '