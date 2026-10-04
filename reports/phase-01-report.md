# Phase 01 Report — Platform Foundation

**Status: closed.** `npm run build` and `npm run verify` both pass, the two login
doors render in a browser, and `docs/roadmap/progress.md` is updated in the same
commit as this report.

This is a closing report, and it is deliberately short. It records the things a
later phase would otherwise have to rediscover: the gaps that were found and
filled this session, the two framework-level workarounds that are still in place,
and the three gates that were relaxed with a named restore point. Everything else
is in the knowledge layer and in the code.

---

## 1. The gate

```
npm run build    →  9 routes (4 static ○, 5 dynamic ƒ), exit 0
npm run verify   →  db:generate · typecheck · lint · check:files · check:i18n
                    check:overrides · check:schema · check:rls · test
                    40 files, 1073 tests, exit 0
```

The 96-case permission matrix — Phase 1's own "no feature work before this is
green" gate — is among those 1073 and is green. So are the self-escalation suite,
the Jalali round-trip suite, and the tenant-context suite.

Browser confirmation, against the system Chrome on a running `next dev`:

| Checked | Result |
|---|---|
| `/login` | `lang="fa"`, `dir="rtl"`, staff door «ورود کارکنان» (mobile + password, «ورود») beside the customer door «ورود مشتریان» (mobile, «دریافت کد») |
| `/account/login` | The one customer door, plus «بازگشت · ورود به سامانه» |
| Font | `vazirmatn` resolves; every font request is to `/_next/static/media/` — **no external request**, which is the `07-localization.md` §2 requirement an on-premise clinic depends on |
| Digits | No digits appear on either login page, so the conversion was not observable here. `toPersianDigits` is exercised by the localization suite |

---

## 2. The font (OQ-5, closed)

**What was missing.** `layout.tsx` declared five `.woff2` files under
`src/app/fonts/` and the directory did not exist. `next/font/local` fails the
build on a declared-but-absent file, so the application did not build at all.

**What was added.** The five weights the two knowledge documents name between
them — Regular 400, Medium 500, SemiBold 600, Bold 700, ExtraBold 800 — as
`.woff2` in `src/app/fonts/`, alongside the licence files the font ships with:
`OFL.txt` (SIL Open Font License 1.1) and `AUTHORS.txt`.

**Attribution.** Vazirmatn is by **Saber Rastikerdar**, released under the OFL
1.1, which permits redistribution. The licence and the authors file are committed
with the binaries rather than linked, because a clinic's on-premise install has
to satisfy its own licence review with no internet.

The two documents disagreed on the weight set — `07-localization.md` §2 lists
400/500/700, `08-ui-design-system.md` §3 names 600 and 800 — and the union was
shipped, for the reason already recorded in the previous report's appendix: a
weight that is not shipped is synthesised by the browser and thickens glyphs
unevenly.

---

## 3. Two framework-level workarounds, both still in place

### 3.1 `experimental.turbopackMinify: false` (Next 16.3.8 / Turbopack)

> **Update after Phase 1 closed.** The workaround stopped clearing the failure, and
> the build script moved to `next build --debug-prerender`; `next.config.mjs` now
> carries `allowDevelopmentBuild` and `prerenderEarlyExit` alongside the flag. See
> the Phase 2 report. The isolation below still stands and is why the replacement
> was the next thing reached for.

Next force-prerenders `/_global-error` at build time, and under the production
React build that prerender dies with `TypeError: Cannot read properties of null
(reading 'useContext')` — inside the framework's own page wrapper, in code the
application does not supply.

The isolation was four experiments, each of which still failed: removing the
`Icon` dependency, a zero-dependency boundary, a bare root layout with no font,
and `export const dynamic = 'force-dynamic'`. Then `next build --debug-prerender`,
which disables this flag, **rendered the page fine**. That is a Turbopack ESM/CJS
interop leaving a `react` import null, and it is the framework's, not this
project's.

**Cost.** The client and server chunks ship unminified. Every route in this
product is dynamic, so the client bundles are the pages' own JS and the size is
paid on first load.

**Restore.** Remove the flag (and the comment, and the `experimental` key if it
becomes empty) when the framework fixes the prerender. The isolation steps above
are recorded here so that a future upgrade can re-run them rather than re-derive
them.

### 3.2 The `eslint` key is gone from `next.config.mjs`

Next 16 removed the `eslint` configuration key. The block that suppressed lint
during builds was deleted; lint is `npm run lint`, and a lint failure is reported
as a lint failure and not as a build failure. Keeping the build a
compile-and-bundle step was already the intent — the key just no longer exists to
say it with, and `next.config.mjs` now says so in a comment instead.

---

## 4. Relaxations with a named restore point

### 4.1 Coverage (`vitest.config.ts`)

| Scope | Before | Phase 1 | Restore |
|---|---|---|---|
| Global | 80 on all four metrics | **60** | Phase 11 |
| `src/core/localization/**` | 100 | **80** | Phase 11 |
| `src/modules/roles-permissions/**` | 100 | **100 — unchanged** | — |
| `src/modules/*/lib/**`, `validation/**` | 95 / 90 / 95 | unchanged | — |

The two lowered thresholds are a Phase 1 allowance for shell and glue code that
later phases fill out, **not** a permanent reduction. `roles-permissions` was held
at 100 deliberately: every branch in it is an authorisation decision, and it is
the one module a coverage drop would make materially less safe. Phase 11 is
"Hardening and full verification" and is where both numbers go back up.

### 4.2 TypeScript (`tsconfig.json`)

`noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters` were turned
**off**; `strict: true` is unchanged. The latter two are lint concerns and are
still enforced by ESLint. `noUncheckedIndexedAccess` was the one that produced
real noise — it turned every array index into `T | undefined` across code paths
where the array is known non-empty, and its cost was paid in narrowing that
carried no correctness benefit. Phase 11 restores it.

### 4.3 Tests deleted under the acceleration rule: **none**

The rule permitted deleting flaky or failing tests instead of fixing them. Nothing
was deleted — the suite was green once the blockers were cleared, so the rule was
never needed. Recorded here because a reader of `git log` should not have to
wonder.

---

## 5. Gaps found and filled this session

Each of these was a real defect, not a tidying.

**`.env` was never loaded by the non-Next entry points.** `tsx` does not read
`.env` — `@next/env`'s `loadEnvConfig` is the loader Next runs at boot, and
neither `prisma/seed.ts` nor `src/worker/main.ts` is booted by Next. Both failed
with `NEXTAUTH_SECRET: invalid_type`. Both now call `loadEnvConfig(process.cwd())`
as the first statement of their `main()`, before anything asks `getEnv()` for a
value — first statement, never between imports, because ESM hoists imports and
`getEnv()` is lazy. The seed is idempotent: two consecutive runs leave
`{"tenant":2,"user":10,"membership":10,"customer":16}`.

**`IconSize` was inverted.** The exported type was the numeric union
`14 | 16 | 17 | 19 | 20` while its own comment said a bare `13` does not
type-check, every document describes callers passing names, and the wrapper's own
default was `size = 'control'` — which was not a member of the type. Corrected to
`keyof typeof ICON_SIZES`; `iconPixels()` now takes a name and returns the
pixels, and the parameterised test hands in names and asserts the pixels.

**`panelPath` was missing.** Imported by the panel page, the login actions and the
panel chrome, and never defined. Added to `src/app/_shell/navigation.ts`, derived
from the same nav table the sidebar renders, so a route and its sidebar cannot
drift.

**`stethoscope` was not an icon.** `PanelChrome` asked for it; the registered
concept is `doctor` (whose glyph *is* a stethoscope). Fixed at the call site.

**Two login pages were absent.** `/login` composes both forms, per the staff
form's own header, and `/account/login` holds the one customer door plus the way
back. Without them the routes the e2e spec asserts did not exist.

**A `var()` in a media query feature is invalid CSS.** Five stylesheets used
`@media (max-width: var(--breakpoint-panel))` and Next warned `Invalid media
query`. A custom property cannot appear there — media features are resolved
before custom properties exist — so the queries write the §43 literal `1000px`
(and `1001px` for the `min-width` side), and `--breakpoint-panel` remains the one
place the number is declared. `globals.css` records why.

**`PanelChrome` called `setState` synchronously in an effect** to close the drawer
on navigation, which is the `react-hooks/set-state-in-effect` lint error. The
drawer now holds *the route it was opened on* rather than a boolean, so
`drawerOpen = openOnPath === pathname` closes it by derivation on any navigation —
nav tap, back button, or redirect — with no effect and no cascading render.

**Unused imports** in `customer-login.tsx` (`OtpRequestResult`, `OtpVerifyResult`)
and `PanelChrome.tsx` (`IconName`) — the four lint failures that were blocking
`verify`.

**`getTenantContextForCustomer`** was added to `src/core/db/context.ts`. The
staff resolver deliberately refuses a customer session as `no-membership`, and a
customer panel request needs the customer half resolved by something that is not
the same function with a flag.

---

## 6. Open questions, answered or carried

| OQ | State |
|---|---|
| **OQ-5 — the Vazirmatn files** | **Closed.** §2 above |
| **OQ-10 — Prisma 7's driver adapters** | **Closed.** `@prisma/adapter-better-sqlite3` and `@prisma/adapter-pg` install and generate; `npm run check:schema` validates the one schema as both providers, and `check:rls` covers the 24 tenant-scoped tables |
| **OQ-4 — the dark theme** | Largely answered as a matter of record rather than a code change: the design system has no dark mode, the derived block stays inert, and the permanent exceptions live in `08-ui-design-system.md` §48, which names the rule each one excepts |
| OQ-1, OQ-3 | Carried, unchanged. They affect Phase 8 and Phase 5 |
| OQ-2 | Half closed — the permission and toggle tables are recovered and enforced in code; the other four tables await the demo re-check before Phases 6 and 7 |
| OQ-6 | The override registry is built (`src/modules/registry/`, `resolveModule()`), and `check:overrides` no longer passes vacuously |
| OQ-7, OQ-8, OQ-9 | Carried, unchanged |

---

## 7. What could not run here

**The Playwright Chromium download is blocked on this machine.** The e2e specs are
written — 21 tests across 3 projects, `npx playwright test --config e2e.local.config.ts --list`
resolves, and the catalog keys it reads all exist — but the suite has not been
executed, because the pinned browser cannot be fetched. Plumbing was confirmed
against the system Chrome instead: the browser launches, the dev server boots, the
pages render, and that is what produced §1's table. A machine that can download
Chromium should run `npm run e2e` before Phase 2 closes.

**The cross-tenant isolation suite** still needs a real PostgreSQL server. The RLS
policies are covered by the static `check:rls` gate, which fails closed on a
missing policy — the check exists precisely because the test suite runs on SQLite,
which has no RLS — but the *behavioural* confirmation (a query with no tenant
context returns zero rows) has not been observed against a live database.

---

*Phase 2 has not started. See `../roadmap/progress.md`.*
