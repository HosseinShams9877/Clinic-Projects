/**
 * Playwright — the end-to-end and cross-cutting suites.
 *
 * `10-testing-strategy.md` draws the line this file implements: unit and
 * integration tests live beside their subject in `tests/` and run under Vitest;
 * anything that drives the **real application** lives here, at the repository root
 * under `e2e/`:
 *
 * > Two of the layers are cross-cutting and are not per-module: the accessibility
 * > suite (§8) and the responsive suite (§9). They are Playwright specs under
 * > `e2e/`, because they assert about rendered pages rather than about a module's
 * > behaviour. — §10
 *
 * ## Three viewports, because the breakpoint is a requirement
 *
 * `08-ui-design-system.md` §43 fixes a single breakpoint at **1000px**, and §9 of
 * the testing strategy requires every page to be checked at desktop, tablet and
 * mobile. The three projects below therefore sit on **both sides** of that one
 * number — 1024 is above it, 390 is below it — rather than at three arbitrary
 * sizes. A viewport chosen for looking nice would not test the switch.
 *
 * ## Tehran, and `fa-IR`
 *
 * `locale: 'fa-IR'` and `timezoneId: 'Asia/Tehran'` are not conveniences. The
 * product is RTL, Persian and rendered against a clinic wall clock that is
 * **UTC+3:30** (`06-constants.md` §7), and the browser's locale and timezone are
 * inputs the app reads: `Intl` in the test oracle, `toLocaleString` in a
 * third-party widget, a browser-native date input. Leaving them to the runner's
 * host would make the suite pass in Tehran and fail in CI, or the reverse — and
 * the failure would be blamed on the code rather than on the machine.
 *
 * ## Why `webServer` starts the dev server and not a production build
 *
 * e2e has to run against a database, and `10-testing-strategy.md` §2 makes that
 * database **PostgreSQL in CI, with RLS live** — a production boot against SQLite
 * refuses to start, which is a deliberate property, not something to work around.
 * The server itself is whichever one the environment provides: in CI the workflow
 * builds and starts it, locally `npm run dev` will do. `reuseExistingServer` is
 * what makes both work without a flag, so a developer who already has the app
 * running does not get a second one on a different port.
 */

import { defineConfig, devices } from '@playwright/test'

/** `CI` is set by every major CI provider; locally it is unset. */
const IS_CI = Boolean(process.env.CI)

/** Where the app under test is. Overridable so a CI job can point at a built server. */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

/**
 * The three viewports of `10-testing-strategy.md` §9.
 *
 * The widths are chosen against §43's single 1000px breakpoint: `desktop` and
 * `tablet` are both above it (the sidebar is docked, padding is 24px) and `mobile`
 * is below it (off-canvas sidebar, 16px padding). No project sits near the line by
 * accident, because a viewport a few pixels off it would test one layout and be
 * read as testing the other.
 */
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 1024, height: 1366 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const

export default defineConfig({
  testDir: './e2e',

  /**
   * A test that reaches a real endpoint belongs here and not in Vitest
   * (`10-testing-strategy.md` §566), so the two suites must not be able to run each
   * other's files. This is the assertion that keeps them apart.
   */
  testMatch: ['**/*.spec.ts'],

  fullyParallel: true,

  /** A `test.only` that reaches main is a suite that silently stops testing. */
  forbidOnly: IS_CI,

  /** One retry locally would hide a flake; two in CI is enough to see one without stalling. */
  retries: IS_CI ? 2 : 0,

  /**
   * The suite drives one database. Parallel workers would interleave writes and
   * turn a real failure into a flake, so CI runs one at a time.
   */
  workers: IS_CI ? 1 : undefined,

  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    /** The design system has no dark mode (`08-ui-design-system.md` §1). */
    colorScheme: 'light',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: VIEWPORTS.map(({ name, viewport }) => ({
    name,
    use: { ...devices['Desktop Chrome'], viewport, locale: 'fa-IR', timezoneId: 'Asia/Tehran' },
  })),

  /**
   * The app is already running locally more often than not, and starting a second
   * one on another port would silently test the wrong server.
   */
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
