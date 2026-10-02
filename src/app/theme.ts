/**
 * The one colour literal outside `globals.css`.
 *
 * `08-ui-design-system.md` §46's token block is the only place a colour is written,
 * and every component consumes `var(--…)`. There is exactly one exception, and it
 * is not a stylistic one: **`<meta name="theme-color">` cannot take a `var()`**.
 * The value is read by the browser before any stylesheet is applied, is used to
 * paint the address bar on mobile, and is a plain sRGB string by specification. It
 * therefore has to be a literal in the document, and this file is where that
 * literal lives so that it is one named constant rather than a hex in a component.
 *
 * It must equal `--bg` in `src/app/globals.css`. That cannot be asserted by the
 * type system and it is not worth a check of its own in Phase 1, so it is stated
 * here, in the token block's own comment, and in the Phase 1 report: a change to
 * `--bg` that misses this value leaves a warm off-white bar above a slightly
 * different warm off-white page — a mismatch that is obvious on a phone and
 * invisible on a desktop.
 */

/** `--bg` from `08-ui-design-system.md` §46. Keep in step with `globals.css`. */
export const THEME_COLOR = '#f7f2f0'
