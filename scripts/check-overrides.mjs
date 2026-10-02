#!/usr/bin/env node
/**
 * The override check — `05-conventions.md` §15.6, layer 2.
 *
 * `02-architecture.md` §13 lets a tenant select an implementation of a module
 * instead of the default. §15.6 validates that mechanism in six layers, cheapest
 * first, and every layer falls back to the default rather than failing a request.
 * This script is layer 2:
 *
 * > **Build time** | A CI check asserts every folder under `overrides/` has a
 * > `module.ts`, that its `declaration.implementation` equals its folder name, and
 * > that every entry in the registry resolves to a real barrel. | CI fails.
 *
 * ## What this script owns, and what it deliberately does not
 *
 * Layer 1 is the type checker: the registry types every override as its module's
 * interface (§15.5), and `module` is typed against the union derived from
 * `src/core/constants/modules.ts`, so a wrong `module` is a compile error before
 * this script ever runs. That is why the checks here are the ones a compiler
 * **cannot** make:
 *
 * | §15.6 layer-2 obligation | Check |
 * |---|---|
 * | every folder under `overrides/` has a `module.ts` | rule A |
 * | `declaration.implementation` equals its folder name | rule B |
 * | every registry entry resolves to a real barrel | rules G, H |
 *
 * and, because §15.4 says the declaration "is the input to validation — not a
 * comment, and not documentation", the three fields it validates that a compiler
 * also cannot:
 *
 * | §15.4 field | Validated against | Check |
 * |---|---|---|
 * | `module` | the closed 20-module list | rule C |
 * | `implementation` | the folder name and the registry key | rules B, F |
 * | `version` | semver format | rule D |
 * | `exposes` | the interface name the override is typed as | rule E |
 *
 * Three things are left to other layers on purpose, and naming them here is what
 * keeps this script from growing checks that duplicate them:
 *
 * - **interface conformance** is layer 1 and is a TypeScript error (§15.5: "the
 *   contract is a TypeScript interface, so conformance is a compile error rather
 *   than a runtime discovery");
 * - **an override importing the default's private modules** (§15.3 rule 2) is a
 *   `BARREL_ONLY` lint failure, and the lint rule can resolve a module specifier
 *   while a regular expression cannot;
 * - **an override running the module's suite** (§15.3 rule 4) is layer 3, which
 *   lives in the test suite where the suite actually runs.
 *
 * ## Why the declaration is read as text
 *
 * This is a `.mjs` script and the declarations are TypeScript, so the four fields
 * are parsed out of the source. That is a real limitation, and it is the same one
 * `check-i18n.mjs` documents for the catalogs: the *shape* of the declaration is
 * the type checker's business, and what text can still get wrong is a value — a
 * folder renamed without its declaration, a `module` that was never in §7, a
 * `version` that is not a version. Those are exactly the four rules below.
 *
 * ## Phase 1 ships no override
 *
 * There is no `overrides/` folder in this release, and this script passes by
 * finding none — which is the honest result, not a skipped check. The mechanism
 * itself is exercised by the test-only fixture under
 * `src/modules/registry/tests/`, which the walk below skips for the reason
 * `tests/` is skipped everywhere: it is not part of the build.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ── The repository ───────────────────────────────────────────────────────── */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** A path as this script reports it: relative to the root, always forward-slashed. */
const repoPath = (absolute) => relative(ROOT, absolute).split(sep).join('/')

const MODULES_DIR = join(ROOT, 'src', 'modules')
const REGISTRY_DIR = join(MODULES_DIR, 'registry')

/** Directories that are never part of the build. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'tests', '__tests__', 'fixtures'])

/**
 * The closed 20-module list, read out of `src/core/constants/modules.ts`.
 *
 * Read from source rather than imported for the reason the catalogs are: this is a
 * `.mjs` script and the constant is TypeScript. Reading it rather than restating it
 * is the point — a second copy of §7's list inside a check is a check that will
 * disagree with the code it is checking, and the disagreement will be reported as a
 * failure in the wrong place.
 */
