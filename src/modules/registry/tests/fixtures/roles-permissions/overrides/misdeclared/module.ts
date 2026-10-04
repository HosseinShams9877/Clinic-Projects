/**
 * A fixture whose declaration names an implementation that is not its folder.
 *
 * This is the failure the registry exists to catch, and it is the one the test suite
 * can prove: `05-conventions.md` §15.2 makes the implementation id the folder name
 * "exactly", and a declaration that disagrees with the folder it lives in is an entry
 * the resolver must never be offered, because the key a tenant's row would use and the
 * code the entry points at are two different overrides.
 *
 * `scripts/check-overrides.mjs` rule B reads this from the folder side and fails the
 * build; the registry's layer 4 reads it from the declaration side and drops the entry.
 * The two are the same check from two directions, and a fixture that only exercised one
 * of them would leave the other unverified — the same reasoning the strategy document
 * applies to a permission with no negative test.
 */

export const declaration = {
  module: 'roles-permissions',
  // Deliberately not `misdeclared`: this is the defect under test, not a mistake.
  implementation: 'some-other-override',
  version: '1.0.0',
  exposes: 'RolesPermissionsModule',
} as const
