/**
 * PostCSS — the one plugin this project uses.
 *
 * Tailwind v4 is configured in CSS, not in JavaScript: there is no
 * `tailwind.config.js`, and the theme is declared inside `src/app/globals.css`
 * with `@theme`, reading the token block that has always been the single source
 * of truth. This file exists only to put the engine on the PostCSS pipeline that
 * Next already runs.
 *
 * **Do not add a `tailwind.config.js`.** The moment one appears, the theme has two
 * places to live and the token block stops being the source of truth. See
 * `src/app/globals.css`'s header for where the theme is declared, and ADR-0022 for
 * the decision to move styling onto Tailwind.
 */

export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
