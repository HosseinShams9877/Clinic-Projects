/**
 * The shared types barrel.
 *
 * `05-conventions.md` §4 — a module's public surface is its `index.ts` and
 * nothing else. `core/types` is not one of the 20 modules, but the same rule
 * applies inside `core`: consumers import `@/core/types`, never
 * `@/core/types/brand`.
 */

export * from './brand'
export * from './errors'
