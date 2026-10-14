/**
 * The injection map's public surface for the two profile pages.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and this folder is that
 * composition: the tab, the table, the dialog and the four counts are the profile's
 * rendering of the `injections` module's reads, and the barrel is the one file the
 * two pages import from.
 */

export { InjectionTab } from './injection-tab'
export { INJECTION_TAB } from './catalog'