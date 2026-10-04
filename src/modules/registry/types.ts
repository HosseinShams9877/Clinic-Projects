/**
 * The vocabulary of the module override mechanism — `02-architecture.md` §13 and
 * `05-conventions.md` §15.
 *
 * This file holds the shapes and the two patterns the mechanism validates against,
 * and no logic. The reasons are the same ones `src/core/localization/types.ts` gives:
 * a type file is the one place the compiler's knowledge of the mechanism lives, and
 * mixing runtime code into it makes the boundary between "what the type checker
 * guarantees" and "what the runtime checks" unreadable. `vitest.config.ts` excludes
 * `types.ts` from coverage for exactly that reason — the constants here are patterns,
 * and a branch is what they do not have.
 *
 * ## The two patterns, and their second copies
 *
 * `IMPLEMENTATION_ID` and `SEMVER` are duplicated in `scripts/check-overrides.mjs`.
 * That is deliberate and unavoidable rather than accidental: the script is `.mjs` and
 * cannot import a `.ts` module without a build step of its own, and its own header
 * documents the same limitation for the module list. The duplication is bounded by the
 * registry's runtime validation — an implementation id or a version that disagrees
 * with these patterns is rejected at registry build (§15.6 layer 4), so a script that
 * drifted would fail the build rather than silently widen what an override may be.
 */

import { Module } from '@/core/constants'

import type { RolesPermissionsModule } from '@/modules/roles-permissions'

/**
 * The twenty-module union, re-exported because the registry's own vocabulary is
 * written in it and the four files that use it are this module's — `import type`
 * from `@/core/constants` in each would be four spellings of one name, and the
 * barrel's `export type` is what keeps a re-export from becoming a second copy.
 */
export type { Module }

/* ── §15.2 Naming ───────────────────────────────────────────────────────────── */

/**
 * An implementation id — the override's folder name, exactly, kebab-case.
 *
 * Typed as `string` rather than a template literal or a brand because the value
 * arrives from two places that cannot be branded: a folder name, which the build-time
 * check reads as text, and a tenant's settings row, which is JSON. The pattern below
 * is what narrows both, at the registry (§15.6 layer 4) and at the settings-row
 * boundary (`./selection.ts`).
 */
export type ImplementationId = string

/**
 * §15.2's registry key: `"<module>/<implementationId>"` — `"dashboard/clinic-group-a"`.
 *
 * This is the join between a tenant's declaration and the code that runs, and it is
 * the one value both sides spell identically. It is a template literal over `Module`
 * so a key for a module that is not one of the twenty is a compile error, and the
 * registry's entries are typed as this key so an entry that names a folder the
 * declaration does not live in is one too.
 */
export type RegistryKey = `${Module}/${ImplementationId}`

/**
 * The module half of a registry key.
 *
 * Used to type an entry by the key it is registered under, which is how the registry
 * knows an override's surface is the interface of the module it replaces without an
 * annotation at the call site.
 */
export type ModuleOfKey<Key extends string> = Key extends `${infer ModuleName}/${string}`
  ? ModuleName
  : never

/**
 * §15.4's `exposes`, derived: an override of `roles-permissions` exposes
 * `RolesPermissionsModule`.
 *
 * `campaign-assistant` → `CampaignAssistant`, so the type walks the hyphens rather
 * than assuming one word. It is a type and not a constant because it is only ever
 * spelled in a declaration, and `./declaration.ts` holds the runtime twin the
 * registry's layer-4 check compares against.
 */
export type ModuleExposes<ModuleName extends Module> = `${PascalCase<ModuleName>}Module`

/**
 * `roles-permissions` → `RolesPermissions`, for `ModuleExposes` above.
 *
 * Written once here and once in `./declaration.ts` (as a function) for the same reason
 * the patterns are: the type cannot be reused by the runtime check and the runtime
 * value cannot be reused by the type. The two are kept adjacent so a change to either
 * is read as a change to both.
 */
type PascalCase<Value extends string> = Value extends `${infer Head}-${infer Rest}`
  ? `${Capitalize<Head>}${PascalCase<Rest>}`
  : Capitalize<Value>

/* ── §15.5 The typed contract ───────────────────────────────────────────────── */

/**
 * The modules whose `<Module>Module` interface exists in this release, keyed by the
 * module name in §7's list.
 *
 * §15.5 types an override as "the interface in the default module's `types/`", and an
 * interface is a thing a module has once it is written. `roles-permissions` is the
 * only module with an implementation today, so it is the only entry here; the other
 * nineteen are added in the same change that writes the module, which is also the
 * change that makes an override of it possible. A list of nineteen `never`s would say
 * the opposite — that every module's surface is known and empty — and the first
 * override of a new module would compile against a contract nobody had written.
 *
 * An interface rather than a type alias so the registry's `ModuleSurface` below is a
 * named contract a reader can follow back to the module that declares it.
 */
