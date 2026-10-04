/**
 * `resolveModule()` — `02-architecture.md` §13.3, `05-conventions.md` §15.6 layer 5.
 *
 * Resolution is the only place an override is chosen. Everything else in the mechanism
 * prepares or validates; this is the function a caller reaches for, and it is the one
 * that answers "which implementation is this tenant running".
 *
 * ## The contract the function is shaped by
 *
 * Four properties of §13.3, each of which is a constraint on this signature rather
 * than a comment about it:
 *
 * - **Synchronous and total.** No `Promise`, and no return that can be `undefined`: a
 *   module always has an implementation, and the caller cannot be asked to handle the
 *   absence of one. The default is the argument that makes the function total, because
 *   the default is what the registry does not hold (see `./registry.ts`).
 * - **A lookup, never a dynamic import.** The registry is passed in, already built; no
 *   path is constructed here and no module is loaded by a string the caller influenced.
 * - **Resolved from the tenant context, never received.** The selections are the
 *   already-parsed settings row, and nothing in this signature accepts a request
 *   header, a query string or a caller-supplied implementation. A row can only name
 *   what the build contains, and this can only read what the row named.
 * - **Called through the same interface as the default.** The return is typed
 *   `ModuleSurface<ModuleName>`, so the caller cannot branch on which implementation
 *   it received — and the type carries that fact without a runtime discriminant the
 *   caller could inspect.
 *
 * ## Why the default is an argument and the override is not
 *
 * The two implementations arrive by different paths and that asymmetry is the point.
 * The override is reachable only through the registry, because the registry is the
 * allow-list; the default is reachable only through the caller, because the caller
 * already imported it through its barrel and the registry must not be a second route
 * to a module's surface. A signature that took the default from the registry would
 * make the registry the place a module's implementation is found, and would make the
 * barrel redundant for the one caller that resolves.
 *
 * ## Per request, not cached
 *
 * §13.3: "Resolution is per request, not cached across tenants." Nothing here
 * memoises, and the function is cheap enough that memoising it would be the only way
 * to get it wrong: a process-lifetime cache keyed by module would serve tenant A's
 * override to tenant B, and a cache keyed by `(tenantId, module)` is the caller's to
 * own because the caller is the one that holds the tenant and the invalidation signal
 * from the settings row.
 *
 * ## The parameter named `registry`
 *
 * Defaulted to the release's table and overridable so the fixture can build one. The
 * default is the release's own registry and not a freshly built empty one, so that a
 * caller who omits it gets the table the release shipped rather than a table this
 * function invented.
 */

import { REGISTRY } from './registry'
import type {
  FallbackReason,
  Module,
  ModuleSelection,
  ModuleSurface,
  Registry,
  RegistryKey,
  ResolvedModule,
} from './types'

/**
 * Resolves which implementation of `module` this tenant runs, and always one.
 *
 * @param module The module being resolved. Typed against §7's union so a resolution
 * for a module that is not one of the twenty is a compile error.
 * @param selections The tenant's parsed settings row (`./selection.ts`), not the raw
 * column: the row is JSON on both engines and the parse is the boundary that makes it
 * trustworthy.
 * @param defaultSurface The default module's barrel, imported through `@/modules/<module>`.
 * Returned whenever the tenant's row names nothing this release contains — which is
 * the fallback of §13.4, and is also the answer when the tenant declares nothing at
 * all, because onboarding is the same state operationally.
 * @param registry The built registry, defaulted to the release's table.
 */
export function resolveModule<ModuleName extends Module>(
  module: ModuleName,
  selections: readonly ModuleSelection[],
  defaultSurface: ModuleSurface<ModuleName>,
  registry: Registry = REGISTRY,
): ResolvedModule<ModuleName> {
  const selection = selections.find((candidate) => candidate.module === module)

  // §13.3's first branch: no override declared. This is the state of every tenant at
  // onboarding, and it is not an event — nothing is reported, and the default is the
  // answer rather than a fallback to it.
  if (selection === undefined) {
    return { module, implementation: null, surface: defaultSurface, fallback: 'undeclared' }
  }

  const key = `${module}/${selection.implementation}` as RegistryKey
  const entry = registry.entries[key]

  // §13.3's second branch and §13.4's incident: a row naming an implementation this
  // release does not contain. The registry is the allow-list, so a miss is an
  // operational error — the row was written by a release that had an override this
  // one does not — and the mismatch is reported by the caller, not swallowed here.
  if (entry === undefined) {
    return { module, implementation: null, surface: defaultSurface, fallback: 'unregistered' }
  }

  // §15.6 layer 5's third condition, and the release-level switch on `RegistryEntry`.
  // An entry disabled in a release serves every tenant the default, which is the
  // counterpart of the runtime circuit breaker in `09-security.md` §18.6 — that one
  // disables an override for one tenant after it throws; this one disables it for
  // everyone before it is ever offered.
  if (!entry.enabled) {
    return { module, implementation: null, surface: defaultSurface, fallback: 'entry-disabled' }
  }

  // The entry's surface was stored as the union of declared surfaces; narrowing it
  // back to this module's interface is safe because the key that found the entry
  // carries the module, and the entry's declaration survived the check that its
  // `module` is the key's module. The compiler cannot follow that relation through a
  // record lookup, so the cast is here and nowhere else.
  return {
    module,
    implementation: entry.declaration.implementation,
    surface: entry.surface as ModuleSurface<ModuleName>,
    fallback: null,
  }
}

/**
 * Whether a resolution fell back for the reason that is an incident.
 *
 * §13.4 names exactly one: "An override is declared but not present in the build's
 * registry | The default runs, and the mismatch is recorded as an incident — a
 * settings row naming an implementation this release does not contain is an
 * operational error, not a tenant-facing one." The other two reasons are ordinary
 * states — onboarding declares nothing, and a disabled override is a release decision
 * the tenant's managers hear about through §18.7's notice rather than through an
 * incident. Centralising the distinction keeps a caller that logs from having to
 * re-derive §13.4's table at every call site, and keeps `unregistered` from being
 * spelled as a literal outside the type that defines it.
 */
export function isIncident(fallback: FallbackReason | null): boolean {
  return fallback === 'unregistered'
}
