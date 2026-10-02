/**
 * The catalog's public surface.
 *
 * One file per namespace, re-exported here, so a caller imports
 * `@/core/localization` and never reaches into `catalog/common` directly — the
 * same barrel rule `02-architecture.md` §10 applies between modules, applied
 * inside the localization layer for the same reason: a path that names a file is
 * a path that has to be updated when the file moves.
 *
 * Module catalogs (`src/modules/<module>/catalog.ts`) are **not** re-exported from
 * here. `07-localization.md` §7.2 namespaces the catalog per module, and
 * `02-architecture.md` §10 forbids a cross-module deep import — so a module's
 * labels are reached through that module's own barrel, not through `core`.
 */

export * from './common'
export * from './enums'
