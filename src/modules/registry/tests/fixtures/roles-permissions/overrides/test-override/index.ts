/**
 * A test-only override of `roles-permissions` — the mechanism's exercise, not a
 * product override.
 *
 * `02-architecture.md` §13 and `scripts/check-overrides.mjs`'s header agree that Phase
 * 1 ships no `overrides/` folder, so this fixture lives under `tests/fixtures/` and is
 * skipped by the build-time walk for the reason `tests/` is skipped everywhere: it is
 * not part of the build. What it has to be is *structurally* identical to a real
 * override, because the registry's typing is the one thing a fixture can lie about and
 * the rest of the mechanism cannot be exercised by a mock.
 *
 * ## Why this module and not a fictional one
 *
 * An override's surface is typed as `<Module>Module` (`05-conventions.md` §15.5), and
 * that interface has to exist for the fixture to be assignable to it. `roles-permissions`
 * is the only module with an implementation today and therefore the only one with an
 * interface — the same boundary the registry's `DeclaredModuleSurfaces` documents. A
 * fictional module would have needed a fictional interface, and a fictional interface
 * is the thing the mechanism is built to refuse.
 *
 * ## Why the surface is a *copy* of the default's barrel
 *
 * The fixture's job is to prove resolution, substitution and failure, not to implement
 * a second permission matrix. It takes the default's namespace as its surface so the
 * type check is real — the same names, the same types — while the fixture's own
 * identity is carried by the declaration and by nothing else. The default's barrel is
 * the one import the override rules permit (§15.3 rule 2): an override may import
 * `@/modules/<module>` exactly as any other module would, and never a path inside it.
 *
 * The spread makes it a distinct object rather than the namespace itself, because the
 * resolver's test asserts the two are not the same reference — that an override that
 * resolved is the surface the registry was built with, and not silently the default.
 * Every member is the default's member, so the fixture still implements nothing of its
 * own; only the reference differs.
 *
 * The assignment below is `05-conventions.md` §15.5's own check, verbatim:
 *
 * ```ts
 * const override: DashboardModule = implementation
 * export default override
 * ```
 *
 * It fails to compile the moment the barrel and the interface disagree, which is the
 * whole of layer 1 and the reason this fixture exists as TypeScript rather than as a
 * hand-written object.
 */

import type { RolesPermissionsModule } from '@/modules/roles-permissions'
import * as implementation from '@/modules/roles-permissions'

import { declaration } from './module'

export { declaration }

/**
 * The override's public surface, typed by the contract.
 *
 * `implementation` is the default's namespace, and the assignment narrows it to the
 * interface — every public name, and nothing the barrel does not export. A name added
 * to the barrel and forgotten in `RolesPermissionsModule` fails here; a name in the
 * interface that the barrel no longer has fails here too, because the namespace is
 * missing a member the interface requires.
 */
const surface: RolesPermissionsModule = { ...implementation }

export default surface
