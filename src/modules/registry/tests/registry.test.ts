/**
 * The registry — `05-conventions.md` §15.6 layers 4 and 5, and `02-architecture.md`
 * §13.3's resolution.
 *
 * The fixture this suite resolves is under `./fixtures/`, and the two things the suite
 * has to prove are the two the mechanism's safety rests on:
 *
 * 1. **resolution returns the registered implementation, through the default's
 *    interface** — a tenant that declares an override gets that override and nothing
 *    about the call changes from the caller's side;
 * 2. **every failure resolves to the default** — an absent, unknown, malformed or
 *    disabled override never becomes a module with no implementation.
 *
 * The negative cases are the suite's purpose, and each is a different way the
 * mechanism can be lied to: a row naming an implementation the build does not contain,
 * a declaration that disagrees with the folder it lives in, a declaration that is not
 * one at all, and an entry the release has switched off. A suite that only resolved
 * the fixture would be the happy path the strategy document warns about — the
 * permitted case is table stakes, and the fallbacks are the product.
 *
 * ## Why the fixture is exercised through the real code paths
 *
 * The fixture is TypeScript that the compiler checks, not a hand-rolled object: the
 * assignment in `./fixtures/.../index.ts` is §15.5's contract check, and the entries
 * below are keyed by the same `"<module>/<implementationId>"` the release's own
 * registry would use. What is *not* exercised here is the build-time check, which
 * reads the tree as text and has no fixture to read — it passes by finding no
 * `overrides/` folder, which is the honest result for a release that ships none.
 */

import { describe, expect, it } from 'vitest'

import { Module } from '@/core/constants'
import * as rolesPermissions from '@/modules/roles-permissions'

import { build, isIncident, parseModuleOverrides, resolveModule } from '../index'
import type { Registry, ResolvedModule } from '../index'

import { declaration as misdeclaredDeclaration } from './fixtures/roles-permissions/overrides/misdeclared/module'
import misdeclaredSurface from './fixtures/roles-permissions/overrides/misdeclared'
import { declaration as validDeclaration } from './fixtures/roles-permissions/overrides/test-override/module'
import validSurface from './fixtures/roles-permissions/overrides/test-override'

/** The registry the fixture deserves: one valid entry, keyed the way §15.2 fixes it. */
function fixtureRegistry(): Registry {
  return build({
    [`${Module.RolesPermissions}/test-override`]: {
      declaration: validDeclaration,
      surface: validSurface,
    },
  })
}

/**
 * The default's surface, as a caller would hold it.
 *
 * Imported through the barrel — §10 rule 1 — because the default is what the resolver
 * falls back to, and a fallback that a caller could not reach through the ordinary path
 * would not be a fallback.
 */
const DEFAULT_SURFACE = rolesPermissions

/** A selection from a settings row, spelled the way §13.2 fixes it. */
function selectionFor(implementation: string) {
  return parseModuleOverrides({
    [Module.RolesPermissions]: { implementation, version: '1.0.0' },
  }).selections
}