function readModuleList() {
  const path = join(ROOT, 'src', 'core', 'constants', 'modules.ts')
  const source = readFileSync(path, 'utf8')
  const match = /export const Module = \{([\s\S]*?)\} as const/.exec(source)
  if (match === null) {
    return undefined
  }
  return new Set([...match[1].matchAll(/'([a-z][a-z0-9-]*)'/g)].map((member) => member[1]))
}

/** `campaign-assistant` → `CampaignAssistant`, for the `exposes` check. */
function pascalCase(kebab) {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Direct child directories of a directory, or none if it does not exist. */
function childDirectories(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort()
}

/** Every file under a directory, recursively, skipping the build-excluded ones. */
function filesUnder(directory) {
  if (!existsSync(directory)) return []
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      found.push(...filesUnder(join(directory, entry.name)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      found.push(join(directory, entry.name))
    }
  }
  return found.sort()
}

/* ── Rules A–F: the declaration of every override folder ──────────────────── */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const IMPLEMENTATION_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** A finding, in the shape `check-i18n.mjs` reports and this script reuses. */
function finding(path, line, message) {
  return { path, line, column: 1, message }
}

/**
 * The four fields of a `module.ts`, or `undefined` when there is no declaration.
 *
 * The declaration is a flat object of string literals — `05-conventions.md` §15.4
 * — so a single pass of `key: 'value'` over the block reads all four.
 */
function readDeclaration(source) {
  const match = /export const declaration = \{([\s\S]*?)\}\s*as const/.exec(source)
  if (match === null) return undefined
  const body = match[1]
  const lineOf = (key) => {
    const index = body.indexOf(`${key}:`)
    if (index === -1) return 1
    return source.slice(0, match.index).split('\n').length + body.slice(0, index).split('\n').length - 1
  }
  const fields = {}
  for (const field of body.matchAll(/(\w+):\s*'([^']*)'/g)) {
    fields[field[1]] = { value: field[2], line: lineOf(field[1]) }
  }
  return fields
}

