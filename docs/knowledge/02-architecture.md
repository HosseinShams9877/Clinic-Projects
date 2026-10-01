# 02 — Architecture

> Two decisions live here: **the multi-tenant data boundary** (§1–§5) and
> **the module architecture** (§6–§11). Both are binding.

---

## Part I — Multi-tenant data architecture

### 1. The boundary model

There are exactly two data boundaries, and they are not the same thing.

| Boundary | Meaning | Example |
|---|---|---|
| **`tenantId`** | The **SaaS customer** — the commercial entity that buys the platform. The legal and billing unit. | «کلینیک زیبایی دکتر امیری» as a company |
| **`clinicId`** | A **branch / location within a tenant**. The operational unit. | «شعبه ونک» and «شعبه سعادتآباد» under that company |

Rules:

1. **Every tenant-scoped table carries `tenantId` as a non-nullable column and
   as the leading column of every composite index.**
2. **`clinicId` is nullable and secondary.** A single-branch tenant has one
   clinic and never notices it. A multi-branch tenant filters by it.
3. **`tenantId` is never accepted from the client.** Not in a form field, not
   in a query string, not in a Server Action argument, not in a header.
4. **Access is determined by Membership + Role — never by a client-supplied
   `clinicId` or `tenantId`.**
5. The customer-facing panel is additionally scoped to the **authenticated
   customer's own `customerId`**, which is itself derived from the session.

### 2. Why Membership, not ownership on the user

A user does not "belong to" a tenant. A user *has a membership in* a tenant.

```
User ──< Membership >── Tenant
              │
              ├── role: MANAGER | DOCTOR | SECRETARY
              ├── clinicIds: Clinic[]     (which branches, optional)
              └── overrides: Permission[] (per-user exceptions on the role default)
```

This matters because:

- One person may legitimately work at two clinics that are **different
  tenants** (a visiting doctor). Their identity is one `User`; their access is
  two `Membership` rows with different roles.
- Deactivating a staff member deactivates a **membership**, not a user, so
  their history stays attributable.
- The same person is a `Customer` at one clinic and staff at another. Customer
  and User are separate entities for exactly this reason (`03-data-model.md`).

**The session stores `userId` only.** The active `tenantId` and the role are
resolved server-side on every request from the `Membership` row, and never
trusted from the client. This is the single most important isolation rule in
the system.

### 3. One database, engine-enforced isolation

**Decision: a single PostgreSQL database serves all tenants, and Row-Level
Security enforces isolation at the database engine — not only in application
code.**

Why one database rather than database-per-tenant:

| Approach | Verdict |
|---|---|
| **Shared DB + `tenantId` + RLS** | **Chosen.** One migration path, one connection pool, trivial cross-tenant analytics for the operator, low per-tenant cost. RLS supplies the hard guarantee that the application layer alone cannot. |
| Database per tenant | Rejected: N migration runs, N backups, N connection pools, and the on-premise code path diverges from SaaS. Cost per tenant is the binding constraint at clinic scale. |
| Schema per tenant | Rejected: same migration multiplication, plus a search-path that must be injected per request — a second way to get isolation wrong. |

**Why RLS and not just careful code:** the specification's own warning applies
here — *"access is enforced server-side. Hiding the menu is not access
control."* Application-layer filtering is necessary but is one `where` clause
away from a cross-tenant leak on every new query. RLS makes the database
refuse to return another tenant's rows **even if a query forgets the filter**.

RLS is defence in depth, not a substitute:

- **Layer 1 (application):** every module function takes the resolved
  `tenantId` and filters by it.
- **Layer 2 (engine):** PostgreSQL RLS policies filter on
  `current_setting('app.tenant_id')`.
- Layer 2 catches the bug that Layer 1 will eventually ship.

The tenant context is set **inside the transaction**, so it cannot leak across
a pooled connection:

```sql
SET LOCAL app.tenant_id = '<uuid>';
```

`SET LOCAL` (not `SET`) is mandatory: it is scoped to the transaction and
automatically reverts when the transaction ends, which is what makes it safe
with connection pooling.

Full policy text, the `WITH CHECK` clauses, and the SQLite fallback are in
`09-security.md`.

### 4. Single-tenant mode for on-premise

**Decision: a single environment variable, `MULTI_TENANT=false`, turns the
product into a single-tenant on-premise install — with no schema change, no
migration change, and no branching in application logic.**

What actually changes:

