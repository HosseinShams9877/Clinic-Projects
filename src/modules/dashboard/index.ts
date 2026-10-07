/**
 * The `dashboard` module's complete public surface — `02-architecture.md` §10 rule 2:
 * "If something is not in the barrel, it is private."
 *
 * The module owns `02-architecture.md` §7's «داشبورد من」, the surface
 * `admin/dashboard.html` renders. It is the manager's own counts of the day and the
 * month, and nothing it returns is money — the manager is the one role with the whole
 * matrix, so a revenue figure here would be the one screen in the product that shows
 * it to a role that also sets the prices (`reports` is where figures go, and `reports`
 * keeps money out too).
 */

export type { ManagerHome } from './lib/manager-home'

export { readManagerHome } from './lib/manager-home'

export { DASHBOARD_FIELDS } from './catalog'
