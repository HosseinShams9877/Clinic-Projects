# Phase 10 Report — Reports, Settings, Tenancy, Licensing

## 1. Phase

**Complete**, started and completed ۱۴۰۵/۰۷/۱۶. Closed in commit `0706d06`
(`feat: phase 10 reports settings tenancy licensing`), one commit, no WIP —
40 files, 5237 insertions.

Phase 9 gave the customer their own four pages. This phase gives the manager the
three the goal names behind them: the dashboard that sizes the day, the seven
retention reports, and the six settings tabs — and behind those, the two
conditional modules the architecture keeps on either side of the `MULTI_TENANT`
boundary.

---

## 2. What was produced

**Five modules, three pages, eleven Server Actions, one client island, one
migration.**

### 2.1 `reports` — the seven, and not the eighth

| File | Surface |
|---|---|
| `lib/range.ts` | `localDateWhere`, `toInstantRange`, `readReportOffset`, `monthStartOf` |
| `lib/retention.ts` | `returnRateReport`, `averageSessionsReport`, `cycleCompletionReport`, `noShowReport` |
| `lib/curve.ts` | `dropOffCurveReport`, `lastVisitDistributionReport` |
| `lib/doctors.ts` | `doctorComparisonReport` |

The range vocabulary is the module's own export because a span of days has to be
read the same way wherever it is read, and the dashboard's month is a span of days
too — `dashboard` imports the four from the `reports` barrel rather than
restating them, which is the one direction the dependency graph runs.

The module holds no money, and that is a property of the types before it is a
property of any query: a field that is not in `types.ts` is a figure no screen can
render. §3.2 is the test that says so.

### 2.2 `settings` — six tabs, one row

| File | Surface |
|---|---|
| `lib/read.ts` | `readSettingsSurface` — all six tabs in one read |
| `lib/write.ts` | `saveIdentity`, `saveBooking`, `saveWorkingHours`, `saveCycleTab`, `saveMessages`, `saveToggles` |
| `lib/toggles.ts` | `readToggles`, `requireToggle` |
| `lib/overrides.ts` | `setOverrideDeclaration`, `removeOverrideDeclaration` |
| `validation/schema.ts` | seven Zod schemas, one per tab |

`requireToggle` raises rather than returning a boolean, because a gate that
returns a boolean is a gate the caller can forget to check — §3.3 is the test. The
enforcement lives here and not in `roles-permissions` because the permission
module owns the closed list and this module owns the row the value is stored in.

The override administration surface is **one tab** — «اختیارات», the sixth —
which carries the eight toggles *and* the overrides the tenant has declared, so a
clinic's whole behavioural posture is one screen. A declaration is validated
against `REGISTRY` before it is written and audited as
`settings.override_declared` / `settings.override_removed` against
`tenant_settings`, because an override changes which implementation a clinic runs
and the trail is the only record of who pointed it there.

### 2.3 `tenant-management` and `license` — the two conditional modules

Active on opposite sides of `MULTI_TENANT` (`02-architecture.md` §7), and neither
loaded in the other's mode. Both take the **unscoped** client, and for the same
reason from opposite directions: `tenant-management` acts across tenants, which is
the one thing a tenant's own scope forbids and the exception the operator exists
for; `license` runs before there is a tenant scope to open, because the license
check is the thing that decides whether one exists.

- `tenant-management` (`MULTI_TENANT=true`): `provisionTenant`, `suspendTenant`,
  `reactivateTenant`, `addClinic`, and the three membership writers, beside
  `listTenants` / `listClinics` / `listTenantMemberships`.
- `license` (`MULTI_TENANT=false`): `recordLicenseKey`, `issueLicenseKey`,
  `validateLicense`, `currentLicense`, `currentLicenseStatus`, with the four
  `LicenseStatus` answers and the sentences the blocking screen renders.

`provisionTenant` creates the tenant and its settings first and then the first
manager against the created ids — the nested `memberships.create` could not
inherit the parent's `tenantId`, so the graph is explicit rather than relational.

### 2.4 `dashboard` and the three pages

`readManagerHome` sizes the day ahead, the month's retention, and the two queues
that need a person (overdue cycles, dormant customers). None of its figures is
money: this is the one screen a role holding the whole matrix sees, and a
financial figure here would be the one screen in the product that shows revenue to
it. The debt-adjacent count is a count of customers, not a sum.

