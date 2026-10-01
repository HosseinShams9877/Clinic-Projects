# سامانه مدیریت کلینیک زیبایی

A multi-tenant SaaS platform for Persian beauty and skin clinics — appointments,
treatment cycles, debts, campaigns, and the customers behind all of them.

---

## 1. What this is

A clinic management platform built around one idea: **a treatment cycle is not a
calendar entry**.

A customer buys six laser sessions at four-week intervals. A calendar records
each appointment and forgets her between them. This platform knows session four
is due, notices when she does not book it, puts her in front of the secretary
with the context of the last conversation, and records what happened. The
specification's own framing: this mechanism is what separates the platform from
an appointment book.

Around that sit the things a clinic actually runs on — a work list that replaces
the performance report, a debt view that cannot lose money, a campaign builder a
manager can drive with a Persian sentence, and a customer panel where patients
book their own next session.

**The interface is Persian.** Right-to-left, Vazirmatn, Persian digits, the
Jalali calendar, and weeks that start on شنبه. There is no language switcher,
because there is no second language.

---

## 2. Status

**Phase 0 — Foundation and architecture — is complete.**

The repository currently contains **documentation only**: the knowledge layer, the
roadmap, the architectural decisions, the setup guides, and this README. There is
no `package.json`, no `src/`, no database schema, and no test. That is the
intended state — Phase 0 produces the specification *for* the codebase, and
writing code before the decisions were made was explicitly out of scope.

Implementation begins at Phase 1. See [`docs/roadmap/phases.md`](docs/roadmap/phases.md).

---

## 3. Who uses it

| Role | Persian | Surface |
|---|---|---|
| Manager | مدیر | 11 pages — services, prices, staff, permissions, campaigns, reports |
| Doctor | پزشک | 4 pages — their own schedule, their own patients' records and cycles |
| Secretary | منشی | 6 pages — the work list, arrivals, results, booking, cycle contacts, debts |
| Customer | مشتری | 6 panel pages plus 8 public pages |

The manager, doctor and secretary are staff of a tenant. The customer is a
separate, narrowly-scoped identity that can only ever see their own data.

---

## 4. Key features

- **Treatment cycles** — a course of sessions with an interval read from the cycle, not the service; automatic due detection; a drop-out contact list; abandonment with a reason.
- **The work list** — «میز کار امروز»: the day's appointments, unrecorded results, arrivals, cycle contacts, due debts and new leads in one place. Empty at the end of the day means no customer was lost.
- **The 8-state appointment lifecycle** — from booking through automatic transitions to `AWAITING_ARRIVAL` and `RESULT_NOT_RECORDED`, to completion, no-show and cancellation.
- **Payments and debts** — deposit capture at booking, per-appointment payment records, discounts with the name of who granted them, a computed balance, and four debt buckets.
- **7 automatic messages** — confirmation, reminder, deposit, cycle due, return, thank-you, and a birthday message, with consent enforcement, a 90-day duplicate window and a one-per-day cap.
- **8 campaign types** over **8 audience groups**, with a Persian free-text assistant that proposes and never sends.
- **Server-side permissions** — 16 permissions across 3 roles, plus per-user overrides and 8 behavioral toggles. Hiding a menu is not access control.
- **The public site** — service and doctor presentation, a three-step booking popup, and lead capture with source attribution.

---

## 5. Technology stack

| Layer | Choice |
|---|---|
| Framework | **Next.js** (App Router), TypeScript `strict` |
| Rendering | Server Components, Server Actions, Route Handlers |
| Database | **PostgreSQL** in production, **SQLite** in development, one Prisma schema |
| ORM | **Prisma** |
| Isolation | Application-layer tenant filtering **plus** PostgreSQL row-level security |
| Validation | **Zod**, at every trust boundary |
| Styling | **CSS Modules** with a global CSS-variable token block |
| Font | **Vazirmatn**, self-hosted — no CDN, works offline |
| Tests | **Vitest** (unit, integration) and **Playwright** (e2e, accessibility) |
| Worker | A separate **Node.js process** — not a separate codebase |

The full comparison behind this choice, across twelve dimensions, is in
[`docs/knowledge/01-tech-stack.md`](docs/knowledge/01-tech-stack.md) — including
where the rejected alternative would have won.

---

## 6. Architecture

```
Web tier  ──┐
            ├── same modules, same schema, same migrations
Worker    ──┘

Request
  → middleware.ts        session cookie
  → resolveSession()     userId
  → getTenantContext()   membership → { tenantId, clinicId, role, overrides }
  → module function      can(role, permission) → throw if denied
  → prisma transaction   set_config('app.tenant_id', …, true) → RLS active
  → render
```

Two properties this guarantees:

- **Authorisation happens at the module layer**, so the worker, Server Actions
  and Server Components all pass through the same check. There is no path that
  reads data without a permission decision.
- **Tenant context is resolved, never received.** A forged `tenantId` in a request
  body changes nothing, because nothing reads it.

