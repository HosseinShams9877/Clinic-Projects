/**
 * The misdeclared fixture's barrel.
 *
 * The surface is valid — the declaration is what is wrong, and keeping the two faults
 * separate is what makes the test prove the registry rejects a declaration rather than
 * a surface. If the surface were also broken, the test would be asserting a rejection
 * it could have gotten from either cause.
 *
 * The surface is the same default namespace the valid fixture uses, for the reason
 * `../test-override/index.ts` gives: the fixture's identity is the declaration, and the
 * surface's job is to be unambiguously correct.
 */

import type { RolesPermissionsModule } from '@/modules/roles-permissions'
import * as implementation from '@/modules/roles-permissions'

import { declaration } from './module'

export { declaration }

const surface: RolesPermissionsModule = implementation

export default surface
