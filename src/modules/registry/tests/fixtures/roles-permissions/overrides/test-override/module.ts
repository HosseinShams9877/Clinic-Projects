/**
 * The fixture's declaration — `05-conventions.md` §15.4, spelled exactly as an
 * override's `module.ts` spells it.
 *
 * The build-time check reads this shape as text, so it is written the way §15.4 writes
 * it rather than the way a refactor would. `module` is a member of the twenty and not a
 * free string, `implementation` is the folder name exactly, `version` is semver, and
 * `exposes` is the interface the registry types the surface as — all four fields
 * validated by `scripts/check-overrides.mjs` rules B–E and by the registry's own
 * layer 4.
 *
 * `implementation` names a tenant group and not the module it replaces, per §15.2:
 * `test-override` is this fixture's identity and says nothing about `roles-permissions`.
 */

export const declaration = {
  module: 'roles-permissions',
  implementation: 'test-override',
  version: '1.0.0',
  exposes: 'RolesPermissionsModule',
} as const
