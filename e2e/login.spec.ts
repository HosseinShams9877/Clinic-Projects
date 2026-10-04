/**
 * The login pages, end to end — `10-testing-strategy.md` §566: "A test that reaches
 * a real endpoint is an integration test and belongs in `e2e/`."
 *
 * Phase 1's obligation is the smoke test: the pages render, they render in Persian,
 * and the forms a login is made of are reachable and labelled. What this suite does
 * **not** do is complete a login. The reason is a Phase 1 boundary, not a choice:
 *
 * - the seeded database a browser session needs is produced by `npm run db:seed`,
 *   which writes to the SQLite dev file, and
 * - the e2e suite's own contract (`playwright.config.ts`) runs against PostgreSQL in
 *   CI with RLS live, which this Windows dev environment does not have.
 *
 * Completing a login from a spec would therefore be testing a database that is not
 * the one the suite is contracted to run against, and the two ways a wrong code can
 * fail would look like one. The smoke test is what is honest here, and the full
 * login scenario — the one `02-architecture.md` §260's inventory exists for — is
 * the Phase 2 suite, run against the database it needs.
 *
 * ## What the assertions are for
 *
 * - `dir="rtl"` is the root layout's job, and a page that loses it re-flows every
 *   glyph; asserting it per page is the cheapest way to catch a layout that
 *   re-declared it.
 * - the Persian sentences come from `@/modules/auth`'s catalog, so a page that
 *   renders an English label is a page that stopped importing the catalog — which
 *   is the defect `check:i18n` catches in source and this catches rendered.
 * - axe runs on the login pages because they are the two pages an unauthenticated
 *   visitor is certain to see, and the one a visitor using a screen reader is
 *   certain to need (`10-testing-strategy.md` §8).
 */

import { expect, test } from '@playwright/test'

import { AxeBuilder } from '@axe-core/playwright'

import { LOGIN_LABELS } from '@/modules/auth/catalog'

/**
 * The three viewports the config projects define, asserted by name so a failure
 * names the width it failed at rather than the project it ran under.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440 },
  { name: 'tablet', width: 1024 },
  { name: 'mobile', width: 390 },
] as const

test.describe('the customer login page', () => {
  for (const { name, width } of VIEWPORTS) {
    test(`renders the two-step form at ${name} width`, async ({ page }) => {
      await page.goto('/account/login')

      // The page is Persian and right-to-left at every width, because the direction
      // is a property of the document and not of the viewport.
      await expect(page).toHaveURL(/\/account\/login/)
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(page.locator('html')).toHaveAttribute('lang', 'fa')

      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toContainText(LOGIN_LABELS.customerTitle)
      await expect(heading).toBeVisible()

      // The first step is the mobile field and the button that asks for a code. Both
      // are labelled from the catalog, so the accessible name is the Persian sentence.
      await expect(page.getByLabel(LOGIN_LABELS.mobile)).toBeVisible()
      await expect(page.getByRole('button', { name: LOGIN_LABELS.requestCode })).toBeVisible()

      // The layout does not overflow horizontally at the narrowest width — the single
      // breakpoint is 1000px (`08-ui-design-system.md` §43), and 390 is below it.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(width === 390 ? 0 : 2)
    })
  }

  test('passes axe with no critical or serious violation', async ({ page }) => {
    await page.goto('/account/login')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    // §8's threshold: zero critical, zero serious. The full report is attached when
    // this fails, so the violation names itself rather than the rule number alone.
    const severe = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    )
    expect(severe, severe.map((violation) => violation.description).join('\n')).toEqual([])
  })
})

test.describe('the staff login page', () => {
  test('renders the password form', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toContainText(LOGIN_LABELS.staffTitle)

    // A staff login is mobile and password; the customer form is the other half of
    // the page, and both are present because one page serves both audiences.
    await expect(page.getByLabel(LOGIN_LABELS.mobile)).toBeVisible()
    await expect(page.getByLabel(LOGIN_LABELS.password)).toBeVisible()
    await expect(page.getByRole('button', { name: LOGIN_LABELS.submit })).toBeVisible()
  })

  test('passes axe with no critical or serious violation', async ({ page }) => {
    await page.goto('/login')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const severe = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    )
    expect(severe, severe.map((violation) => violation.description).join('\n')).toEqual([])
  })
})

test.describe('the entry page', () => {
  test('offers the two ways in', async ({ page }) => {
    await page.goto('/')

    // `panels.html` in `02-architecture.md`'s inventory: the public page that points
    // at the staff and the customer logins. A visitor without a tenant has exactly
    // these two doors and nothing else on the page is a link into a panel.
    await expect(page.getByRole('link', { name: LOGIN_LABELS.staffTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: LOGIN_LABELS.customerTitle })).toBeVisible()
  })
})
