/**
 * The shared test setup, run once per test file before it is imported.
 *
 * Deliberately almost empty. `10-testing-strategy.md` §1's principles push setup
 * toward nothing: a test that needs a database, a router or a provider is an
 * integration test and builds its own fixtures, so that what it depends on is
 * visible in the test rather than in a file three directories away.
 *
 * ## What is here, and why it is here now
 *
 * `@testing-library/jest-dom` adds the DOM matchers a component test expects —
 * `toBeInTheDocument`, `toHaveAccessibleName`, `toHaveAttribute`. Phase 1's own
 * component tests are the login shell and the panel shell, and the accessibility
 * obligation in the Phase 1 rules ("Every new page passes axe with zero critical
 * or serious violations") is checked partly with `toHaveAccessibleName`. Loading
 * it once here means the first component test file does not have to remember to.
 *
 * It is harmless under the `node` environment the localization tests run in:
 * the matchers are only *registered*, and none of them runs until a test calls
 * one.
 *
 * ## Why `cleanup` is registered explicitly
 *
 * Testing Library registers its own teardown **only** if `afterEach` is a global
 * when its module is evaluated. Its source is plain about this:
 *
 * ```js
 * if (typeof afterEach === 'function') { afterEach(() => { cleanup() }) }
 * ```
 *
 * — and `vitest.config.ts` sets `globals: false`, so `afterEach` is not a global
 * and the registration never happens. Every component test file would therefore
 * accumulate the previous file's rendered tree, and `screen.getBy…` would start
 * matching nodes from a test that has already finished. That failure is
 * intermittent and looks like a flaky query, which is why the fix belongs here
 * rather than in each test file.
 *
 * Registering it once is not the double-cleanup that the guard exists to avoid:
 * importing `afterEach` from `vitest` does not put it on `globalThis`, so Testing
 * Library's own branch stays untaken and this is the only registration.
 *
 * The import is dynamic and guarded by `document`, which is not a style choice.
 * Most of this suite runs in the `node` environment (`vitest.config.ts`), and
 * loading a DOM testing library into a run that has no DOM is the kind of thing
 * that works until the day it does not — and it would take the localization
 * suite, which has nothing to do with React, down with it. The dynamic import is
 * evaluated once and cached, so the cost after the first component test is a
 * module lookup.
 *
 * ## What is deliberately not here
 *
 * No `vi.mock` of `next/navigation`, `next/headers` or Prisma. A test that needs
 * one of those replaces it in its own file, where a reader can see which behaviour
 * was simulated and which was real. A global mock is a lie told to every test.
 */

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

afterEach(async () => {
  if (typeof document === 'undefined') return

  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
