/**
 * The registry's build — `05-conventions.md` §15.6 layer 4, and the table layer 5
 * reads.
 *
 * `02-architecture.md` §13.3: resolution "is a lookup in a static registry, never a
 * dynamic import by path. The registry is a module built at build time, mapping
 * `(module, implementation) → the module's barrel`."
 *
 * That sentence is why this file is shaped the way it is. The map is written by hand
 * below — there is no filesystem walk, no `import(path)` and no plugin directory,
 * because a registry that could load something it had not been given would be a
 * code-execution surface rather than a selector over an allow-list
 * (`09-security.md` §18.1). Every entry is a static import the bundler resolved when
 * the release was built, so a settings row can only ever name code that shipped.
 *
 * ## What an entry has to survive
 *
 * Three checks, in the order §15.6's layer 4 states them, and each is a different
 * failure of the same release:
 *
 * 1. the declaration parses — the four fields of §15.4, in the shape §15.4 fixes;
 * 2. the declaration's `module` is the module whose tree the override lives in
 *    (§15.3);
 * 3. the declaration's `implementation` is the key's implementation id, which is the
 *    folder name (§15.2) — the registry's half of the check
 *    `scripts/check-overrides.mjs` rule B performs from the folder side, and the two
 *    halves meet here because the key is the folder name spelled by the entry below.
 *
 * An entry that fails any of the three is dropped, not thrown: layer 4's contract is
 * "the entry is dropped with a startup warning; the default serves that module", and a
 * registry build that failed the process would make one misnamed folder a release
 * blocker for every tenant.
 *
 * ## Why the registry holds the barrel and not the default
 *
 * The default module is always the fallback (`02-architecture.md` §13.4), and the
 * registry never needs a reference to it: a caller that resolves a module already has
 * the default's barrel in hand, because it imported it the way every other caller
 * does — through `@/modules/<module>`. Holding the default here would give the
 * registry a reference to twenty barrels it did not need, and would let a caller reach
 * a module's default without importing its barrel, which is the one thing §10 rule 1
 * exists to prevent.
 *
 * ## Why the entries are typed loosely at the call site
 *
 * An entry's key relates its declaration and its surface — a `"dashboard/x"` key means
 * `module: 'dashboard'` and a `DashboardModule` surface — and that relation is
 * expressible per key, but not across a whole object literal written at one call site:
 * TypeScript cannot distribute a template-literal union over the keys of a literal it
 * is still inferring. The parameter therefore takes `RegistryEntry<Module>` and the
 * relation is enforced twice, once per entry inside `build` where the key is in hand,
 * and once by `scripts/check-overrides.mjs` from the folder side. The runtime check is
 * the one that closes the gap, and it is the one a caller cannot talk past.
 *
 * ## A note on the source of this file
 *
 * `scripts/check-overrides.mjs` reads every source file under `src/modules/registry/`
 * as text and treats a quoted key at the start of a line as a registry key, so the
 * reasons below are matched in a `switch` rather than keyed by their literals. The
 * values are still the union's, and a reason added to `RegistryBuildFailure` without an
 * arm here is a compile error — `exhaustive()`'s discipline without the throw.
 */

import { parseOverrideDeclaration } from './declaration'
import type {
  Module,
  Registry,
  RegistryBuildFailure,
  RegistryEntry,
  RegistryKey,
  RejectedEntry,
  ValidatedEntry,
} from './types'

/**
 * The overrides a release ships, before validation.
 *
 * `Partial` because a release contains overrides for the modules it has overrides for,
 * and a record keyed by all of `RegistryKey` would make an empty registry a type
 * error — which is what it must not be, since Phase 1 ships none and the fixture
 * ships two.
 */
export type UnbuiltRegistry = Partial<Readonly<Record<RegistryKey, RegistryEntry<Module>>>>

