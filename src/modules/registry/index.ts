/**
 * The module override registry — `02-architecture.md` §13, `05-conventions.md` §15.
 *
 * This is the module that knows an override's name. §15.3 rule 3 is explicit about
 * that being a property of this module and no other: "`overrides/` is not part of the
 * module's public surface. The barrel at `src/modules/<module>/index.ts` does not
 * re-export it. Only the registry references an override, and the registry is the only
 * file that names one."
 *
 * Everything the mechanism needs is here, and nothing here is the override itself:
 *
 * | File | §15.6 layer | What it owns |
 * |---|---|---|
 * | `./types.ts` | — | The vocabulary: the registry key, the declaration, the surfaces. |
 * | `./declaration.ts` | 4 | The Zod schema a declaration is parsed by. |
 * | `./selection.ts` | — | The tenant's settings row, read into selections. |
 * | `./registry.ts` | 4 | The build: validate each entry, drop what fails, keep the table. |
 * | `./resolve.ts` | 5 | `resolveModule()` — the one place an override is chosen. |
 *
 * ## Why the barrel is the whole surface
 *
 * `02-architecture.md` §10 rule 2: the barrel is the module's complete public surface
 * and what is not in it is private. The registry's callers are every module that
 * resolves an implementation, and they need exactly two things — the resolver and the
 * reader that produced its argument. The build and the declaration schema are the
 * startup path's own, and `describe` is exported for the one caller that logs a build
 * failure, which is the startup path too.
 *
 * ## What is deliberately not here
 *
 * Nothing imports an override. Phase 1 ships none, and the mechanism is exercised by
 * the test-only fixture under `tests/`, which `scripts/check-overrides.mjs` skips for
 * the reason `tests/` is skipped everywhere: it is not part of the build. The first
 * real override is registered in `./registry.ts` by adding an entry to the table, and
 * that entry is the only line this module changes for it.
 */

export { IMPLEMENTATION_ID, isImplementationId, isModuleName, pascalCase, parseOverrideDeclaration } from './declaration'
export type { DeclarationParseResult } from './declaration'

export { parseModuleOverrides } from './selection'

export { REGISTRY, build, describe } from './registry'
export type { UnbuiltRegistry } from './registry'

export { isIncident, resolveModule } from './resolve'

export type {
  DeclaredModuleSurfaces,
  FallbackReason,
  ImplementationId,
  ModuleExposes,
  ModuleOfKey,
  ModuleSelection,
  ModuleSurface,
  OverrideDeclaration,
  ParsedModuleOverrides,
  Registry,
  RegistryBuildFailure,
  RegistryEntry,
  RegistryKey,
  RejectedEntry,
  ResolvedModule,
  UnrecognizedOverride,
  ValidatedEntry,
} from './types'
