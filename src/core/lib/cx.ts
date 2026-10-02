/**
 * `05-conventions.md` §9 requires that "component state lives in class names
 * (`is-loading`, `is-disabled`), not in ad-hoc attributes" — and every component
 * that does that needs to join a conditional class list into one string.
 *
 * There are three ways to write that join and two of them are wrong here:
 *
 * - **Template literals** — `` `${base} ${active ? styles.active : ''}` `` —
 *   produce a trailing or doubled space, which is invisible in the DOM and
 *   visible to a `toHaveClass` assertion that compares the whole attribute.
 * - **A CSS-in-JS library** — `classnames`, `clsx`, `class-variance-authority` —
 *   is a dependency for a five-line function, and `class-variance-authority` is
 *   named in the forbidden list in `eslint.config.mjs` for a different reason.
 * - **This function** — one truthiness test, one `join`, no dependency.
 *
 * The accepted values are exactly the ones a conditional produces: a class name, a
 * `false` from a short-circuited `&&`, or an absent prop. Empty strings are
 * dropped too, so a computed name that happened to be empty cannot add the space
 * that a naive template literal would.
 */

/** Anything that may appear in a class list. */
export type ClassValue = string | false | null | undefined

/**
 * Joins the truthy values with a single space.
 *
 * `cx('a', false, undefined, 'b')` is `'a b'`. Order is preserved, so the
 * component's own base class always comes first and a caller's `className`
 * always comes last — which is the order a stylesheet's specificity expects.
 */
export function cx(...values: readonly ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ')
}