| Concern | `MULTI_TENANT=true` | `MULTI_TENANT=false` |
|---|---|---|
| Schema | identical | identical |
| Migrations | identical | identical |
| Modules | identical | identical |
| Rows | many tenants | exactly one tenant, created by the installer |
| RLS policies | installed and enforcing | installed and enforcing |
| Tenant resolution | from `Membership` | from `Membership` — which resolves to the single tenant |
| Tenant switcher UI | shown | hidden |
| `tenant-management` module | active | dormant (not routed) |
| `license` module | dormant | active (license key required) |

**The mechanism is deliberately boring.** In single-tenant mode the installer
seeds one `Tenant` row and one `Membership` per user. Every code path is then
identical; the effective tenant is simply always the same one. There is one
`getTenantContext()` function, and it does not branch on the flag for
correctness — the flag only controls whether the switcher and the
tenant-management routes are reachable.

This is what makes the promise — *same codebase, same schema, same
migrations* — literally true rather than aspirational. There is no second
code path that can rot from disuse.

Full delivery procedure: `setup/single-tenant.md`.

### 5. Migration paths

**Single-tenant (on-premise) → multi-tenant (SaaS)**

1. Provision the tenant in the SaaS control plane → allocate `tenantId`.
2. Dump the on-premise database.
3. Rewrite every row's `tenantId` from the seeded value to the allocated one.
   **This is the entire data transformation** — no schema change, because the
   on-premise install already used the multi-tenant schema.
4. Import. Rebuild indexes. Re-run `VACUUM ANALYZE`.
5. Re-point user memberships at the new tenant.
6. Flip `MULTI_TENANT=true`.

Estimated duration: the export/import dominates; the rewrite is one `UPDATE`
per table. The reason this is cheap is that §4 chose to keep the tenant column
present even when it is constant.

**Multi-tenant (SaaS) → single-tenant (on-premise)**

1. Provision the on-premise instance; run migrations.
2. Export **one tenant's** rows (`WHERE tenantId = ?` on every table, in FK
   order).
3. Import into the fresh instance with the local seeded `tenantId`.
4. Seed the license key; flip `MULTI_TENANT=false`.
5. Verify row counts per table against the export manifest.

**The trade-off being accepted:** carrying `tenantId` in a single-tenant
install costs one column on every table and one predicate on every query. In
exchange, both directions of migration become a data copy rather than a schema
rewrite, and one code path serves both products. That is the right trade at
this scale.

---

## Part II — Module architecture

### 6. Repository shape

```
src/
  core/                     shared, domain-free
    components/             Button, Card, Table, Badge, Modal, …
    hooks/
    lib/                    digits, dates (Jalali), formatters, normalize
    types/
    config/
    localization/           Persian digits, Jalali calendar, RTL helpers
  modules/                  one folder per domain module
    <module>/
      components/
      lib/
      validation/
      types/
      hooks/
      api/
      tests/
      index.ts              ← the ONLY public surface
  app/                      Next.js App Router — thin routing only
  worker/                   the background worker process
prisma/
  schema.prisma
  migrations/
```

**`src/app/` contains routing and composition — never business logic.** A page
file resolves the tenant context, checks permission via the module, calls one
module function, and renders module components. If a page file grows logic,
that logic belongs in the module.

### 7. Module list and responsibilities

Twenty modules. Every one is required; none is optional.