/**
 * Builds the registry: validates each entry and returns the table the resolver reads.
 *
 * The entries' keys are the source of truth for the two identity checks, not the
 * declarations' fields: a key is what the resolver looks up and what the build-time
 * check reads from the folder name, so a declaration that disagrees with its key is
 * wrong and a key that disagrees with its declaration is wrong, and the registry has
 * no way to decide which. Both are reported, and the entry is dropped.
 *
 * @param entries The overrides this release ships. Phase 1 ships none; the mechanism
 * is exercised by the test fixture under `src/modules/registry/tests/`.
 */
export function build(entries: UnbuiltRegistry): Registry {
  const table: Partial<Record<RegistryKey, ValidatedEntry>> = {}
  const rejected: RejectedEntry[] = []

  for (const key of Object.keys(entries) as RegistryKey[]) {
    const entry = entries[key]

    // `Partial` at the type level; absent at runtime is not a case the table has.
    if (entry === undefined) continue

    const slash = key.indexOf('/')

    // A key without a separator is not a key §15.2 would have produced, and it cannot
    // be looked up; the entry is rejected rather than filed under a name no row could
    // name.
    if (slash === -1) {
      rejected.push({
        key,
        reason: 'module-mismatch',
        message: `The key \`${key}\` is not \`"<module>/<implementationId>"\`.`,
      })
      continue
    }

    const moduleName = key.slice(0, slash) as Module
    const implementation = key.slice(slash + 1)

    const parsed = parseOverrideDeclaration(entry.declaration)
    if (parsed.status === 'invalid') {
      rejected.push({ key, reason: 'declaration-malformed', message: parsed.message })
      continue
    }

    if (parsed.declaration.module !== moduleName) {
      rejected.push({
        key,
        reason: 'module-mismatch',
        message: `\`module\` is \`${parsed.declaration.module}\`, but the registry key is \`${key}\`. §15.3 puts an override inside the module it replaces.`,
      })
      continue
    }

    if (parsed.declaration.implementation !== implementation) {
      rejected.push({
        key,
        reason: 'implementation-mismatch',
        message: `\`implementation\` is \`${parsed.declaration.implementation}\`, but the registry key and the folder are \`${implementation}\`. §15.2: the implementation id is the folder name, exactly.`,
      })
      continue
    }

    table[key] = {
      declaration: parsed.declaration,
      surface: entry.surface,
      enabled: entry.enabled ?? true,
    }
  }

  return { entries: table, rejected }
}

/**
 * Reports a build failure the way layer 4's obligation states it.
 *
 * Separated so a caller that logs (`02-architecture.md` §13.4's incident) does not
 * have to switch on the reason to spell it, and so the wording lives with the reason
 * rather than at every reporting site. `switch` and not a keyed record for the reason
 * the file header gives: the build-time check reads quoted keys as registry entries,
 * and the arm is what keeps the two in step when a reason is added.
 */
export function describe(key: RegistryKey, reason: RegistryBuildFailure, message: string): string {
  switch (reason) {
    case 'declaration-malformed':
      return `The override \`${key}\` cannot be validated and was not offered to the resolver: ${message}`
    case 'module-mismatch':
      return `The override \`${key}\` is registered under the wrong module and was not offered to the resolver: ${message}`
    case 'implementation-mismatch':
      return `The override \`${key}\` does not match its folder name and was not offered to the resolver: ${message}`
  }
}

/**
 * The release's registry, built once at import.
 *
 * Phase 1 ships no override (`02-architecture.md` §13: "No override is written in
 * this phase"), so this builds the empty table and the mechanism is exercised by the
 * test fixture under `tests/`. The empty registry is the honest artefact rather than
 * a skipped check: every entry that could be in it is validated by the same code path
 * the fixture uses, and an entry that is not there cannot fail validation.
 *
 * Built eagerly because the registry is a build-time artefact — there is nothing to
 * defer and no input that could change between calls, and a lazily built registry
 * would be a registry that could be built twice.
 */
export const REGISTRY: Registry = build({})
