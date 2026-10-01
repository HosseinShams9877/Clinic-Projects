# 02 — Architecture

> Three decisions live here: **the multi-tenant data boundary** (§1–§5),
> **the module architecture** (§6–§12), and **the module override mechanism**
> (§13). All are binding.

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
SELECT set_config('app.tenant_id', $1, true);
```

**`set_config(..., true)`, never `SET LOCAL`.** The third argument scopes the
setting to the transaction, which is what makes it safe with connection pooling.
The reason it is a function call rather than a statement is decisive: `SET LOCAL`
**cannot take a bind parameter**, so using it would mean interpolating the tenant
id into SQL text — reintroducing exactly the injection surface this design
exists to remove. `set_config` is an ordinary function, so the value binds as a
parameter.

Under `MULTI_TENANT=false` the same call is made with the single seeded tenant.
There is no second code path.

Full policy text, the `WITH CHECK` clauses, and the SQLite fallback are in
`09-security.md` §4.

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
        set_config('app.tenant_id', $1, true)
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

### 13. Module override mechanism

**The problem.** Modules are global — every tenant runs the same code. That is
correct for almost every tenant, and it is what makes one release train, one
migration path and one test suite possible. But a module is also the unit a
customer eventually asks to change: a clinic group with its own reporting
standard wants a different `dashboard`; a clinic with an unusual booking policy
wants a different `appointments` entry screen. The two obvious answers are both
wrong:

- **Fork the codebase per tenant.** Every later fix must be applied N times, and
  every fork drifts. The maintenance cost grows with the customer count, which is
  the opposite of what a SaaS is supposed to do. Rejected in ADR-0019.
- **Add a feature flag for every variation.** A flag can toggle behaviour that
  already exists. It cannot change a module's *structure* — its screens, its
  queries, its composition. A dashboard behind 30 flags is still one dashboard.

The mechanism below is the third answer: **substitution, declared as data, with
the default retained as the fallback.**

#### 13.1 The design

1. **Modules stay global.** `src/modules/<name>` remains the default
   implementation of every module, and remains the only implementation that
   exists in the repository's own tree for the 20 modules in §7.
2. **A tenant may declare an override for a specific module.** The declaration
   names one module and points at one override implementation.
3. **The core resolves which implementation to load.** Resolution happens at the
   module boundary, once per request, from the resolved tenant context — never
   from anything the client sends.
4. **The default is always the fallback.** An override that is absent, invalid,
   failing its validation, or disabled resolves to the default module. There is
   no state in which a module has *no* implementation.

#### 13.2 Where overrides are declared

**In the tenant's settings row, in the database.** Concretely, the tenant's
settings record carries an overrides map — a `String` column holding JSON,
parsed through a Zod schema on read, exactly as `03-data-model.md` §5 requires
for every JSON-shaped column on both engines:

```jsonc
{
  "dashboard": { "implementation": "clinic-group-a", "version": "1.0.0" }
}
```

Three prohibitions, each for a different reason:

| Never | Why |
|---|---|
| **In code** — a `switch` on the tenant slug | The tenant list then lives in the repository, so onboarding a customer is a code change and a deploy. It also puts a customer's identity in the build artefact. |
| **In an environment variable** | Environment is per *process*, not per tenant. One process serves all tenants, so an env var cannot express "tenant A overrides `dashboard` and tenant B does not" — and in single-tenant mode it would make the on-premise install's behaviour depend on a file the installer edits by hand rather than on data the product manages. |
| **From the client** — a header, a query string, a cookie | It would let a caller select its own implementation. Same rule as `tenantId` (§1 rule 3): the override is part of the tenant's identity and is therefore resolved, never received. |

Because the declaration is a row, it is covered by the same RLS policy as every
other tenant-scoped table (`09-security.md` §4.1) and cannot be read or written
across tenants.

#### 13.3 How the core resolves an override at load time

Resolution is a **registry lookup**, not dynamic execution:

```
request
  → resolveSession()            userId
  → getTenantContext()          { tenantId, clinicId, role, overrides }
  → resolveModule('dashboard', ctx)      ← the only place an override is chosen
        override declared?  ── no ──→  the default implementation
                │ yes
        registered + validated?  ── no ──→  the default, and an incident is recorded
                │ yes
        enabled for this tenant? ── no ──→  the default
                │ yes
        the registered override implementation
```

The properties that matter:

- **It is synchronous and total.** `resolveModule` always returns an
  implementation. It has no failure mode in which a page renders nothing.
- **It is a lookup in a static registry, never a dynamic import by path.**
  The registry is a module built at build time, mapping
  `(module, implementation) → the module's barrel`. A database row can therefore
  only ever select a **name that exists in the build**; it can never cause the
  process to load code that was not compiled, signed and tested as part of this
  release. This is the difference between configuration and code injection, and
  it is the whole reason the mechanism is safe (ADR-0019).
- **Resolution happens at the module boundary, next to the permission check.**
  Not in a page, not in a component. Every caller — Server Component, Server
  Action, Route Handler, worker job — goes through the same resolver, so there is
  no path that reaches an implementation the tenant did not declare.
- **The resolved implementation is called through the same interface as the
  default.** An override replaces a module's public surface; it does not add a
  parallel one. Callers import `@/modules/dashboard` and never learn which
  implementation ran.