| Module | Owns |
|---|---|
| `auth` | Login (manager/staff by password, customer by mobile + OTP), sessions, logout, OTP issuance, password reset. |
| `dashboard` | The role-scoped home surface: مدیر «داشبورد من», پزشک «برنامه من», منشی «میز کار امروز», مشتری dashboard. Composes other modules; owns no entities. |
| `appointments` | The Appointment entity, the **8-state lifecycle**, the three booking modes, slot generation, slot blocks (بستن یک ساعت / یک روز), the three-step booking popup, reschedule/cancel. |
| `customers` | The Customer entity, the **lead lifecycle**, mobile-as-unique-key dedupe, the customer profile, medical notes, before/after consent, tags. |
| `cycles` | The treatment-cycle engine: cycle creation on «انجام شد», next-due computation, cycle states, drop-out detection, abandonment reasons. |
| `campaigns` | The **8 campaign types**, campaign CRUD, audience + text + schedule, dispatch orchestration, recurring campaigns, attribution of resulting appointments. |
| `campaign-assistant` | Persian free-text request → proposed audience group + message text + schedule. Human approval gate. **No medical-data access.** |
| `audience-groups` | The **8 ready-made groups** as saved queries, the nightly refresh job, ad-hoc group building, live counts. |
| `notifications` | The **7 automatic messages**: triggers, timing, the per-customer delivery ledger, consent enforcement, and the "today's reminders" feed. Owns *when* and *to whom*. |
| `messages` | The message catalog: templates with variables, channel config (SMS / WhatsApp), send windows, daily caps, gateway adapter, raw send log. Owns *what text* and *transport*. |
| `services` | The Service entity — the single source of truth for price and duration. Sessions count + interval defaults, deposit, activation/deactivation, site copy, before/after care text, per-service doctor assignment. |
| `staff` | User + Membership administration, invitations, password resets, staff status, **leave requests** (doctor submits → manager approves). |
| `roles-permissions` | The **16×3 matrix**, the manager column lock, per-user overrides, the 8 behavioral toggles, and the server-side `can()` enforcement primitive. |
| `debts` | The balance view: the 4 buckets, balance computation, debt follow-up, due-date reschedule, debt reminder scheduling. **Read + follow-up only — never deletes.** |
| `payments` | Recording money received and discounts, per-appointment payment records, deposit capture, refund policy on cancellation. The only writer of financial facts. |
| `reports` | Retention reports: return rate, average sessions, cycle completion, no-show rate, drop-off curve, last-visit distribution, doctor comparison. **No financial reports.** |
| `settings` | Clinic identity, booking mode, working hours/shifts/holidays, cycle defaults, message text and channels, the 8 toggles, appointment lifecycle timings. |
| `public-site` | The 8 public pages, service/doctor presentation, the consultation form, the public booking wizard shell, lead capture with source attribution. |
| `tenant-management` | Tenants, clinics/branches, memberships, tenant provisioning and suspension. Active only when `MULTI_TENANT=true`. |
| `license` | License key issuance/validation/expiry for on-premise installs. Active only when `MULTI_TENANT=false`. |

### 8. Separation rationale for the four easily-confused modules

| Pair | The line |
|---|---|
| `notifications` vs `messages` | `notifications` is the **trigger engine** (a cycle became due → queue a reminder, honouring consent and caps). `messages` is the **content and transport layer** (the template text, the gateway, the log). A campaign and an automatic message both send *through* `messages`. |
| `campaigns` vs `campaign-assistant` | `campaigns` holds the campaign and dispatches it. `campaign-assistant` only *proposes*; it never sends, and its field allow-list excludes all medical data. |
| `audience-groups` vs `customers` | `customers` owns customer records. `audience-groups` owns **queries over** them — a group is a saved predicate re-evaluated nightly, per the spec's decision that a group is a query and not a stored list. |
| `debts` vs `payments` | `payments` writes facts. `debts` reads them and derives a balance. Nothing in `debts` can create, alter, or delete a payment — which is how "debt deletion does not exist" is structurally guaranteed rather than merely promised. |

### 9. Page → module mapping (all 35 pages, none unmapped)

**Public site — 8**

| Page | Module(s) |
|---|---|
| `index.html` | `public-site` |
| `services.html` | `public-site` (reads `services`) |
| `service-detail.html` | `public-site` (reads `services`, `staff`) |
| `booking.html` | `public-site` → `appointments` |
| `doctors.html` | `public-site` (reads `staff`) |
| `about.html` | `public-site` |
| `contact.html` | `public-site` → `customers` (lead) |
| `panels.html` | `public-site` → `auth` |

**Customer panel — 6**

| Page | Module(s) |
|---|---|
| `account/login.html` | `auth` |
| `account/dashboard.html` | `dashboard` |
| `account/appointments.html` | `appointments` |
| `account/care.html` | `services` (care text) surfaced via `dashboard` |
| `account/payments.html` | `payments` → `debts` (balance) |
| `account/profile.html` | `customers` + `notifications` (consent) |

**Manager panel — 11**

| Page | Module(s) |
|---|---|
| `admin/dashboard.html` | `dashboard` |
| `admin/appointments.html` | `appointments` (read-only) |
| `admin/customers.html` | `customers` → `audience-groups` |
| `admin/customer.html` | `customers` (+ `cycles`, `payments`, `debts`, `messages`) |
| `admin/debts.html` | `debts` (read-only) |
| `admin/cycles.html` | `cycles` (read-only) |
| `admin/campaigns.html` | `campaigns` + `campaign-assistant` + `audience-groups` |
| `admin/services.html` | `services` |
| `admin/staff.html` | `staff` + `roles-permissions` |
| `admin/reports.html` | `reports` |
| `admin/settings.html` | `settings` (+ `messages`, `roles-permissions`, `cycles`) |

