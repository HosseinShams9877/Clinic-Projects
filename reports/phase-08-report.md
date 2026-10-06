# Phase 08 Report — Public Site

## 1. Phase

**Complete**, started and completed ۱۴۰۵/۰۷/۱۵. Closed in commit `78a8a0e`
(`feat: phase 8 public site`), one commit, no WIP.

Phase 7 closed OQ-2's tables. This phase closes OQ-1 — the six-vs-eight page
count — by building all eight, and it is the last surface before the customer
panel.

---

## 2. What was produced

**One module, eight pages, two Server Actions, two client islands.**

### 2.1 `public-site`

The module `02-architecture.md` §7 names, owning the eight pages' reads and all
their Persian copy. The copy is in the module's own catalog and not in
`src/app/catalog.ts`, because that file is at ADR-0007's 1000-line ceiling —
and `RENDER_IGNORES` allows a module catalog, so the strings are legal where
they are.

The reads take a `tenantId` and not a `TenantContext`, because a visitor holds
no session and no membership. The gallery read is where immutable rule 6 bites:
`isVisible: true` **and** `revokedAt: null` in the `where`, so a page rendering
an unconsented image would have to be a page that reached past the read.

### 2.2 The eight pages

`src/app/(public)/`, contributing no URL segment:

| Page | Section |
|---|---|
| `/` | §30 hero, §31 trust bar, §32 service cards, §33 doctor cards, the gallery |
| `/services` | the catalogue, active services, cheapest first |
| `/service/[id]` | one service, its care sections, its gallery |
| `/booking` | the wizard's shell |
| `/doctors` | the team, with each doctor's services as the subtitle |
| `/about` | the story, the values, the stats |
| `/contact` | the consultation form |
| `/panels` | the two logins |

The root `/` is already the panels' `panels.html`, which is why the eight are a
route group and not eight routes at the root.

### 2.3 The two Server Actions

The booking action and the consultation action. Each resolves the tenant from
the host, opens the scope, calls a module barrel, and hands back a Persian
sentence on failure. Neither runs a business rule of its own — not one
permission check, not one holiday question, not one deposit question — because
the module is where those live and an action that re-implemented one would be
the second implementation that drifts.

### 2.4 The two permission-free module paths

The public site makes two writes, and each goes through the module the desk
uses:

| Write | Module path | The desk's path it mirrors |
|---|---|---|
| a booking | `appointments.bookPublicAppointment` | `bookAppointment` |
| a lead | `customers.createPublicLead` | `createLead` |

Both keep the desk's guards and sentences and replace the staff permission with
the principal the action names. `TenantPrincipal` — a new type in
`@/core/tenant` whose `role` is `Role | 'public'` — is the honest way to say it:
the two permission-free reads (`loadBookableService`, `createOrFindCustomer`)
take the principal and not the membership, and `TenantContext` still satisfies
it, so every staff caller stays valid.

---

## 3. The deposit gate reads the service's own row

The first implementation of toggle 6 checked `args.depositAmount`, the snapshot
a booking captures. The test that caught it passed `0n` — and the gate opened,
because the public site is a caller the clinic did not vet. A gate that trusted
a caller-supplied amount is not a gate.

`bookPublicAppointment` now reads the service row and gates on its
`depositAmount`. The caller's snapshot is still what the row stores; it is just
no longer what the rule reads. The test seeds two services — one with no
deposit, one with 200000n — and the DoD case books the deposit-bearing one.

This is the second phase in a row where a gate was wrong because it read the
caller's copy of a fact the database owns. Phase 7's was the argon2 import
chain; this one is the same shape on a smaller scale, and the fix is the same
one: the rule reads the row.

---

## 4. What was fixed during verification

Thirty-two lint findings and one build failure, all in the new surface:

- **Every Persian literal moved to a catalog.** The two actions' sentences are
  `PUBLIC_FAILURES` in the module's catalog; the wizard's two formatted lines
  are `PUBLIC_BOOKING.formats`; the header's three `aria-label`s are
  `PUBLIC_LAYOUT.aria`. `PERSIAN_LIST_SEPARATOR` joined the localization
  catalog next to `ZWNJ`, because a keyboard's `,` silently replaces it.
- **Two ambient-clock reads.** `new Date()` is banned under `src/`, so the
  footer takes the copyright year as a prop and the wizard takes the day it
  opens on, both from `realClock()` in the server component.
- **One non-async export in a `'use server'` file.** Turbopack rejects it; the
  unused `validatePublicBooking` helper is gone.
- **`titleTemplate` is not a `Metadata` key.** It is a `title` object property,
  and the catalog already had both halves.

No existing test changed its assertions. The three DoD tests are new, and the
appointments and customers changes are additive — two new exports and one
widened type.

---

## 5. `prisma/schema.prisma`

Untouched, still 1000 lines exactly. The phase added no model, no column and no
index: the public site reads what Phases 2 and 3 wrote, and the two gates are
toggles on the settings row that already existed.

---

## 6. Coverage

Not measured, and not a goal. The instruction fixed the test count at three and
said not to chase a number; the three are the three the phase's own deliverable
names, one each, and each is asserted against the database rather than against a
mock because two of the three are `where` clauses and a mock would assert the
mock.

---

## 7. What is deferred

The axe and the responsive pass over the eight pages — the same Chromium blocker
every phase records, seventh phase running. The pages are built to the design
system's tokens and breakpoints and every Persian string is digit-converted, but
neither has been observed rendering.

Two things the phase leaves for the customer panel to pick up:

- **The booking wizard's cycle hint.** The action returns `cycle: null` today.
  The catalog has the sentence; the wiring waits on Phase 9's cycle surface.
- **The consultation form's duplicate-mobile sentence.** `createPublicLead`
  creates a row per submit and does not dedupe, because the desk's dedupe is on
  the customer path and the lead path deliberately does not convert. A repeat
  request from the same number is a second lead the desk sees twice, which is
  the honest behaviour for now and is recorded here so it is a decision and not
  an omission.

---

## 8. Verification summary

```
npm run build    →  32 routes, exit 0
npm run verify   →  db:generate · typecheck · lint · check:files · check:i18n
                   check:overrides · check:schema · check:rls · test
                   60 files, 1141 tests, exit 0
```

Three tests in `src/modules/public-site/tests/public-site.test.ts`, all
asserting against a real SQLite file:

| DoD | The assertion |
|---|---|
| 4 | a booking on a holiday is refused with `appointment.closed` while toggle 7 is off, and no row is written |
| 3 | a booking of a deposit-bearing service is refused with `appointment.depositRequired` while toggle 6 is off, and no row is written |
| 6 | the gallery returns the image once consent is recorded, and returns nothing once the consent is revoked |

---

## 9. What is open

| Question | State |
|---|---|
| OQ-1 — public page count (six vs eight) | **closed by this phase.** All eight are built. The visual check stays open with the Chromium gap. |
| OQ-2 — the two tables damaged by PDF extraction | closed by Phase 7 |
| OQ-3 — the recomputable balance cache | closed by Phase 5 |
| The Chromium and PostgreSQL gap | open, unchanged. SQLite and Node under WSL remain the only environment this gate has ever run in. |

**Phase 8 closed, commit 78a8a0e, verify green at 1141 tests.**
