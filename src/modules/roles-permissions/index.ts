/**
 * The `roles-permissions` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — `@/modules/*​/*`
 * is a banned specifier — so a file that is not listed below does not exist as far as
 * the rest of the repository is concerned.
 *
 * ## What is public, and what that costs
 *
 * This module owns §3.1's two enforcement primitives, and everything that can
 * *change* an authorisation decision has to be reachable for the write path to be
 * built — so the guards are exported beside the primitives. That is a wider surface
 * than a module that only answers `can()`, and it is a deliberate one: a guard that a
 * later phase cannot import is a guard that gets reimplemented in the module that
 * needed it, and the second implementation is the one that will be wrong.
 *
 * A module may import from `@/core/*` and may import this barrel. It may not reach
 * a file inside it, and it may not import another module — `02-architecture.md` §10
 * rule 3.
 *
 * ## What is deliberately not here
 *
 * `effectiveSet`, `SECRETARY_DEFAULT_COUNT` and `RECOVERY_PERMISSIONS` are private.
 * The first is the formula's implementation and the two callers of it are in this
 * module; the other two are facts about §2.1 and §2.3 that `ROLE_DEFAULTS` and
 * `tenantHasRecoveryManager` already state in a form a caller can use.
 */

export type { MembershipSnapshot } from './types'

export type { RolesPermissionsMessageKey } from './catalog'
export { MESSAGES } from './catalog'

export { assertOverridesAllowed, isManagerColumnLocked } from './lib/manager-lock'

export {
  assertTenantKeepsRecoveryManager,
  can,
  effectivePermissions,
  requirePermission,
  ROLE_DEFAULTS,
  tenantHasRecoveryManager,
} from './lib/matrix'

export { assertNotSelfEdit } from './lib/self-edit'

export { isToggle, Toggle, TOGGLES, TOGGLE_DEFAULTS } from './lib/toggles'