**Doctor panel — 4**

| Page | Module(s) |
|---|---|
| `doctor/dashboard.html` | `dashboard` (+ `staff` for leave requests) |
| `doctor/customers.html` | `customers` + `cycles` |
| `doctor/cycles.html` | `cycles` (read-only) |
| `doctor/debts.html` | `debts` (optional, manager-granted) |

**Reception panel — 6**

| Page | Module(s) |
|---|---|
| `reception/desk.html` | `dashboard` + `notifications` |
| `reception/appointments.html` | `appointments` |
| `reception/cycles.html` | `cycles` + `notifications` |
| `reception/debts.html` | `debts` + `payments` |
| `reception/leads.html` | `customers` (lead lifecycle) |
| `reception/customers.html` | `customers` |

**Coverage check:** 8 + 6 + 11 + 4 + 6 = 35. Every page maps. No module in §7
is unreferenced.

**Note on `notifications`:** it is mapped on three surfaces —
`reception/desk.html` (today's reminders), `reception/cycles.html` (contact
results), and `account/profile.html` (consent) — plus every one of the seven
automatic messages. It also owns the `settings` "پیامها" tab alongside
`messages`. It is not optional and has no substitute.

**Note on leads:** a Lead is not a separate entity. The specification states
that when a lead books, it *becomes* a customer and its acquisition source is
preserved on the record. It is therefore **one entity with a lifecycle**, owned
by `customers`; `reception/leads.html` is a filtered cartable view of it. This
follows the same reasoning the spec used when it rejected a stored audience
list in favour of a query.

### 10. Import rules

1. **No cross-module deep imports.** `src/modules/a` may import
   `src/modules/b` **only** via `@/modules/b` (its `index.ts`). Importing
   `@/modules/b/lib/internal-thing` is forbidden.
2. Every module exports a **barrel** `index.ts` that is its complete public
   surface. If something is not in the barrel, it is private.
3. `core` may not import from `modules`. `modules` may import from `core`.
   `app` may import from both. `worker` may import from both.
4. **No file exceeds 1000 lines.** When a file approaches the limit, split by
   responsibility, not arbitrarily.
5. Module names are **English**. All UI strings are **Persian**.
6. Enforcement: an ESLint `no-restricted-imports` rule with per-module patterns
   plus CI check for file length. Both are wired in Phase 1.

### 11. Request lifecycle

```
Request
  → middleware.ts            session cookie present? else redirect to login
  → resolveSession()         userId from the signed session
  → getTenantContext()       membership → { tenantId, clinicId, role, overrides }
  → module function          can(role, permission, overrides) → throw if denied
  → prisma transaction
        SET LOCAL app.tenant_id = ...
        query (RLS active)
  → render / return
```

Two properties this guarantees:

- **Authorisation happens at the module layer**, so the worker, Server Actions,
  and Server Components all pass through the same check. There is no path that
  reads data without a permission decision.
- **Tenant context is resolved, never received.** A forged `clinicId` in a
  request body changes nothing, because nothing reads it.

### 12. The worker

`src/worker/` is a separate process, started by `npm run worker`, importing the
same modules as the web tier.

| Job | Cadence | Module |
|---|---|---|
| Audience group refresh | nightly | `audience-groups` |
| Cycle next-due sweep | hourly | `cycles` |
| Automatic message dispatch | every few minutes | `notifications` + `messages` |
| Campaign dispatch (recurring + scheduled) | every few minutes | `campaigns` |
| Appointment lifecycle transitions | every few minutes | `appointments` |
| Balance/due reminders | daily | `debts` |

Mechanism: a **database-backed job table with claim semantics** — no external
broker, because on-premise must install with nothing beyond PostgreSQL. The
worker resolves a tenant per job explicitly and sets `app.tenant_id` the same
way the web tier does.

---

*Related: `01-tech-stack.md` (why one deployable plus a worker),
`03-data-model.md` (the entities and indexes), `09-security.md` (RLS policies
and the SQLite fallback), `roadmap/decisions.md` (ADR-0003 … ADR-0006).*
