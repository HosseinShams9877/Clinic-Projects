/**
 * The injected clock — `05-conventions.md` §8.
 *
 * > "**No `new Date()` in business logic.** Time comes from an injected clock, so
 * > that slot generation and next-due computation are testable at any date."
 *
 * A clock is a function, not a value, because the callers that need one need it
 * more than once: the worker reads it every poll, a scheduler reads it per slot.
 * A module that took a `Date` would be reading a clock that stopped, and a module
 * that read `new Date()` itself is the thing the rule exists to prevent —
 * untestable at any date other than the day the test ran, and unable to observe a
 * lease expiring or a job becoming due.
 *
 * ## Why this file is the one place the rule does not apply
 *
 * `eslint.config.mjs` bans `new Date()` and `Date.now()` everywhere under `src/`,
 * and the ban is what makes §8 real rather than a note in a review. A clock that
 * is injected still has to read the wall clock *somewhere*, and that somewhere is
 * here: `realClock` is the boundary between the ambient clock and the injected
 * one, which is why it is the single file the lint exemption names. Everything
 * else takes a `Clock` and stays testable at ۱۳۹۰ or ۱۴۵۰.
 *
 * ## Who takes which
 *
 * A library function takes a `Clock` and a test passes a fixed date. An entry
 * point — the worker's poll loop, a request handler — takes `realClock` and hands
 * the *value* it produces to the functions it calls, so the library never sees the
 * mechanism and one tick of the loop is one moment in time.
 */

/** The clock a function that needs the current time takes as a parameter. */
export type Clock = () => Date

/**
 * The wall clock.
 *
 * The single sanctioned read of the ambient time (`05-conventions.md` §8 and the
 * lint rule named above). Called by the entry points, never by a library function.
 */
export const realClock: Clock = () => new Date()