describe('the registry', () => {
  describe('building it', () => {
    it('accepts an entry whose declaration matches its key', () => {
      const registry = fixtureRegistry()

      expect(registry.rejected).toEqual([])
      expect(Object.keys(registry.entries)).toEqual(['roles-permissions/test-override'])
    })

    it('types the entry it accepted as the module it replaces', () => {
      const registry = fixtureRegistry()
      const entry = registry.entries[`${Module.RolesPermissions}/test-override`]

      // The surface is a value the caller can only reach through the module's
      // interface, and the declaration's module is the key's module.
      expect(entry).toBeDefined()
      expect(entry?.declaration.module).toBe(Module.RolesPermissions)
      expect(entry?.declaration.implementation).toBe('test-override')
      expect(entry?.enabled).toBe(true)
    })

    it('rejects a declaration whose implementation is not its folder', () => {
      const registry = build({
        // The key is the folder; the declaration inside it names another override.
        [`${Module.RolesPermissions}/misdeclared`]: {
          declaration: misdeclaredDeclaration,
          surface: misdeclaredSurface,
        },
      })

      expect(Object.keys(registry.entries)).toEqual([])
      expect(registry.rejected).toHaveLength(1)

      const rejected = registry.rejected[0]
      expect(rejected?.key).toBe('roles-permissions/misdeclared')
      expect(rejected?.reason).toBe('implementation-mismatch')
      expect(rejected?.message).toContain('some-other-override')
    })

    it('rejects a declaration whose module is not the key\'s module', () => {
      // A declaration for a different module filed under this one's key: §15.3 puts an
      // override inside the module it replaces, and a mismatch means the entry points
      // at another module's surface than the key a tenant's row would name. The
      // declaration is internally consistent — `exposes` is `dashboard`'s own
      // interface — because the point is the filing, not a second defect the refine
      // would catch first and report as malformed.
      const declaration = {
        ...validDeclaration,
        module: 'dashboard' as const,
        exposes: 'DashboardModule' as const,
      }

      const registry = build({
        [`${Module.RolesPermissions}/test-override`]: {
          declaration,
          surface: validSurface,
        },
      })

      expect(Object.keys(registry.entries)).toEqual([])
      expect(registry.rejected[0]?.reason).toBe('module-mismatch')
    })

    it('rejects a declaration that is not one at all', () => {
      // Layer 4's own obligation: a malformed declaration marks the entry invalid. The
      // version is not semver, which is the field a compiler cannot check and a release
      // can get wrong by editing a string.
      const declaration = { ...validDeclaration, version: 'not-a-version' }

      const registry = build({
        [`${Module.RolesPermissions}/test-override`]: {
          declaration,
          surface: validSurface,
        },
      })

      expect(Object.keys(registry.entries)).toEqual([])
      expect(registry.rejected[0]?.reason).toBe('declaration-malformed')
      expect(registry.rejected[0]?.message).toContain('version')
    })

    it('rejects a declaration whose exposes is not the module\'s interface', () => {
      // §15.5's field: `exposes` is what makes the contract checkable, and a wrong name
      // is a declaration claiming a type the registry does not type the surface as.
      // `as never` because this is a hostile input: the type says a declaration is
      // always well-formed, and the test's job is to hand the registry one that is not.
      const declaration = { ...validDeclaration, exposes: 'SomethingElse' as never }

      const registry = build({
        [`${Module.RolesPermissions}/test-override`]: {
          declaration,
          surface: validSurface,
        },
      })

      expect(Object.keys(registry.entries)).toEqual([])
      expect(registry.rejected[0]?.reason).toBe('declaration-malformed')
    })

    it('drops an entry whose key is not a registry key', () => {
      const registry = build({
        // No separator: a key §15.2 would not have produced cannot be looked up, so it
        // cannot be offered either.
        ['roles-permissions' as never]: {
          declaration: validDeclaration,
          surface: validSurface,
        },
      })

      expect(Object.keys(registry.entries)).toEqual([])
      expect(registry.rejected[0]?.reason).toBe('module-mismatch')
    })

    it('builds an empty registry from nothing, and that is the release\'s state', () => {
      // Phase 1 ships no override, so the release's own registry is the empty table.
      // The empty registry is not a skipped check — it is the honest artefact, and
      // every resolution against it is the default.
      const registry = build({})

      expect(registry.entries).toEqual({})
      expect(registry.rejected).toEqual([])
    })
  })

  describe('resolving a module', () => {
    it('returns the registered override when the tenant declares it', () => {
      const registry = fixtureRegistry()

      const resolved: ResolvedModule<typeof Module.RolesPermissions> = resolveModule(
        Module.RolesPermissions,
        selectionFor('test-override'),
        DEFAULT_SURFACE,
        registry,
      )

      expect(resolved.implementation).toBe('test-override')
      expect(resolved.fallback).toBe(null)
      // The override's surface is the default's namespace, by construction of the
      // fixture — and the caller cannot tell, which is the mechanism's promise.
      expect(resolved.surface).toBe(validSurface)
      expect(resolved.surface).not.toBe(DEFAULT_SURFACE)
    })

    it('answers through the default\'s interface whichever implementation ran', () => {
      // The return type is `ModuleSurface<typeof module>` in both branches, so the
      // caller has no field to branch on. This is the compile-time half of that, and
      // the runtime half is that both surfaces answer the module's own question.
      const registry = fixtureRegistry()

      const overridden = resolveModule(
        Module.RolesPermissions,
        selectionFor('test-override'),
        DEFAULT_SURFACE,
        registry,
      )
      const defaulted = resolveModule(
        Module.RolesPermissions,
        [],
        DEFAULT_SURFACE,
        registry,
      )

      expect(overridden.surface.can).toBe(defaulted.surface.can)
      expect(typeof overridden.surface.can).toBe('function')
    })

    it('falls back to the default when the tenant declares no override', () => {
      const registry = fixtureRegistry()

      const resolved = resolveModule(Module.RolesPermissions, [], DEFAULT_SURFACE, registry)

      // §13.4's first row: onboarding's state. Not an incident — nothing is wrong.
      expect(resolved.implementation).toBe(null)
      expect(resolved.surface).toBe(DEFAULT_SURFACE)
      expect(resolved.fallback).toBe('undeclared')
      expect(isIncident(resolved.fallback)).toBe(false)
    })

    it('falls back to the default when the registry does not know the key', () => {
      const registry = fixtureRegistry()

      // A row naming an implementation this release does not contain — §13.4's second
      // row and the one that is an incident.
      const resolved = resolveModule(
        Module.RolesPermissions,
        selectionFor('an-override-this-release-does-not-ship'),
        DEFAULT_SURFACE,
        registry,
      )

      expect(resolved.implementation).toBe(null)
      expect(resolved.surface).toBe(DEFAULT_SURFACE)
      expect(resolved.fallback).toBe('unregistered')
      expect(isIncident(resolved.fallback)).toBe(true)
    })

    it('falls back to the default when the entry is disabled', () => {
      // Layer 5's third condition. A release that ships an override it does not yet
      // offer serves every tenant the default, and the tenant hears about it through
      // §18.7's notice rather than through a broken screen.
      const registry = build({
        [`${Module.RolesPermissions}/test-override`]: {
          declaration: validDeclaration,
          surface: validSurface,
          enabled: false,
        },
      })

      const resolved = resolveModule(
        Module.RolesPermissions,
        selectionFor('test-override'),
        DEFAULT_SURFACE,
        registry,
      )

      expect(resolved.implementation).toBe(null)
      expect(resolved.surface).toBe(DEFAULT_SURFACE)
      expect(resolved.fallback).toBe('entry-disabled')
      expect(isIncident(resolved.fallback)).toBe(false)
    })

    it('falls back to the default for a module the tenant declared no override of', () => {
      // A tenant overriding one module does not override every module: the registry maps
      // an override to exactly one module, and there is no wildcard (§18.4).
      const registry = fixtureRegistry()

      const resolved = resolveModule(Module.Dashboard, [], DEFAULT_SURFACE as never, registry)

      expect(resolved.fallback).toBe('undeclared')
    })

    it('is total: every branch returns an implementation', () => {
      // No branch returns `undefined`, and no branch returns a surface without one. The
      // four outcomes the resolver can produce are the four the type allows, and the
      // assertion is that the function cannot be made to produce a fifth.
      const registry = fixtureRegistry()

      const outcomes = [
        resolveModule(Module.RolesPermissions, selectionFor('test-override'), DEFAULT_SURFACE, registry),
        resolveModule(Module.RolesPermissions, [], DEFAULT_SURFACE, registry),
        resolveModule(Module.RolesPermissions, selectionFor('unknown'), DEFAULT_SURFACE, registry),
        resolveModule(
          Module.RolesPermissions,
          selectionFor('test-override'),
          DEFAULT_SURFACE,
          build({
            [`${Module.RolesPermissions}/test-override`]: {
              declaration: validDeclaration,
              surface: validSurface,
              enabled: false,
            },
          }),
        ),
      ]

      for (const resolved of outcomes) {
        expect(resolved.surface).toBeDefined()
        expect(resolved.module).toBe(Module.RolesPermissions)
      }
    })
  })

  describe('reading the tenant\'s settings row', () => {
    it('reads a declared override as a selection', () => {
      const parsed = parseModuleOverrides(
        JSON.stringify({
          [Module.RolesPermissions]: { implementation: 'test-override', version: '1.0.0' },
        }),
      )

      expect(parsed.unparseable).toBe(false)
      expect(parsed.unrecognized).toEqual([])
      expect(parsed.selections).toEqual([
        { module: Module.RolesPermissions, implementation: 'test-override', version: '1.0.0' },
      ])
    })

    it('accepts a row already parsed, so a caller does not re-serialise it', () => {
      const parsed = parseModuleOverrides({
        [Module.RolesPermissions]: { implementation: 'test-override' },
      })

      expect(parsed.selections).toHaveLength(1)
      // A row written before the release recorded versions is still a selection.
      expect(parsed.selections[0]?.version).toBeUndefined()
    })

    it('resolves nothing for a tenant that has never declared an override', () => {
      // §13.4: NULL and the empty string both mean nothing declared, and both are the
      // state of every tenant at onboarding.
      for (const absent of [null, undefined, ''] as unknown[]) {
        const parsed = parseModuleOverrides(absent)

        expect(parsed.selections).toEqual([])
        expect(parsed.unrecognized).toEqual([])
        expect(parsed.unparseable).toBe(false)
      }
    })

    it('reports a module the release does not have, without throwing', () => {
      // Drift, not corruption: a module renamed between releases. The entry goes, the
      // key is what the report names, and the rest of the row is still served.
      const parsed = parseModuleOverrides({ 'a-module-this-release-does-not-have': {
        implementation: 'test-override',
      } })

      expect(parsed.selections).toEqual([])
      expect(parsed.unrecognized).toEqual([
        { key: 'a-module-this-release-does-not-have', reason: 'unknown-module' },
      ])
      expect(parsed.unparseable).toBe(false)
    })

    it('reports an entry that is not §13.2\'s shape, and keeps the rest of the row', () => {
      const parsed = parseModuleOverrides({
        [Module.RolesPermissions]: { implementation: 'Not An Implementation Id' },
        'another-gone-module': { implementation: 'x' },
      })

      expect(parsed.selections).toEqual([])
      expect(parsed.unrecognized).toContainEqual({
        key: Module.RolesPermissions,
        reason: 'malformed-entry',
      })
      expect(parsed.unrecognized).toContainEqual({
        key: 'another-gone-module',
        reason: 'unknown-module',
      })
    })

    it('is unparseable when the column is not the shape at all', () => {
      // The row is corrupt rather than stale, and the report says so by flag rather
      // than by throwing: §15.6's "every layer falls back to the default rather than
      // failing a request", applied to the read that feeds resolution.
      for (const corrupt of ['{ not json', '{"roles-permissions": 12}', '12']) {
        const parsed = parseModuleOverrides(corrupt)

        expect(parsed.selections).toEqual([])
        expect(parsed.unrecognized).toEqual([])
        expect(parsed.unparseable).toBe(true)
      }
    })

    it('reads an empty map as no selections and no complaints', () => {
      const parsed = parseModuleOverrides('{}')

      expect(parsed.selections).toEqual([])
      expect(parsed.unrecognized).toEqual([])
      expect(parsed.unparseable).toBe(false)
    })
  })
})
