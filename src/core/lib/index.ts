/**
 * `src/core/lib` — the shared utilities that are not the localization layer, not
 * the constants, and not a type.
 *
 * The folder earns its place by being small. A helper belongs here only when it
 * is used by more than one component **and** has no better home: `cx` is the first
 * because nearly every component joins a conditional class list, and it is too
 * general to live inside any one of them.
 *
 * Anything that knows what a value *means* — a money conversion, a date, a
 * permission — belongs in the module that owns that meaning, or in
 * `src/core/localization` or `src/core/constants`. This folder is for mechanics.
 */

export * from './cx'