| Page | Renders |
|---|---|
| `admin/page.tsx` | the three sections of `ManagerHome`, replacing Phase 1's placeholder |
| `admin/reports/page.tsx` | the seven, over the Jalali range `?from`/`?to` names, defaulting to the current month |
| `admin/settings/page.tsx` | the six tabs on `?tab=`, one form each |

`admin/reports`'s range defaults to the current Jalali month, so a manager who
opens the page sees the month they are in and a manager who shares a link shares
the exact range. `admin/settings` reads all six tabs in one call — the tab bar
renders the six names from the constants' own order, and a second read for the bar
would be a second place the six are listed.

### 2.5 The eleven actions and the island

`_settings/actions.ts` — one action per tab plus the four add/remove rows the
working-hours and options tabs need. Each is a `useActionState` pair, parses
through the tab's own Zod schema, `revalidatePath`s, and answers with the
catalog's own sentence on failure. The client island `_settings/settings-forms.tsx`
holds the six forms; the fields are plain inputs rather than the RHF shell,
because the schema is the module's contract parsed on the server and restating it
on the client would be a second copy.

### 2.6 The copy and the schema

`src/app/catalog.ts` is at ADR-0007's 1000-line ceiling, so every new surface's
copy is in its own module's catalog — `reports/catalog.ts`, `settings/catalog.ts`,
`dashboard/catalog.ts`, `tenant-management/catalog.ts`, `license/catalog.ts`.
Seventeen Persian literals that first landed in the components were moved out to
them when lint caught them.

`prisma/schema.prisma` added one column — `appointmentSettings`, the «نوبتدهی»
tab's three lifecycle timings as JSON the `appointments` module owns — in
migration `20261007073620_settings_appointment_timings`. The file is still 1000
lines exactly: the column cost 4 lines and four over-long comments were trimmed to
pay for it.

---

## 3. The three tests

The instruction fixed the count at three, and each runs against a real SQLite file
because two of the three are claims a mock would have asserted about itself.

### 3.1 `reports/tests/reports-compute.test.ts` — 7 tests

One tenant, four customers, four cycles, four appointments, seeded so every count
is readable by hand, and each of the seven asserted as the number the rows force:
the return rate is ۱ از ۳, the mean is ۲ sessions, cycles completed ۲ of ۳,
no-shows ۱ of ۳, the drop-off curve falls ۴→۳→۲→۲→۱→۱ across six sessions, the
last-visit buckets split ۱/۱/۰/۱/۱, and the one doctor who saw the cohort holds
every figure. A cohort filter that drifted, a denominator that widened, or a range
end made exclusive when it was inclusive is a number here that no longer matches.

### 3.2 `reports/tests/no-financial-surface.test.ts` — 2 tests

Enumerates the barrel's eleven function exports by name and refuses the ten
financial ones — `revenue`, `price`, `amount`, `payment`, `debit`, `balance`,
`refund`, `deposit`, `money` — and asserts `REPORT_ORDER` is seven with
`REPORT_LABELS` keyed to it and every title and lead non-empty. A `revenue` report
added to the barrel fails the phase's own gate rather than passing unnoticed, and
a report with no label is a key no page can render.

### 3.3 `settings/tests/toggles-enforced.test.ts` — 26 tests

