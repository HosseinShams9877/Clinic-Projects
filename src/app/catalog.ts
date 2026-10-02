/**
 * The document-level Persian strings.
 *
 * One of Phase 1's rules is that **no Persian string literal appears in a
 * component** — it comes from the catalog. `layout.tsx` is a component, and its
 * `metadata` block is user-visible text: it is the browser tab title, the
 * bookmark, and the line a search engine shows. So it belongs here.
 *
 * It is a file in `src/app/` rather than in `@/core/localization/catalog` because
 * of the dependency direction (`02-architecture.md` §10 rule 3): `core` may not
 * know about `modules`, and it certainly may not know the product's own name. The
 * app tier owns its document metadata; `core` owns the vocabulary that is shared
 * by everything below it.
 *
 * `07-localization.md` §7.2 namespaces the catalog per module and specifies that
 * it is "a plain object, not a runtime lookup with a fallback chain". These are
 * plain strings, exported, and imported where they are used — the same shape, one
 * level up.
 *
 * `scripts/check-i18n.mjs` excludes this file from the Persian-literal rule for
 * the reason the catalog exists: this is where the literals are allowed to be.
 */

import { ZWNJ } from '@/core/localization'

/** The product's name. It is the tab title, the bookmark, and the install name. */
export const APP_NAME = 'سامانه مدیریت کلینیک'

/**
 * The tab title of any page other than the dashboard: `<page> | <app>`.
 *
 * Built from `APP_NAME` rather than written out, because `06-constants.md` §7 rule
 * 1 defines a value once and a second copy of the product's name is a second place
 * to change it.
 */
export const APP_TITLE_TEMPLATE = `%s | ${APP_NAME}`

/**
 * The description a search engine and a link preview show.
 *
 * «کلینیکهای» carries a ZWNJ (U+200C) between the noun and its plural suffix,
 * spelled through the constant rather than as the literal character for the reason
 * `catalog/common.ts` gives: the character is invisible, so a lost one is a lost
 * one nobody sees in a diff.
 */
export const APP_DESCRIPTION = `سامانه مدیریت نوبت، پرونده مشتریان و پیگیری درمان کلینیک${ZWNJ}های زیبایی`