**20 modules** under `src/modules/`, each with the same internal contract and
imported only through its barrel. `src/app/` is thin routing. No file exceeds
1000 lines.

Full detail: [`docs/knowledge/02-architecture.md`](docs/knowledge/02-architecture.md).

---

## 7. Project structure

```
clinic/
├── docs/
│   ├── knowledge/          the specification for the codebase (00–10)
│   ├── roadmap/            phases.md · progress.md · decisions.md
│   ├── setup/              installation · deployment · single-tenant ·
│   │                       licensing · database-migration
│   └── changelog/          the changelog convention
├── reports/                per-phase reports, and this project's open questions
├── .claude/                settings, agents, commands, context, memory
├── .env.example
├── .gitignore
├── LICENSE.md
└── README.md

— created in Phase 1 —
├── src/
│   ├── app/                thin routing only
│   ├── core/               localization, money, tenant context, permissions
│   ├── modules/            20 feature modules
│   └── worker/             the background process
├── prisma/                 schema and migrations
└── e2e/                    Playwright specs
```

---

## 8. Prerequisites

- **Node.js** 20 LTS or 22 LTS
- **PostgreSQL** 15 or 16 — for production, for CI, and for the isolation tests
- **npm** 10+

**Nothing else.** No Docker, no Redis, no message broker, no CDN. The design
requires nothing beyond Node and PostgreSQL so that an on-premise install is
something a clinic's IT can complete.

---

## 9. Installation

```bash
git clone <repository> clinic
cd clinic
npm install
cp .env.example .env          # then fill in the values
npm run db:migrate            # SQLite for development
npm run db:seed               # two tenants, synthetic Persian data
npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal — not optional
```

The worker must run. Without it, cycles never become due, reminders are never
sent, and campaigns never dispatch — and the product looks like it is working.

Full instructions, including the production path:
[`docs/setup/installation.md`](docs/setup/installation.md).

---

## 10. Running

| Command | What it does |
|---|---|
| `npm run dev` | The web tier, with hot reload |
| `npm run worker` | The background worker |
| `npm run build` | A production build |
| `npm run start` | The production web tier |
| `npm run db:studio` | Browse the development database |

**Two processes, always.** They scale independently, and the design is safe with
more than one of each.

---

## 11. Testing

```bash
npm run verify        # everything below, as CI runs it
npm run typecheck
npm run lint
npm run test          # Vitest — unit and integration
npm run test:coverage # with the enforced thresholds
npm run test:e2e      # Playwright — the four specification scenarios
npm run test:a11y     # accessibility across every page
npm run test:i18n     # no Latin digits, no Gregorian dates, no missing label
npm run test:isolation # cross-tenant — PostgreSQL only, RLS live
```

**The permission matrix is the spine of the test suite:** 16 permissions × 3 roles
× a positive and a negative test each. A permission with no negative test is
treated as unverified.

**The cross-tenant suite runs on PostgreSQL**, because SQLite has no row-level
security to test. That asymmetry is deliberate, and it is why production is not
SQLite.

Full strategy: [`docs/knowledge/10-testing-strategy.md`](docs/knowledge/10-testing-strategy.md).

---

## 12. Documentation

Start at [`docs/knowledge/00-overview.md`](docs/knowledge/00-overview.md).

| Document | Read it when |
|---|---|
| [`00-overview.md`](docs/knowledge/00-overview.md) | First |
| [`01-tech-stack.md`](docs/knowledge/01-tech-stack.md) | Questioning the stack, or adding a dependency |
| [`02-architecture.md`](docs/knowledge/02-architecture.md) | Creating a module, a page, or a cross-boundary import |
| [`03-data-model.md`](docs/knowledge/03-data-model.md) | Adding an entity, a column, or an index |
| [`04-roles-permissions.md`](docs/knowledge/04-roles-permissions.md) | Writing any authorisation check |
| [`05-conventions.md`](docs/knowledge/05-conventions.md) | Writing any code — keep this one open |
| [`06-constants.md`](docs/knowledge/06-constants.md) | Hard-coding a number, a label, or a closed set |
| [`07-localization.md`](docs/knowledge/07-localization.md) | Rendering a date, a number, or a currency |
| [`08-ui-design-system.md`](docs/knowledge/08-ui-design-system.md) | Writing any style — binding |
| [`09-security.md`](docs/knowledge/09-security.md) | Touching tenancy, sessions, or customer data |
| [`10-testing-strategy.md`](docs/knowledge/10-testing-strategy.md) | Declaring a phase done |
| [`docs/roadmap/`](docs/roadmap/phases.md) | Knowing what is built, and what is next |
| [`reports/`](reports/README.md) | Reading this phase's findings and open questions |

---

## 13. License

**Proprietary.** All rights reserved. See [`LICENSE.md`](LICENSE.md).

No part of this software may be copied, modified, distributed, sublicensed, or
used to create a derivative work without prior written permission from the
copyright holder.

---

*Phase 0 complete. Three open questions are recorded in
[`reports/phase-00-report.md`](reports/phase-00-report.md); none blocks Phase 1.*