/** Rules A–F, applied to one `src/modules/<module>/overrides/<id>/` folder. */
function checkOverrideFolder(overrideDir, moduleName, modules) {
  const findings = []
  const implementation = overrideDir.slice(overrideDir.lastIndexOf(sep) + 1)
  const at = (file) => repoPath(join(overrideDir, file))

  // Rule A — an override folder with no declaration is an implementation nothing
  // can validate, and §15.4 makes the declaration the input to validation.
  if (!IMPLEMENTATION_ID.test(implementation)) {
    findings.push(
      finding(
        repoPath(overrideDir),
        1,
        `\`${implementation}\` is not a valid implementation id. §15.2: "the folder name, exactly", kebab-case, named for the tenant group it serves — \`clinic-group-a\`, never \`dashboard-custom\`. (docs/knowledge/05-conventions.md §15.2)`,
      ),
    )
  }

  const declarationFile = join(overrideDir, 'module.ts')
  if (!existsSync(declarationFile)) {
    findings.push(
      finding(
        repoPath(overrideDir),
        1,
        `\`${implementation}\` has no \`module.ts\`. Every folder under \`overrides/\` declares which module it replaces, and the declaration is what makes the folder checkable. (docs/knowledge/05-conventions.md §15.6 layer 2)`,
      ),
    )
    return findings
  }

  const source = readFileSync(declarationFile, 'utf8')
  const declaration = readDeclaration(source)
  if (declaration === undefined) {
    findings.push(
      finding(
        at('module.ts'),
        1,
        `\`module.ts\` has no \`export const declaration = { … } as const\`. §15.4 spells the declaration exactly; a comment or an inferred shape is not a declaration. (docs/knowledge/05-conventions.md §15.4)`,
      ),
    )
    return findings
  }

  for (const field of ['module', 'implementation', 'version', 'exposes']) {
    if (declaration[field] === undefined) {
      findings.push(
        finding(
          at('module.ts'),
          1,
          `The declaration has no \`${field}\`. §15.4 gives the declaration four fields and four jobs; all four are validated. (docs/knowledge/05-conventions.md §15.4)`,
        ),
      )
    }
  }

  // Rule B — a mismatch means the registry entry and the declaration disagree
  // about which code is running, which is a question nothing else can answer.
  const declared = declaration.implementation
  if (declared !== undefined && declared.value !== implementation) {
    findings.push(
      finding(
        at('module.ts'),
        declared.line,
        `\`implementation\` is \`${declared.value}\`, but the folder is \`${implementation}\`. §15.2: the implementation id is the folder name, exactly. (docs/knowledge/05-conventions.md §15.2)`,
      ),
    )
  }

  // Rule C — the module list is a closed set, so an override for a module that
  // does not exist is a failure rather than a 21st module.
  const target = declaration.module
  if (target !== undefined && !modules.has(target.value)) {
    findings.push(
      finding(
        at('module.ts'),
        target.line,
        `\`module\` is \`${target.value}\`, which is not one of the twenty modules of \`02-architecture.md\` §7. The list is a closed set and an override never introduces a 21st module. (docs/knowledge/02-architecture.md §7)`,
      ),
    )
  }

  // The folder is inside the module it replaces (§15.3), so the two are one fact.
  if (target !== undefined && modules.has(target.value) && target.value !== moduleName) {
    findings.push(
      finding(
        at('module.ts'),
        target.line,
        `\`module\` is \`${target.value}\`, but this folder is inside \`${moduleName}/\`. §15.3 puts an override "inside the module it replaces, in a sibling folder, so that the default and every override are read together". (docs/knowledge/05-conventions.md §15.3)`,
      ),
    )
  }

  // Rule D — recorded for support, never resolved against (ADR-0019), which is
  // why the format is checked and the value is not.
  const version = declaration.version
  if (version !== undefined && !SEMVER.test(version.value)) {
    findings.push(
      finding(
        at('module.ts'),
        version.line,
        `\`version\` is \`${version.value}\`, which is not a semver version. It is the platform's release version, recorded for support. (docs/knowledge/05-conventions.md §15.4)`,
      ),
    )
  }

  // Rule E — the field that makes the contract checkable (§15.5): the override is
  // typed as this interface, and the interface is `<Module>Module`.
  const exposes = declaration.exposes
  if (exposes !== undefined && target !== undefined && modules.has(target.value)) {
    const expected = `${pascalCase(target.value)}Module`
    if (exposes.value !== expected) {
      findings.push(
        finding(
          at('module.ts'),
          exposes.line,
          `\`exposes\` is \`${exposes.value}\`, but an override of \`${target.value}\` is typed as \`${expected}\`. §15.5: "the override's \`index.ts\` exports exactly the default module's public surface". (docs/knowledge/05-conventions.md §15.5)`,
        ),
      )
    }
  }

  // §15.5 gives the override a public surface of its own, and the registry
  // imports exactly that.
  if (!existsSync(join(overrideDir, 'index.ts'))) {
    findings.push(
      finding(
        repoPath(overrideDir),
        1,
        `\`${implementation}\` has no \`index.ts\`. §15.5: the override's \`index.ts\` exports exactly the default module's public surface, and that file is the one the registry names. (docs/knowledge/05-conventions.md §15.5)`,
      ),
    )
  }

  return findings
}

/** Rules A–F across the tree, plus rule I for each module that has overrides. */
function checkOverrides(modules) {
  const findings = []
  const overrides = []

  for (const moduleDir of childDirectories(MODULES_DIR)) {
    const moduleName = moduleDir.slice(moduleDir.lastIndexOf(sep) + 1)
    const overridesDir = join(moduleDir, 'overrides')
    if (!existsSync(overridesDir)) continue

    // Rule I (§15.3 rule 3) — `overrides/` is not part of the module's public
    // surface: "the barrel at `src/modules/<module>/index.ts` does not re-export
    // it. Only the registry references an override, and the registry is the only
    // file that names one."
    const barrel = join(moduleDir, 'index.ts')
    if (existsSync(barrel) && /overrides/.test(readFileSync(barrel, 'utf8'))) {
      findings.push(
        finding(
          repoPath(barrel),
          1,
          `The barrel names \`overrides\`. §15.3 rule 3: \`overrides/\` is not part of the module's public surface, and the registry is the only file that names an override. (docs/knowledge/05-conventions.md §15.3)`,
        ),
      )
    }

    for (const overrideDir of childDirectories(overridesDir)) {
      const implementation = overrideDir.slice(overrideDir.lastIndexOf(sep) + 1)
      overrides.push({ module: moduleName, implementation, dir: overrideDir })
      findings.push(...checkOverrideFolder(overrideDir, moduleName, modules))
    }
  }

  return { findings, overrides }
}

