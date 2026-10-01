# Setup — Installation

> Getting a development environment running, and getting a clean machine to a
> working login page. This document describes the **target state** at the end of
> Phase 1; where a step depends on code that does not exist yet, it is marked.
>
> For a production install, read `deployment.md`. For an on-premise single-tenant
> install, read `single-tenant.md` first.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 20 LTS or 22 LTS (pinned in `.nvmrc`) | The runtime for the web tier and the worker |
| **npm** | 10+ | Comes with Node |
| **Git** | any recent | Version control |
| **PostgreSQL** | 15 or 16 | Production database; also needed in CI and for the isolation tests |
| **SQLite** | none — bundled | The development database needs no install |

**You do not need** Docker, Redis, RabbitMQ, or any external broker. The design
requires nothing beyond Node and PostgreSQL (ADR-0006), and development requires
nothing beyond Node.

**Fonts.** Vazirmatn is self-hosted and committed to the repository
(`07-localization.md` §2). No network access is needed to render the product
correctly, at any point, including first run.

---

## 2. Get the code

```bash
git clone <repository>  clinic
cd clinic
```

The repository is currently **local only** — no remote is configured and nothing
is pushed (ADR-0001, `05-conventions.md` §13). Replace `<repository>` with the
path or URL your team uses, once one exists.

---

## 3. Install dependencies

```bash
npm install
```

Dependencies are pinned to **exact versions**, with no `^` or `~`
(`01-tech-stack.md` §7). A lockfile change is a deliberate commit, never a side
effect of an install.

---

## 4. Environment

```bash
cp .env.example .env
```

`.env` is gitignored and must never be committed. `.env.example` is the
authoritative list of variables; the table below explains each.

| Variable | Development | Production | Notes |
|---|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | — | SQLite in development |
| `DATABASE_URL_PRODUCTION` | — | `postgresql://…` | PostgreSQL, with RLS |
| `MULTI_TENANT` | `true` | `true` or `false` | Gates UI reachability only (ADR-0004) |
| `NEXTAUTH_SECRET` | any 32+ char string | a generated secret | Signs the session |
| `SMS_PROVIDER_KEY` | a sandbox key | the live key | The SMS gateway |
| `PAYMENT_PROVIDER_KEY` | a sandbox key | the live key | The payment gateway |
| `LICENSE_KEY` | empty | the issued key when `MULTI_TENANT=false` | On-premise only |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Environment variables are parsed once at startup** by a Zod schema, not read ad
hoc (`05-conventions.md` §5). A missing or malformed variable fails the boot with
a named error, rather than failing later at the point of use.

**Never commit** `.env`, `.env.local`, `.env.production`, or any `.env.*` other
than `.env.example`. `.gitignore` covers them; a commit that adds one is a defect
to be reverted, not amended (`05-conventions.md` §13).

---

## 5. Database — development (SQLite)

```bash
npm run db:generate     # generate the Prisma client
npm run db:migrate      # apply migrations to dev.db
npm run db:seed         # the development dataset
```

The seed creates:

- **Two tenants**, so tenant isolation is testable from the first run — with
  **the same mobile number in both**, which is the fixture that catches the most
  common isolation bug (`10-testing-strategy.md` §13).
- One manager, two doctors and two secretaries per tenant, with the permission
  overrides from `04-roles-permissions.md` §2.2.
- Services with and without a session count, customers across every audience
  group, appointments in all eight states, debts in all four buckets.
- **Persian names, Persian service names and realistic mobiles**, so that RTL
  and Persian-digit defects surface in development rather than in a clinic.

**No real clinic data is ever used in development** (`09-security.md` §5). This
is a policy, not a preference.

### The SQLite caveat

SQLite has no row-level security. In development, **only the application-layer
tenant filter is active** (ADR-0003, `09-security.md` §5). The four mitigations
are described there. The practical consequence for a developer: **the tenant
isolation test suite must be run against PostgreSQL before any merge**, and CI
does so automatically.

---

## 6. Database — production (PostgreSQL)

```bash
createdb clinic_dev
export DATABASE_URL="postgresql://user:pass@localhost:5432/clinic_dev"
npm run db:migrate:pg
```

Migrations for PostgreSQL include the RLS policies, the `FORCE ROW LEVEL
SECURITY` statements, and the tenant-context function
(`09-security.md` §4). See `database-migration.md` for the full path.

To run the isolation tests locally, point `DATABASE_URL` at a PostgreSQL database
and run:

```bash
npm run test:isolation
```

---

## 7. Run it

Two processes. Both are needed for the product to behave correctly.

```bash
npm run dev       # the web tier — http://localhost:3000
npm run worker    # the background worker (ADR-0002)
```

The worker is **not optional**. Without it, cycles do not become due, reminders
are not sent, campaigns do not dispatch, and audience counts do not refresh. A
development session that only runs `npm run dev` will look correct and quietly
not do the product's central job.

---

## 8. Checks before you commit

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint, including the import-boundary rule
npm run test          # Vitest
npm run test:coverage # with the thresholds from 10-testing-strategy.md §11
npm run test:e2e      # Playwright
npm run check:files   # no file over 1000 lines
npm run check:i18n    # no Latin digits, no Gregorian dates, no missing label
npm run check:a11y    # axe on the rendered pages
```

`npm run verify` runs all of them, and is what CI runs.

**A pre-commit hook runs typecheck, lint and the file-length check.** It does not
run the full suite — that is CI's job — but it does block the two failure classes
that are cheapest to fix immediately and most annoying to find later.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Boot fails with a named env error | A required variable is missing or malformed | Compare `.env` against `.env.example` |
| `Prisma client not generated` | Dependencies installed without the postinstall step | `npm run db:generate` |
| Pages render left-to-right | The document root lost `dir="rtl"` | Check the root layout; this is a defect, not a configuration |
| Dates look Gregorian | A component formatted a date instead of using the catalog | See `05-conventions.md` §8 — this is a finding |
| Numbers show Latin digits | A value bypassed the display primitive | See `07-localization.md` §4 |
| The worker claims nothing | No job rows, or the claim timeout has not elapsed | Check the `Job` table; a killed worker's jobs recover after the timeout |
| Texts render in a fallback font | Vazirmatn was not committed, or `next/font/local` points elsewhere | Check the font files are present in the repository |
| A cross-tenant test fails on PostgreSQL only | An RLS policy is missing for a table | Every tenant-scoped table needs a policy (ADR-0003) |

**If a Persian numeral appears in the database, the URL, a log, or an API
payload**, that is a defect, not a display preference. Storage is Latin digits;
only the render boundary converts.

---

## 10. What a clean install must produce

The Phase 11 acceptance criterion for installation. On a machine that has never
run this project:

1. `npm install` completes with no error.
2. `cp .env.example .env` and the generated secret produce a valid configuration.
3. `npm run db:migrate` and `npm run db:seed` complete.
4. `npm run dev` and `npm run worker` both start.
5. `http://localhost:3000` shows a **Persian, right-to-left login page** in
   Vazirmatn, with Persian digits.
6. A seeded manager can log in and reaches a manager shell whose navigation
   matches the role.
7. The login page renders correctly **with the network disconnected** — the font
   is local, and nothing is fetched from an external host.

If any of these fails, installation is broken, regardless of what the test suite
says.

---

*Related: `deployment.md` (production), `single-tenant.md` (on-premise),
`database-migration.md` (the SQLite→PostgreSQL path),
`../knowledge/09-security.md` (the development caveat).*