`describe.each` over `TOGGLE_DEFAULTS`'s eight keys — one parametrised suite, not
eight. Per toggle: on resolves, off raises a `DomainError` rather than a
`PermissionError` (§4's own distinction: a toggle is not the matrix), and the
off-state of another tenant's row does not reach the first. Two standalone cases
cover `readToggles` returning all eight with un-sent ones at their documented
default, and the no-row-yet case returning `TOGGLE_DEFAULTS` whole.

---

## 4. The type errors fixed during the phase

Nine, in five places:

- **`admin/settings/page.tsx`** — `MessagesForm` lost its `kindLabels` and
  `channelLabels` props when the two label maps moved to the settings catalog, and
  the page still rendered the form without them. Caught by the build, not by the
  editor.
- **`settings/lib/overrides.ts`** — `@next/next/no-assign-module-variable` forced
  the `module` binding to become `moduleName`, and the rename left one index —
  `parsed[module]` — referring to the old name. Two errors, one cause.
- **`reports/tests/reports-compute.test.ts`** — `instantOf(day: LocalDate)` was
  called with bare strings at eleven sites. The signature widened to `string` with
  `asLocalDate` inside it, which is where the brand belongs: the helper is the
  suite's own seam, and the call sites read better unbranded.
- **The same suite's range end** — `1405-07-31` is not a Jalali date; month 7 has
  30 days. `TO` became `1405-07-30`, and the range comment with it.
- **`settings/lib/write.ts`** — `saveBooking` returned
  `depositRefundPolicy: string | null` where the surface types it as
  `DepositRefundPolicy | null`. A `policyOf` helper narrows through
  `isMember`, so the enum's closed set stays closed at the read.
- **`settings/validation/schema.ts`** — `channel: z.enum(['SMS', 'WHATS_APP'])`
  against `Channel.WhatsApp === 'WHATSAPP'`. The underscore was invented; the
  constant is the authority.
- **`tenant-management/lib/provision.ts`** — the nested `memberships.create` could
  not inherit the parent's `tenantId`, and `lastName ?? null` was written against a
  non-null column. Restructured to create the tenant, then the user with explicit
  ids and `lastName ?? ''`.
- **Three barrels** — `SettingsTab`, `LastVisitBucket` and `LicenseStatus` were
  exported both as value and as type. Each is exported once now: as a value where a
  value is used, type-only otherwise.
- **`reports/catalog.ts` and `settings/catalog.ts`** — `as const` on
  `Object.freeze({...})` is TS1355. Plain object literal plus
  `as const satisfies Record<string, string>` is the shape that both typechecks and
  keeps the literal width lint wants.

A stale Prisma client was underneath two of these — `appointmentSettings` was not
on the model the generated client knew about. `npx prisma generate` before the
second build.

---

## 5. Verification

```
npm run build    →  37 routes, exit 0
npm run verify   →  db:generate · typecheck · lint · check:files · check:i18n
                   check:overrides · check:schema · check:rls · test
                   64 files, 1179 tests, exit 0
```

Lint is clean with zero warnings on the new code, including the Persian-literal
rule that cost the seventeen catalog moves.

**The coverage floors are still red**, and by instruction. The Phase 1 relaxation
holds — global 80 → 60, `core/localization` 100 → 80, `roles-permissions` held at
100 — and the global number sits below even the relaxed floor, as it has since
Phase 3 (`phase-07-report.md` §6 has the figure and the four files with the largest
holes). The phase's own instruction fixed the test count at three and said not to
chase coverage, so the floors are a Phase 11 debt, recorded here rather than
silently absorbed. The number was not re-measured in this session; the three tests
above are the phase's contribution to it.

---

## 6. `prisma/schema.prisma`

1000 lines exactly, still at ADR-0007's ceiling and not past it. One column added,
one migration, four comments trimmed to pay for it. The two conditional modules
added no model: `tenant-management` reads the models Phase 1 made and `license`
its own `LicenseKey`.

---

## 7. DoD 9 — unobserved

The axe and responsive pass over the three pages. **Ninth phase running, same
blocker:** Playwright's pinned Chromium cannot be downloaded on this machine. The
static gates that *are* observable pass — `check:i18n` clean, lint clean with zero
warnings, the tables carrying `<caption>` and `sr-only` headings, the tab bar as
links rather than a form — but none of it has been observed rendering.

---

## 8. What is deferred

- **The two conditional modules shipped with no pages.** `tenant-management` and
  `license` are barrels, reads, writes and catalog copy; there is no
  `admin/tenants` route and no `admin/license` route. The boundary in
  `02-architecture.md` §7 is enforced in `src/core/config/env.ts` — production
  refuses `MULTI_TENANT=false` without a `LICENSE_KEY` — but the operator's
  administration screen and the on-premise key screen are unwritten. This is the
  phase's one real gap, and it is a scope decision rather than an oversight: the
  instruction named three pages and it named them.
- **The axe and responsive pass** over the three pages, §7 above.
- **The coverage floors**, §5 above — restored with `noUncheckedIndexedAccess` in
  Phase 11.