export interface DeclaredModuleSurfaces {
  /**
   * `src/modules/roles-permissions/types` — the one module with an implementation.
   *
   * Spelled through `Module.RolesPermissions` and not as a quoted key because
   * `scripts/check-overrides.mjs` reads every source file under this folder as text
   * and treats a quoted key at the start of a line as a registry entry; a literal
   * `'roles-permissions':` would be read as a key with no implementation id and would
   * fail its own check. The value import is what makes the name and the constant one
   * fact, and the rest of this file uses the type.
   */
  readonly [Module.RolesPermissions]: RolesPermissionsModule
}

/**
 * The public surface of a module, as the registry types an override's barrel.
 *
 * `never` for a module that has no interface yet is the honest answer and a useful
 * one: `resolveModule()` takes the default's surface as an argument of this type, so
 * resolving a module with no declared interface is a call no caller can construct. The
 * mechanism cannot be reached for a module whose contract does not exist, which is the
 * same rule §15.5 states from the override's side.
 */
export type ModuleSurface<ModuleName extends Module> = ModuleName extends keyof DeclaredModuleSurfaces
  ? DeclaredModuleSurfaces[ModuleName]
  : never

/**
 * §15.4's declaration, narrowed to the module it declares itself for.
 *
 * The narrowing is what makes the declaration and the registry key one fact: a key of
 * `"dashboard/clinic-group-a"` requires `module: 'dashboard'` and
 * `exposes: 'DashboardModule'`, so a declaration copied between two modules fails to
 * compile before the runtime check ever sees it.
 */
export interface OverrideDeclaration<ModuleName extends Module = Module> {
  /** A member of §7's closed twenty. An override never introduces a twenty-first. */
  readonly module: ModuleName

  /** The override's folder name, exactly. */
  readonly implementation: ImplementationId

  /**
   * The platform release the override ships with, in semver.
   *
   * Recorded for support and never resolved against (ADR-0019): an override ships on
   * the platform's release cadence, never its own, so this value is never compared
   * with a tenant's row to decide whether to serve it.
   */
  readonly version: string

  /** The interface the override is typed as — `ModuleExposes<module>`. */
  readonly exposes: ModuleExposes<ModuleName>
}

/**
 * §15.5's entry: a declaration, and the barrel that satisfies it.
 *
 * The registry holds the barrel reference and never a deep path (`02-architecture.md`
 * §13.7), which is what makes an override a substitution of a public surface rather
 * than a monkey-patch of the default's internals.
 */
export interface RegistryEntry<ModuleName extends Module> {
  /** The declaration, imported from the override's `module.ts`. */
  readonly declaration: OverrideDeclaration<ModuleName>

  /** The override's barrel, typed as the module's interface. This assignment *is* the contract check. */
  readonly surface: ModuleSurface<ModuleName>

  /**
   * Whether the entry may be selected by a tenant's row.
   *
   * Present and optional rather than absent because §15.6 layer 5 names a third reason
   * a resolution falls back — "an invalid entry, or a disabled entry" — and the
   * registry is the layer that knows. This is the *release's* switch, not the circuit
   * breaker of `09-security.md` §18.6: that one disables an override for one tenant at
   * runtime, after the override has thrown, and its state is tenant-scoped data this
   * layer does not hold. An entry disabled here is disabled for every tenant, which is
   * the release-level half of the same guarantee.
   */
  readonly enabled?: boolean
}

/* ── The tenant's selection, from the settings row ──────────────────────────── */

/**
 * One module's override, as the tenant's settings row declares it
 * (`02-architecture.md` §13.2).
 *
 * `version` is carried through the parse and never read by the resolver, for the
 * reason `OverrideDeclaration.version` gives: it is support information, and a
 * resolution that compared it would make a tenant's override depend on a version
 * string rather than on the build it is in. It is kept rather than dropped at the
 * boundary because the support record is the one place a tenant's declared version is
 * useful, and a parser that discarded it would be the last place that saw it.
 */
export interface ModuleSelection {
  /** The module the tenant has declared an override for. */
  readonly module: Module

  /** The implementation id the row names. May not be one this release contains. */
  readonly implementation: ImplementationId

  /** The version the row was written with, for support. Never compared. */
  readonly version: string | undefined
}

/**
 * Why an entry in the tenant's row is not a selection the registry can serve.
 *
 * Reported to the caller rather than logged here for the same reason
 * `parsePermissionOverrides` reports unknown slugs rather than logging them: this
 * layer has no logger and no tenant to log against, and the caller has both.
 */
export interface UnrecognizedOverride {
  /** The row's key, as written — the module name, when the module is not one of the twenty. */
  readonly key: string

  /** What the row named that this release cannot serve. */
  readonly reason: 'unknown-module' | 'malformed-entry'
}

