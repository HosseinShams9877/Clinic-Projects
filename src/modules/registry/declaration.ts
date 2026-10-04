/**
 * The declaration schema — `05-conventions.md` §15.6 layer 4.
 *
 * "Startup | The registry is built once; each entry's declaration is parsed by a Zod
 * schema. A malformed declaration marks that entry invalid and it is not offered to
 * the resolver."
 *
 * ## Why the declaration is re-parsed when the compiler has already seen it
 *
 * The declaration is a typed object imported from the override's `module.ts`, so its
 * shape is a compile-time fact. Layer 4 exists because two things the compiler
 * guarantees are not the things this check cares about:
 *
 * - `module` is typed against §7's union, and the union is derived from
 *   `src/core/constants/modules.ts`. A module removed between releases is removed
 *   from the union, so a declaration written against an older release fails here and
 *   not at compile time of either release.
 * - `version` is typed `string`, because semver is a value constraint and not a type
 *   one. `1.0` and `v1.0.0` are strings.
 *
 * The two checks that a compiler *can* make — that `exposes` is `ModuleExposes<module>`
 * and that `implementation` matches the folder — are repeated here anyway because the
 * registry's build is the boundary that decides whether an entry is offered, and a
 * boundary that trusts the artefact it is validating is a boundary that cannot be
 * reached from the other side.
 *
 * ## What this does not do
 *
 * It does not load the override's barrel. Conformance of the barrel to `exposes` is
 * layer 1, a compile error, and there is nothing runtime validation can add to a type
 * that is already checked. The declaration is the input to validation
 * (`05-conventions.md` §15.4) and the barrel is the thing the type checker checks.
 */

import { z } from 'zod'

import { MODULES, isMember } from '@/core/constants'

import type { Module, ModuleExposes, OverrideDeclaration } from './types'

/** §15.2's implementation id and §15.4's version, as the runtime sees them. */
export const IMPLEMENTATION_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

/**
 * The declaration's four fields, in §15.4's order.
 *
 * `module` is `z.enum(MODULES)` rather than `z.string()` so an unknown module is a
 * parse failure with a path to the field, which is what the startup warning needs in
 * order to name it. `exposes` is a plain string here and checked in the `superRefine`
 * below, because the relationship between `exposes` and `module` is a computation and
 * a schema that expressed it as a literal list would be twenty entries long and stale
 * the moment a module was added.
 */
const overrideDeclarationSchema = z
  .object({
    module: z.enum(MODULES),
    implementation: z.string().regex(IMPLEMENTATION_ID),
    version: z.string().regex(SEMVER),
    exposes: z.string().min(1),
  })
  .superRefine((declaration, context) => {
    const expected = `${pascalCase(declaration.module)}Module`
    if (declaration.exposes !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exposes'],
        message: `\`exposes\` is \`${declaration.exposes}\`, but an override of \`${declaration.module}\` is typed as \`${expected}\`.`,
      })
    }
  })

/**
 * `roles-permissions` → `RolesPermissions`, for the `exposes` check.
 *
 * The runtime twin of the `PascalCase` type in `./types.ts`; the two are kept in step
 * by the registry's own test, which resolves a fixture override end to end and would
 * fail to register it if either moved. Exported for that test and for the
 * `scripts/check-overrides.mjs` counterpart, which computes the same thing from a
 * folder name.
 */
export function pascalCase(module: string): string {
  return module
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * The message for a declaration the schema rejected.
 *
 * The first issue only, because a declaration has four fields and four jobs and the
 * first failure is the one to fix; a warning that listed all four would report the
 * cascade rather than the cause. The path is included so the warning names the field,
 * which is what an operator needs in order to find the file.
 */
function describe(error: z.ZodError): string {
  const issue = error.issues[0]
  const path = issue === undefined ? '' : issue.path.join('.')
  const message = issue === undefined ? 'the declaration was rejected' : issue.message
  return path === '' ? message : `${path}: ${message}`
}

/**
 * §15.6 layer 4's outcome for one declaration.
 *
 * A union rather than a thrown error because the caller — the registry's build — has
 * to record the entry as invalid and continue, and a function that throws would make
 * "dropped with a startup warning" indistinguishable from "the build failed".
 */
export type DeclarationParseResult =
  | { readonly status: 'valid'; readonly declaration: OverrideDeclaration }
  | { readonly status: 'invalid'; readonly message: string }

/**
 * Parses an override's declaration, or reports why it cannot be offered.
 *
 * The returned declaration is the schema's output reconstructed against the registry's
 * own types. The schema only narrows — it transforms nothing — so the four fields are
 * the fields §15.4 fixes; reconstructing them is what carries the literal `module`
 * union into the registry's entries, which the schema's inferred type widens to
 * `string` and which the key typing in `./registry.ts` needs in order to relate an
 * entry to the module it replaces.
 */
export function parseOverrideDeclaration(declaration: unknown): DeclarationParseResult {
  const parsed = overrideDeclarationSchema.safeParse(declaration)
  if (!parsed.success) {
    return { status: 'invalid', message: describe(parsed.error) }
  }

  // `parsed.data.module` is the enum's union, which is `Module`; the cast is the
  // schema's own statement that the two sets are one, and it is here rather than at
  // the call site because this is the layer that owns the schema.
  const moduleName = parsed.data.module as Module

  return {
    status: 'valid',
    declaration: {
      module: moduleName,
      implementation: parsed.data.implementation,
      version: parsed.data.version,
      // The `superRefine` above has already established that this is
      // `${pascalCase(module)}Module`; the cast is that check's statement to the
      // type system, which cannot see a `superRefine` and would otherwise hold the
      // field at the `z.string()` the schema declares.
      exposes: parsed.data.exposes as ModuleExposes<typeof moduleName>,
    },
  }
}

/**
 * Whether a value is a §15.2 implementation id.
 *
 * Narrowing rather than asserting because the callers are boundary readers: a
 * settings row's implementation is `unknown` until something says what it is, and the
 * answer decides between "this entry is not the shape §13.2 fixes" and "this entry is
 * a shape the registry may or may not contain".
 */
export function isImplementationId(value: unknown): value is string {
  return typeof value === 'string' && IMPLEMENTATION_ID.test(value)
}

/**
 * Whether a value is one of §7's twenty modules.
 *
 * The runtime half of the type-level constraint, for the settings row: a row written
 * by an older release names a module that may not be one of the twenty, and the
 * selection reader has to tell a stale key from a malformed one.
 */
export function isModuleName(value: unknown): value is Module {
  return isMember(MODULES, value)
}