- **Resolution is per request, not cached across tenants.** A
  process-lifetime cache keyed by module name alone would serve tenant A's
  override to tenant B. Any cache is keyed by `(tenantId, module)` and
  invalidated when the tenant's settings row changes.

#### 13.4 How the default remains the fallback

The default module is the **floor**, in four specific situations:

| Situation | Result |
|---|---|
| No override declared | The default runs. This is the state of every tenant at onboarding. |
| An override is declared but not present in the build's registry | The default runs, and the mismatch is recorded as an incident — a settings row naming an implementation this release does not contain is an operational error, not a tenant-facing one. |
| An override fails the contract validation of §13.5 | The default runs; the override is marked invalid and is not attempted again until it changes. |
| An override throws at runtime | The failure is contained: the tenant is served by the default, the override is disabled, and the tenant is notified (§13.6). A broken override must not be able to take the platform down (ADR-0019). |

**The default implementation is never removed and never becomes dead code.** It
is the implementation every tenant uses, so it stays exercised by the full test
suite and by the default path in production — which is what keeps it from rotting
the way a "legacy" branch does.

#### 13.5 What an override must satisfy

An override is a **module**, held to the same contract as the default. The
naming, location, declaration and validation rules are in `05-conventions.md`
§15; the security constraints are in `09-security.md` §18. The architectural
requirements are:

1. **It exports the same public surface** as the module it replaces — the same
   names, the same types, the same error behaviour. TypeScript enforces this:
   the override is typed as the module's public interface, so a missing or
   mismatched export is a compile error rather than a runtime surprise.
2. **It obeys every rule in this document.** Barrel-only imports (§10), the
   1000-line limit (§10 rule 4), no business logic in `src/app/`, tenant context
   resolved server-side (§1), permissions enforced in the module (§11).
3. **It passes the same tests as the default.** The permission matrix, the
   cross-tenant isolation suite, and the module's own unit tests run against
   every registered override. An override that is not in the test matrix is
   unverified, and an unverified override is a cross-tenant leak waiting for its
   first request.

#### 13.6 Coexistence with single-tenant mode

**`MULTI_TENANT=false` changes nothing about this mechanism, and that is
deliberate.** In single-tenant mode there is exactly one `Tenant` row
(§4), and that row carries the overrides map like any other. The resolution
path, the registry, the fallback and the isolation rules are identical; the
effective tenant is simply always the same one.

This is the same reasoning as §4's: an override mechanism that only exists in
SaaS mode would be a second code path, exercised by no test in the on-premise
channel and therefore broken in it. An on-premise clinic is in fact the *more*
likely candidate for an override, because it is the customer with the most
idiosyncratic workflow — so the mechanism has to work in exactly the mode where
it is most needed.

#### 13.7 Coexistence with the module architecture

The mechanism is additive; it does not weaken §6–§12.

| Rule | How it still holds |
|---|---|
| **Barrel-only imports** (§10 rule 1) | A caller imports `@/modules/dashboard`. It never imports an override path, and it never learns which implementation it received. The resolver is the only code that knows both names. |
| **Every module has an `index.ts`** (§10 rule 2) | An override has its own barrel, and that barrel **is** the contract it satisfies. The registry holds the barrel reference, not a deep path. |
| **1000-line limit** (§10 rule 4) | An override is a module tree, not one large file. It is split by responsibility like any other module, and the CI file-length check covers it with no exception. |
| **No cross-module deep imports** (§10 rule 1) | Unchanged. An override may import another module only through that module's barrel — and if it depends on a module that is itself overridden, it receives the overridden implementation through the resolver like any other caller. |
| **`core` never imports `modules`** (§10 rule 3) | The registry lives in the module layer, not in `core`. `core` defines the *shape* of a resolution result as a type; it does not know any module's name. |
| **`app` stays thin** (§6) | A page resolves the module and calls it. Choosing the implementation is not the page's job, so a page is not where an override becomes visible. |
| **The 20 modules of §7** | Unchanged. An override substitutes an implementation of an existing module; it never introduces a 21st. The module list is a closed set, and an override declaration naming a module outside it fails validation. |

#### 13.8 What this costs

Recorded honestly, because the mechanism is not free:

- **A second implementation of a module doubles that module's maintenance and
  test surface**, for as long as the tenant exists. This is why overrides are
  declared per tenant and never offered as a self-service control.
- **The override ships with the platform's release cadence**, not its own
  (ADR-0019). A tenant wanting a change to its override waits for a platform
  release. That is the price of never forking.
- **A registry entry is a build-time artefact**, so adding the first override for
  a tenant is a code change plus a settings-row change. Only the *selection* is
  data; the *implementation* is always part of the release.

**Implementation phasing** is in `roadmap/phases.md`: the registry, the
resolver, the validation contract and the fail-closed behaviour are built in
**Phase 1**, because they are part of the foundation and because the isolation
tests that prove them can only be written while the test harness is being built.
The first real override ships in a later phase, against a customer who has asked
for one.

---

*Related: `01-tech-stack.md` (why one deployable plus a worker),
`03-data-model.md` (the entities and indexes), `09-security.md` (RLS policies,
the SQLite fallback, and the override isolation rules),
`05-conventions.md` §15 (naming and validating an overridable module),
`roadmap/decisions.md` (ADR-0003 … ADR-0006, ADR-0015, ADR-0019 the override
mechanism).*