/**
 * The settings row's overrides map, parsed.
 *
 * Nothing here throws, and the asymmetry with `parsePermissionOverrides` is the point
 * rather than an inconsistency. A membership row that cannot be read falls back to an
 * empty set, which would discard `revoked` along with `granted` and so silently
 * *widen* access — a loud failure is the only safe reading of a corrupt
 * authorisation row. A settings row that cannot be read falls back to the default
 * module, which withholds a customisation and grants nothing, so §15.6's "every layer
 * falls back to the default rather than failing a request" applies in full: the
 * tenant is served the standard product and the operator is told, rather than the
 * tenant's request failing on a column nobody on their side has heard of.
 */
export interface ParsedModuleOverrides {
  /** The selections the row declares for modules this release knows. */
  readonly selections: readonly ModuleSelection[]

  /** Entries the row names that this release cannot serve, for the caller to report. */
  readonly unrecognized: readonly UnrecognizedOverride[]

  /** The column is present and is not the shape §13.2 fixes. Nothing was served from it. */
  readonly unparseable: boolean
}

/* ── The registry and its build ─────────────────────────────────────────────── */

/**
 * An entry that passed §15.6 layer 4 and is therefore offered to the resolver.
 *
 * Generic only in the declaration's module, not the surface: the registry is a flat
 * record keyed by `RegistryKey`, and once an entry is validated the only code that
 * reads its surface is `resolveModule`, which knows the module from the key it looked
 * up. The declaration stays narrowed so a resolver reading `entry.declaration.module`
 * gets the union of modules rather than `string`.
 */
export interface ValidatedEntry<ModuleName extends Module = Module> {
  readonly declaration: OverrideDeclaration<ModuleName>

  /** The override's barrel. Typed as the union of declared surfaces at rest. */
  readonly surface: ModuleSurface<Module>

  /** `RegistryEntry.enabled`, resolved to its default of `true`. */
  readonly enabled: boolean
}

/**
 * Why registry build dropped an entry.
 *
 * The three are §15.6's layer-4 obligations in the order the build checks them, and
 * each is a different kind of defect:
 *
 * - a malformed declaration is a broken release artefact;
 * - a module mismatch is an override filed in the wrong module's tree (§15.3);
 * - an implementation mismatch is §15.2's rule, and the registry's half of the check
 *   `scripts/check-overrides.mjs` rule B performs from the folder side.
 */
export type RegistryBuildFailure = 'declaration-malformed' | 'module-mismatch' | 'implementation-mismatch'

/**
 * An entry the registry could not accept, with the message for the startup warning.
 *
 * §15.6 layer 4 drops the entry and warns; it does not fail the process, because a
 * missing override is the default module and the default module is always available.
 */
export interface RejectedEntry {
  readonly key: RegistryKey
  readonly reason: RegistryBuildFailure
  /** The text of the startup warning. Never the tenant's, and never thrown. */
  readonly message: string
}

/**
 * The registry: the validated entries, keyed by `RegistryKey`, and the rejections.
 *
 * Built once at startup and then read-only, which is what makes a registry lookup a
 * lookup rather than a file read (§13.3: "a lookup in a static registry, never a
 * dynamic import by path"). The entries are a `Partial` record over `RegistryKey` so
 * a resolver's miss is a property that is `undefined`, and `noUncheckedIndexedAccess`
 * is what makes that miss a type rather than an assumption — the registry holds the
 * overrides a release ships, which is the subset of keys that exist, and every other
 * key is the default module.
 */
export interface Registry {
  readonly entries: Partial<Readonly<Record<RegistryKey, ValidatedEntry>>>
  readonly rejected: readonly RejectedEntry[]
}

/* ── §13.3 Resolution ──────────────────────────────────────────────────────── */

/**
 * Why a resolution served the default module.
 *
 * `null` means an override ran. The three reasons are §13.3's three "no" branches, in
 * the order the flowchart asks them, and they are the caller's business rather than
 * the registry's because only the caller can do the right thing with each one:
 *
 * - `undeclared` is the state of every tenant at onboarding — nothing to report;
 * - `unregistered` is §13.4's incident — a row naming an implementation this release
 *   does not contain, which is an operational error and not a tenant-facing one;
 * - `entry-disabled` is a release decision the tenant's managers should hear about.
 */
export type FallbackReason = 'undeclared' | 'unregistered' | 'entry-disabled'

/**
 * The outcome of a resolution — `02-architecture.md` §13.3.
 *
 * `surface` is the implementation the caller must call, and it is typed as the
 * module's interface so the caller cannot tell which implementation it received. That
 * is the whole mechanism from the caller's side: `resolveModule()` returns a
 * `RolesPermissionsModule`, and whether it is the default or an override is a fact
 * only `implementation` and `fallback` carry.
 */
export interface ResolvedModule<ModuleName extends Module> {
  /** The module that was resolved. */
  readonly module: ModuleName

  /** The implementation id that is serving this request, or `null` for the default. */
  readonly implementation: ImplementationId | null

  /** The surface to call. Typed as the module's interface, whichever implementation it is. */
  readonly surface: ModuleSurface<ModuleName>

  /** Why the default ran, or `null` when an override ran. */
  readonly fallback: FallbackReason | null
}
