/**
 * The tenant's override selection, read from its settings row — `02-architecture.md`
 * §13.2.
 *
 * The row is a `String` column holding JSON, parsed through Zod on read, exactly as
 * `03-data-model.md` §5 requires for every JSON-shaped column on both engines. The
 * shape §13.2 fixes is a map:
 *
 * ```jsonc
 * { "dashboard": { "implementation": "clinic-group-a", "version": "1.0.0" } }
 * ```
 *
 * ## Why this reader is in the registry and not in `core/tenant`
 *
 * `src/core/tenant/lib/overrides.ts` is the tenant-side helper for a stored override
 * set, and it is the pattern this file follows deliberately — parse once at the
 * boundary, hand the caller a value and a report of what could not be used, throw
 * nothing that a tenant would see. It lives there and this lives here because the two
 * read different columns for different purposes: that one reads a `Membership`'s
 * `overrides` for the permission matrix, this one reads `TenantSettings.overrides` for
 * the module boundary. `core` may not import from `modules` (`02-architecture.md` §10
 * rule 3), and the validation that matters here — whether a named implementation is
 * one this build contains — is the registry's to answer, so the reader belongs where
 * the answer is.
 *
 * The composition runs the other way too: this function never reads the database, and
 * `getTenantContext()` is not asked to join a settings read onto a permission check.
 * A caller that has the row calls this; a caller that does not resolves nothing.
 *
 * ## What a stale row means, and why it is not an error
 *
 * A tenant's row is written by the release that created it. Modules are renamed or
 * removed across releases and implementations come and go, so a row read by a later
 * release can name things that are gone. That is drift between two releases of the
 * product, not corruption, and it is reported rather than refused for the same reason
 * `parsePermissionOverrides` reports an unknown slug: the caller has the tenant and
 * the logger, and an operator who can see what the row names is an operator who can
 * decide whether to re-declare.
 */

import { z } from 'zod'

import { isImplementationId, isModuleName } from './declaration'
import type {
  Module,
  ModuleSelection,
  ParsedModuleOverrides,
  UnrecognizedOverride,
} from './types'

/**
 * One entry of the row's map, §13.2.
 *
 * `version` is optional on the read for the same reason it is ignored on the resolve:
 * a row written before a release started recording versions is still a valid
 * selection, and a boundary that demanded it would make an upgrade unresolvable.
 */
const selectionEntrySchema = z.object({
  implementation: z.string().min(1),
  version: z.string().optional(),
})

/**
 * The row is a map keyed by module name.
 *
 * Keyed by `z.string()` rather than `z.enum(MODULES)` on purpose. A key that is not
 * one of the twenty is a stale module name, and the report that matters is "the row
 * names a module this release does not have" — which an enum schema would report as a
 * malformed row, collapsing drift into corruption. The reader partitions the two
 * itself, below.
 */
const selectionRowSchema = z.record(z.string(), selectionEntrySchema)

/** The parse of a row the column does not hold. Used for every column that is not one. */
const UNPARSEABLE: ParsedModuleOverrides = {
  selections: [],
  unrecognized: [],
  unparseable: true,
}

/** The parse of a row that holds nothing the resolver can use. */
const EMPTY: ParsedModuleOverrides = {
  selections: [],
  unrecognized: [],
  unparseable: false,
}

/**
 * The settings row's overrides map, as the resolver consumes it.
 *
 * Accepts the column's three ordinary shapes — `null` and `undefined` for a tenant
 * that has never declared an override, and the empty string a `String` column defaults
 * to — and resolves each to a report with no selections, because "nothing declared" is
 * the state of every tenant at onboarding (`02-architecture.md` §13.4) and it is not
 * an event. An already-parsed object is accepted too, so a caller that read the column
 * itself does not have to re-serialise it to use this function.
 *
 * Never throws; see `ParsedModuleOverrides` for why the fallback is safe here where it
 * is not in the membership reader.
 */
export function parseModuleOverrides(raw: unknown): ParsedModuleOverrides {
  if (raw === null || raw === undefined || raw === '') {
    return EMPTY
  }

  let candidate: unknown = raw
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw)
    } catch {
      return UNPARSEABLE
    }
  }

  const parsed = selectionRowSchema.safeParse(candidate)
  if (!parsed.success) {
    return UNPARSEABLE
  }

  const selections: ModuleSelection[] = []
  const unrecognized: UnrecognizedOverride[] = []

  for (const [key, entry] of Object.entries(parsed.data)) {
    if (!isModuleName(key)) {
      // Drift between releases: a module this release does not have. The whole entry
      // goes, and the key is what the report names because the implementation under it
      // is meaningless without the module it was for.
      unrecognized.push({ key, reason: 'unknown-module' })
      continue
    }

    if (!isImplementationId(entry.implementation)) {
      // A module this release knows, with an entry that is not §13.2's shape: the row
      // is corrupt rather than stale, reported as that one entry while the rest of the
      // row is still served.
      unrecognized.push({ key, reason: 'malformed-entry' })
      continue
    }

    const moduleName: Module = key
    selections.push({
      module: moduleName,
      implementation: entry.implementation,
      version: entry.version,
    })
  }

  return { selections, unrecognized, unparseable: false }
}
