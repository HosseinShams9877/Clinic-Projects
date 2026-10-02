/**
 * The module list of `docs/knowledge/02-architecture.md` §7.
 *
 * §7 opens with "Twenty modules. Every one is required; none is optional." That is
 * the whole reason this file exists: the list is a **closed set**, and the override
 * mechanism depends on it being one. `05-conventions.md` §15.4: "`module` | the
 * closed 20-module list | An override for a module that does not exist is a build
 * error — the module list is a closed set, and an override never introduces a 21st
 * module." A set that only exists as a table in a document cannot produce a build
 * error, so it exists here as well.
 *
 * The shape is the house shape — an `as const` object for the members, a derived
 * union for the type, and a `readonly` tuple for the order (`05-conventions.md` §2).
 * `isMember` in `./enums` is the run-time validator; there is no second one here.
 *
 * ## Why the order matters
 *
 * `MODULES` is in §7's documented order, and the order is load-bearing rather than
 * alphabetical. The registry's compile-time layer types an override's `module`
 * against the union derived from `Module`, the build-time check reports folders in
 * this order so two runs of the same tree produce the same output, and the test
 * suite identifies a module by its position when it reports which module's suite an
 * override ran. A set would be enough for the type; the sequence is part of the
 * specification, so the sequence is what is written.
 *
 * ## What is deliberately not here
 *
 * The modules' **paths**. `src/modules/<name>` is stated by `05-conventions.md`
 * §15.1 and is the same for all twenty, so a per-module path field would be twenty
 * copies of one rule — and the second copy is the one that goes stale. The path is
 * derived from the name where it is needed, in `scripts/check-overrides.mjs` and in
 * `src/modules/registry`.
 */

export const Module = {
  Auth: 'auth',
  Dashboard: 'dashboard',
  Appointments: 'appointments',
  Customers: 'customers',
  Cycles: 'cycles',
  Campaigns: 'campaigns',
  CampaignAssistant: 'campaign-assistant',
  AudienceGroups: 'audience-groups',
  Notifications: 'notifications',
  Messages: 'messages',
  Services: 'services',
  Staff: 'staff',
  RolesPermissions: 'roles-permissions',
  Debts: 'debts',
  Payments: 'payments',
  Reports: 'reports',
  Settings: 'settings',
  PublicSite: 'public-site',
  TenantManagement: 'tenant-management',
  License: 'license',
} as const

export type Module = (typeof Module)[keyof typeof Module]

/** §7's twenty modules, in documented order. */
export const MODULES = [
  Module.Auth,
  Module.Dashboard,
  Module.Appointments,
  Module.Customers,
  Module.Cycles,
  Module.Campaigns,
  Module.CampaignAssistant,
  Module.AudienceGroups,
  Module.Notifications,
  Module.Messages,
  Module.Services,
  Module.Staff,
  Module.RolesPermissions,
  Module.Debts,
  Module.Payments,
  Module.Reports,
  Module.Settings,
  Module.PublicSite,
  Module.TenantManagement,
  Module.License,
] as const satisfies readonly Module[]

/**
 * The two modules that are active only conditionally — §7 gives each a condition
 * rather than a role: `tenant-management` when `MULTI_TENANT=true`, `license` when
 * it is false.
 *
 * Named as a constant rather than left in a comment because the registry reports
 * which modules are inactive in a single-tenant install, and a check that reads a
 * comment is a check that cannot run.
 */
export const CONDITIONAL_MODULES = [
  Module.TenantManagement,
  Module.License,
] as const satisfies readonly Module[]
