/**
 * Vitest configuration.
 *
 * `10-testing-strategy.md` §11 sets the coverage targets and makes them blocking,
 * so they are thresholds here rather than a report a reviewer reads:
 *
 * | Scope | Line | Branch |
 * |---|---|---|
 * | `src/core/localization/**` | 100% | 100% |
 * | Global | 80% | — |
 *
 * The 100% for the localization layer is not a formality. §11 puts digits, the
 * Jalali calendar and money in the same row as the permission matrix, and §3.4
 * explains why: a formatting bug here is a wrong number on a screen that survives
 * every review, because the code looks right. A branch that no test reaches is a
 * branch whose behaviour nobody has checked.
 *
 * ## Everything is instrumented, and only two things are gated
 *
 * The covered set is every `.ts` and `.tsx` under `src/` — including
 * `src/core/components/**`, `src/app/**` and `src/worker/**`. §11's table has a row
 * for "`src/app/**` and components" at 70%, marked *reported, not blocking*, and
 * the only way to report a number is to measure it. Excluding those paths from the
 * instrumented set would make the row unmeasurable and would quietly hide the code
 * most likely to be untested.
 *
 * The consequence is deliberate and is worth stating: because everything is
 * measured, everything feeds the **global 80%**, which does block. That is §11's
 * own arrangement — a component's own number is not a gate, but components are
 * part of the aggregate that is. So a component with no test is not a threshold
 * failure by itself and *is* a pull on the number that is. The fix for that is a
 * test, not a narrower `include`.
 *
 * ## The environment is `node`, deliberately
 *
 * The localization layer is pure — strings, bigints, the calendar — and reads no
 * DOM. Running it under jsdom would slow every test in the suite by a factor to
 * gain nothing. Component tests opt in per file with a `@vitest-environment jsdom`
 * docblock, which is the mechanism Vitest provides for exactly this split.
 *
 * ## Time is injected, never faked
 *
 * `05-conventions.md` §10: "Time-dependent tests use the injected clock, never
 * `vi.useFakeTimers()` on business logic that should have taken a clock." Every
 * function in this layer that depends on the current time takes it as a required
 * parameter, so no test here needs a fake timer — and a test that reached for one
 * would be a signal that a function had started reading the clock itself.
 *
 * ## Why no `TZ` is set here
 *
 * The tests are written to pass in any timezone, and that is a property worth
 * keeping rather than working around. `date-fns-jalali` reads and writes local
 * Gregorian parts in both directions, so a `LocalDate` is stable wherever the
 * process runs; the UTC bridge uses `Date.UTC` and the UTC accessors, so it is
 * offset arithmetic rather than a host lookup. Pinning `TZ` would hide a
 * regression that introduced a host dependency. `10-testing-strategy.md` §2 rule 4
 * ("tests run against the same engine as production") points the same way: the
 * suite should prove it does not care, not be told not to.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        // Barrels re-export and nothing else. A file with no statements has no
        // lines to cover, and counting it only adds noise to the report.
        'src/**/index.ts',
        // Declaration-only files: types, branded strings, regex constants. There
        // is no statement in them to execute, and v8 reports a zero-statement
        // file inconsistently — sometimes 100%, sometimes 0% — which turns a
        // threshold into a coin toss.
        //
        // The exclusion is safe because of where nothing is hidden: a module's
        // Zod schemas live in `validation/`, not in `types.ts`, so the coverage
        // that matters for §11's "`src/modules/*/validation/**` 95%" row is not
        // affected. A constant in a `types.ts` that has a *branch* — a fallback,
        // a conditional default — is a constant that belongs in the file that
        // computes it, which is included.
        'src/**/types.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        // §11: digits, the Jalali calendar and money are 100%/100%, blocking.
        'src/core/localization/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        // §11 global. Phase 1 has no modules, so this is the backstop that keeps
        // a later module from landing untested rather than a gate that bites now.
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})