/* ── Rules F–H: the registry names implementations that exist ─────────────── */

/** The registry's entries, read as the `"<module>/<implementationId>"` keys §15.2 fixes. */
function readRegistryKeys() {
  const keys = []
  for (const path of filesUnder(REGISTRY_DIR)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)) {
      const line = source.slice(0, match.index).split('\n').length
      keys.push({ key: match[1], path: repoPath(path), line })
    }
  }
  return keys
}

/** Rules F–H: the key's form, and the barrel it resolves to. */
function checkRegistry(overrides) {
  const findings = []
  const keys = readRegistryKeys()
  const known = new Set(overrides.map((entry) => `${entry.module}/${entry.implementation}`))

  for (const { key, path, line } of keys) {
    // Rule F — §15.2's registry key is `"<module>/<implementationId>"`, and it is
    // the join between the declaration and the code that runs.
    const parts = key.split('/')
    if (parts.length !== 2 || parts[1] === '' || !IMPLEMENTATION_ID.test(parts[1])) {
      findings.push(
        finding(
          path,
          line,
          `\`${key}\` is not a registry key. §15.2: the key is \`"<module>/<implementationId>"\` — \`"dashboard/clinic-group-a"\`. (docs/knowledge/05-conventions.md §15.2)`,
        ),
      )
      continue
    }

    // Rules G and H — "every entry in the registry resolves to a real barrel".
    if (!known.has(key)) {
      findings.push(
        finding(
          path,
          line,
          `The registry names \`${key}\`, and no \`overrides/${parts[1]}/\` folder with a \`module.ts\` and an \`index.ts\` exists under \`src/modules/${parts[0]}/\`. A registry entry that resolves to nothing is a module the build cannot serve. (docs/knowledge/05-conventions.md §15.6 layer 2)`,
        ),
      )
    }
  }

  for (const entry of overrides) {
    const key = `${entry.module}/${entry.implementation}`
    if (keys.some((candidate) => candidate.key === key)) continue
    findings.push(
      finding(
        repoPath(entry.dir),
        1,
        `\`${key}\` has a declaration but no registry entry, so nothing can select it. §15.6 layer 3 counts a registered override as one that runs the module's suite; an unregistered one runs nothing. (docs/knowledge/05-conventions.md §15.3)`,
      ),
    )
  }

  return { findings, keys }
}

/* ── The report ───────────────────────────────────────────────────────────── */

const modules = readModuleList()
if (modules === undefined) {
  console.error(
    'Overrides: `src/core/constants/modules.ts` has no `export const Module = { … } as const`. ' +
      'The closed module list of `02-architecture.md` §7 is what an override declares itself against, ' +
      'and this check cannot run without it.',
  )
  process.exit(1)
}

if (!existsSync(MODULES_DIR) || !statSync(MODULES_DIR).isDirectory()) {
  console.log(
    `Overrides: none. ${modules.size} modules in the closed list, no \`src/modules/\` tree yet, ` +
      'no overrides to validate.',
  )
  process.exit(0)
}

const { findings: folderFindings, overrides } = checkOverrides(modules)
const { findings: registryFindings, keys } = checkRegistry(overrides)
const findings = [...folderFindings, ...registryFindings]

if (findings.length === 0) {
  console.log(
    `Overrides: clean. ${modules.size} modules in the closed list; ` +
      `${overrides.length} override folder(s) validated against their declarations; ` +
      `${keys.length} registry entry(ies) resolved to a real barrel.`,
  )
  process.exit(0)
}

console.error(`Overrides: ${findings.length} findings.`)
for (const item of findings) {
  console.error(`  ${item.path}:${item.line}:${item.column}  ${item.message}`)
}
process.exit(1)
