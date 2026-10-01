# 09 — Security & Tenant Isolation

> The product holds medical records and financial data for many clinics in one
> database. A cross-tenant leak is not a bug — it is an existential event for the
> business. This document is the specification of how that cannot happen.

---

## 1. What is being protected

| Asset | Why it matters | Primary threat |
|---|---|---|
| Customer records (name, mobile, medical history, sensitivities) | Medical + personal data | Cross-tenant leak; staff over-reach |
| Before/after images | Sensitive imagery, legally consent-bound | Leak; use after consent revocation |
| Payments and balances | Money | Undetected alteration; unrecorded discount |
| Appointment and cycle history | The clinic's commercial asset | Export by a departing employee |
| Staff permissions | Everything above depends on it | Privilege escalation |
| The tenant boundary itself | The SaaS contract | One clinic seeing another's data |

Immutable rule 3 applies throughout: **medical data is separate from the
assistant and from campaigns**; grouping uses only behavioural and financial
data (`06-constants.md` §1).

---

## 2. Two layers, on purpose

Isolation is enforced **twice**, and the second layer exists because the first
will eventually be wrong.

| Layer | Where | What it does | Failure mode it catches |
|---|---|---|---|
| **Layer 1 — application** | every module query | Every query is constrained to the resolved `tenantId` | Nothing on its own — it is the normal path |
| **Layer 2 — database** | PostgreSQL Row-Level Security | The engine refuses to return or write another tenant's rows | **A query that forgot its filter** |

The specification's own rule is the justification: *«دسترسی در سرور اعمال
میشود»*. Layer 2 is what makes that true even when a developer, in a hurry,
writes the one `where` clause that is missing.

**The design assumption is that Layer 1 will fail.** Every decision below is
made so that a Layer 1 failure produces an error rather than a leak.

---

## 3. Tenant resolution

The tenant is **resolved, never received.**

```
session cookie (httpOnly, signed)
  → userId
  → Membership(userId)             ← the ONLY source of tenant
  → { tenantId, clinicId, role, overrides }
```

- The session stores **only `userId`**. It does not carry `tenantId` in a way
  that could be tampered with, and even if it did, nothing would read it.
- `tenantId`, `clinicId`, `role` and the permission set are **re-derived on every
  request** from the `Membership` row.
- **No input schema contains a tenant or clinic identifier**
  (`05-conventions.md` §5). If one appears, it is a security defect.
- A user with memberships in multiple tenants has the active one chosen
  server-side and recorded in the session's *server-side* store, not in a
  client-readable cookie.

**Multi-tenant switch:** the tenant switcher writes a server-side selection. The
client sends an *index*, and the server maps it to one of the caller's own
memberships — a client can never name a tenant it does not belong to.

---

## 4. Row-Level Security

### 4.1 Enabling it

RLS is enabled **and forced** on every tenant-scoped table:

```sql
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Customer"
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

Three details that matter:

- **`FORCE ROW LEVEL SECURITY`** — without it, the table owner bypasses every
  policy. The application connects as a dedicated role that is **not** the owner
  and **not** a superuser, and `FORCE` closes the owner path regardless.
- **`USING`** filters reads and the rows a `UPDATE`/`DELETE` may target.
- **`WITH CHECK`** filters writes. Without it, a row could be *inserted* with
  another tenant's id even though it could not be read back.

The same policy shape applies to every tenant-scoped table: `Customer`,
`Appointment`, `Service`, `TreatmentCycle`, `Payment`, `Campaign`,
`MessageSend`, `AudienceGroup`, `Membership`, `User`, `AuditLog`, `JobQueue`,
and every supporting entity in `03-data-model.md` §6.

**Join tables** (`ServiceDoctor`) and child tables carry `tenantId` too, even
where it is derivable, so that every table is independently protected and no
policy depends on a join.

### 4.2 Setting the tenant context

The context is set **inside the transaction** and must be set with
`set_config(..., true)`:

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  // … every query in this transaction is now tenant-scoped by the engine
})
```

**Why `set_config(..., true)` and not `SET LOCAL`:** `SET LOCAL` cannot take a
bind parameter, so using it means interpolating the tenant id into SQL text —
which is precisely the injection surface being designed away. `set_config` is a
normal function call, so the value binds as a parameter.

**Why `true` (the third argument, "is local"):** it scopes the setting to the
transaction. This is mandatory with connection pooling: a plain `SET` persists on
the pooled connection and the next request served by that connection would
inherit the previous tenant's context. `set_config(..., true)` reverts
automatically at transaction end.

### 4.3 Failing closed

`current_setting('app.tenant_id', true)` returns `NULL` when the setting was
never applied. `tenantId = NULL` is never true, so **a query running without a
tenant context returns zero rows and writes nothing** — it fails closed, not
open.

On top of that, a **client extension asserts the context exists**: any query
issued outside a tenant-scoped transaction throws rather than silently returning
nothing. A silent empty result would look like "no data" and be debugged as a
data problem; a loud failure is diagnosed in seconds.

### 4.4 RLS is not a substitute for Layer 1

RLS cannot express authorisation. It knows about tenants, not about roles,
ownership, or the 16 permissions. A doctor querying inside the correct tenant can
still see a colleague's patients if Layer 1 does not apply the ownership
predicate. **Layer 1 is the authorisation layer; Layer 2 is the isolation
backstop.** Both are required.

---

## 5. Development: SQLite has no RLS

Layer 2 does not exist on SQLite, which is the development database
(`setup/database-migration.md`). This is an accepted risk with four mitigations:

1. **Production is PostgreSQL, always.** The application asserts at startup that
   the production provider is PostgreSQL and that RLS is enabled on every
   tenant-scoped table; it **refuses to boot** otherwise. Running a production
   tenant on SQLite is not a supported configuration.
2. **A Prisma client extension performs Layer 1 automatically.** It injects the
   `tenantId` predicate into every query on a tenant-scoped model and **rejects**
   a query for such a model that carries no tenant context. Modules do not
   hand-write the predicate; the extension is the single enforcement point, so
   "forgot the filter" is not a mistake a module author can make.
3. **CI runs the full isolation suite against PostgreSQL**, where RLS is live.
   The cross-tenant tests are therefore real tests, not simulations.
4. **A startup check refuses to run the app in `NODE_ENV=production` against a
   SQLite URL**, so a misconfigured deployment fails loudly instead of silently
   losing Layer 2.

**Honest statement of the residual risk:** in local development, a developer with
a direct SQLite connection can see all tenants' rows. Development uses synthetic
seed data only. No real clinic data may ever be loaded into a development
database — this is a policy, and it is stated in `setup/installation.md`.

---

## 6. Authorisation and escalation

### 6.1 The primitive

`can()` and `requirePermission()` in the `roles-permissions` module
(`04-roles-permissions.md` §3.1). They accept **only** the server-resolved
context. There is no overload taking a role or permission list from a caller.

### 6.2 Escalation paths, closed

| Path | Closure |
|---|---|
| Forge `tenantId` in a body or query string | Nothing reads it. Resolution is from `Membership`. |
| Reach a page URL directly, bypassing a hidden menu item | The module call performs `requirePermission`; the page renders 403 regardless of entry route. |
| Grant oneself a permission | The update path requires `manage_users` **and** rejects any actor equal to the subject. |
| Escalate via a role change | Only `manage_users` holders may change a role, and never their own. |
| Remove the last manager | Locked column + a transaction-level invariant that refuses to leave a tenant without an active manager (`04-roles-permissions.md` §2.3). |
| Apply a discount silently | Every discount row stores `discountByUserId`; the write is in the audit log. |
| Move a debt due date to hide it | The change is audited and the original due date is preserved in the audit record. |

### 6.3 Ownership scoping

Two permissions are additionally narrowed by ownership, applied **inside the
module query, next to the tenant predicate** — never in a component:

- A doctor with `view_own_customer_records` sees only customers they are the
  primary doctor for, or who have an appointment with them.
- `view_own_cycles` and `view_own_schedule` are filtered the same way.

**A record outside the caller's scope returns 404, not 403.** A 403 confirms the
record exists, which is itself a disclosure: it tells a doctor that a named
patient is registered at a clinic they do not treat at.

---

## 7. The customer panel

The customer-facing panel is a different scope, not a lesser role.

- A customer authenticates by **mobile + one-time code**. There is no password
  for customers.
- The session resolves to a `customerId`, and **every query is scoped to that
  `customerId` in addition to the tenant**.
- A customer can read: their own appointments, their own cycles and care
  instructions, their own payments and balance, their own profile and consent
  settings.
- A customer can write: cancel or reschedule their own appointment, update their
  own profile, **grant or revoke their own consent**.
- A customer can **never** read: another customer's anything, staff data, clinic
  settings, reports, or any aggregate over other people.

The customer's own `customerId` is derived from the session. It is never a
parameter. A customer-supplied `customerId` would be an instant horizontal
privilege escalation across the entire patient database, so it does not exist as
an input anywhere.

---

## 8. The background worker

The worker runs without a logged-in human, which is exactly why its access is
constrained more tightly, not less.

| Property | Rule |
|---|---|
| Identity | A dedicated service credential, distinct from any user account. It appears in the audit log as the actor. |
| Tenant scope | **Explicit per job.** The worker never runs a query outside a resolved tenant context. There is no "all tenants" query path. |
| Context mechanism | The same `set_config('app.tenant_id', …, true)` inside a transaction as the web tier. The worker is not exempt from RLS. |
| Permissions | The worker does **not** go through `requirePermission` (there is no user role to check). Instead each job declares the exact capability it needs, and the job runner asserts it. A job that would need `manage_users` does not exist. |
| Iteration | Jobs that span tenants are a **loop over tenants**, each iteration in its own scoped transaction. Never a single transaction crossing tenants. |
| Privileged operations | The worker cannot alter permissions, roles, or memberships. It cannot record a payment. |
| Bulk sends | Campaign and automatic-message dispatch is the worker's job, and it is where consent, daily caps, the 90-day duplicate window, and the send window are enforced (`06-constants.md` §4.10) — **downstream of every other filter**, so no caller can bypass them. |

---

## 9. Consent and medical data

Three immutable rules are implemented as hard gates, not settings
(`06-constants.md` §1):

- **Consent precedes preference (rule 5).** A customer without consent for a
  channel is removed from the recipient set even when a manager explicitly
  selected them. The removal is recorded as `SUPPRESSED` with a reason, so it is
  visible rather than silent.
- **Medical data never reaches campaigns or the assistant (rule 3).** The
  audience-group predicate type has no clinical field, so a clinical grouping
  cannot be expressed in code. The campaign assistant's field allow-list excludes
  diagnosis, doctor notes, sensitivities, medication, before/after images, and
  consent documents.
- **Before/after images require written, revocable consent (rule 6).**
  Revocation removes the image from every surface including the public site,
  immediately, while retaining the consent's audit trail.

---

## 10. Authentication

| Concern | Rule |
|---|---|
| Staff login | Mobile or username + password. Passwords hashed with a memory-hard algorithm (Argon2id); never reversible; never logged. |
| Customer login | Mobile + one-time code. Codes are short-lived (minutes), single-use, and rate-limited per mobile and per IP. |
| OTP storage | Only a hash of the code is stored, with an expiry and an attempt counter. |
| Session | httpOnly, `Secure`, `SameSite=Lax` cookie; signed with `NEXTAUTH_SECRET`. |
| Session fixation | The session identifier is rotated on successful login. |
| Session lifetime | Absolute expiry plus idle expiry; server-side revocation works immediately. |
| Enumeration | Login responses do not reveal whether a mobile number exists. |
| Rate limiting | Per-mobile, per-IP, and per-account, on login and on OTP issuance. |
| CSRF | Server Actions carry built-in origin verification; Route Handlers performing mutations verify origin explicitly. A state-changing `GET` is a finding. |
| Logout | Server-side session invalidation, not just cookie clearing. |

---

## 11. Transport and headers

- HTTPS in production, with HSTS. On-premise installs terminate TLS at the
  clinic's reverse proxy; the product documents this and refuses to accept a
  production URL served over plain HTTP from a non-localhost origin.
- `Content-Security-Policy` restricting scripts to self; no `unsafe-eval`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY` (the panels are never framed).
- Cookies `Secure` and `httpOnly` in production.

---

## 12. File uploads (before/after images)

| Rule | Reason |
|---|---|
| Type and size validated server-side | Never trust the client's content type |
| Re-encoded server-side on ingest | Strips embedded metadata and any payload in the original file |
| Stored outside the web root, served through an authorising route | A direct URL must not bypass the permission check |
| A consent record is required to attach an image | Immutable rule 6 |
| Revocation removes the image from every surface and from the public site | Immutable rule 6 |
| Filenames generated, never taken from the upload | Path traversal and overwrite |

---

## 13. Audit logging

`AuditLog` records permission-sensitive and money-sensitive actions with actor,
tenant, timestamp, target, and before/after values where applicable.

| Audited | Not audited |
|---|---|
| Permission and role changes | Ordinary reads |
| Discounts applied (amount, reason, actor, subject) | Page views |
| Payment corrections and refunds | Search queries |
| Debt due-date changes | Every field edit |
| Campaign approval and dispatch | Routine status recording |
| Consent grant and revocation | |
| Staff invitation, deactivation, password reset | |
| Tenant provisioning and suspension | |
| Login success and failure | |
| Licence validation events | |

Rules:

- The audit log is **append-only**. No update or delete path exists in the
  application.
- It is **per-tenant readable** by a manager, and never cross-tenant readable
  except by the platform operator in a break-glass path that is itself audited.
- **No PII is written to application logs** (`05-conventions.md` §11) — no phone
  numbers, names, or medical notes. Identifiers only. The audit log stores
  identifiers and references, not clinical content.

---

## 14. Secrets management

| Environment | Storage | Rules |
|---|---|---|
| Development | `.env` (gitignored) | Only `.env.example` is committed. Dev secrets are throwaway. |
| Staging | Platform secret store, injected as environment variables | Never in the image, never in the repository. |
| Production (SaaS) | Platform secret store, injected at runtime | Rotation supported without a rebuild. |
| On-premise | A config file created by the installer with restrictive permissions, outside the repository | `NEXTAUTH_SECRET` and provider keys generated **per install**, never a shared default. |

**Universally forbidden:**

- Secrets in the repository, in an image layer, in a log, in a URL, or in an
  error message.
- A default or example secret shipped in code as a fallback. A missing secret
  must **fail at startup**, not fall back to a weak value.
- The same `NEXTAUTH_SECRET` across environments — it would let a staging
  session forge a production one.
- `DATABASE_URL` with a superuser account. The application role is
  least-privilege: no DDL, no superuser, no bypass of RLS.

**Secrets in scope:** `DATABASE_URL`, `NEXTAUTH_SECRET`, `SMS_PROVIDER_KEY`,
`PAYMENT_PROVIDER_KEY`, `LICENSE_KEY` (`docs/.env.example` documents each).

**Rotation:** every secret has a documented rotation procedure. Rotating
`NEXTAUTH_SECRET` invalidates sessions — this is stated, so it is done in a
window rather than discovered.

---

## 15. Dependencies and supply chain

- Dependencies are **pinned exactly** (`01-tech-stack.md` §7), so a build is
  reproducible and a compromised patch release does not arrive silently.
- Lockfile committed; CI installs from the lockfile.
- Automated vulnerability scanning in CI, with a build **failing** on a
  high-severity advisory in a runtime dependency.
- A new runtime dependency requires justification in review. The product's
  dependency count is deliberately small, and every addition is attack surface.
- No post-install scripts from untrusted packages.

---

## 16. Data protection and retention

- **Tenant deletion** is a documented, deliberate, audited operator action with a
  cooling-off period — never a one-click control inside a panel.
- **Customer data export** is available to a clinic for its own tenant, in a
  documented format, because the data is the clinic's. It requires
  `manage_clinic_settings` and is audited.
- **No cross-tenant aggregate** is exposed to any tenant. A clinic can never
  learn anything about another clinic's patients, not even a count.
- **Backups** are encrypted and access-controlled; a restore is verified
  periodically, because an unverified backup is not a backup.
- **Breach notification** is a documented operator procedure with a defined
  timeline, because the data is medical and the obligation is legal, not
  commercial.

---

## 17. Out of scope (stated so it is not assumed)

- Protection against a malicious **platform operator** with database access.
  The isolation model protects tenants from each other and from application
  bugs; it does not defend against the operator who holds the keys. Encryption at
  rest and operator access control address that, and are operational concerns.
- Protection against a compromised **clinic workstation** with a logged-in
  session. Session hygiene, screen locking, and device management are the
  clinic's responsibility, and role design limits the blast radius.
- Defence against a **nation-state adversary** or physical seizure of the
  on-premise server.

Naming the boundary is part of the design: an unstated assumption is the one
that becomes an incident.

---

## 18. Override isolation

`02-architecture.md` §13 lets a tenant declare a different implementation of a
module. That mechanism hands a customer-influenced artefact a place inside a
process that serves every tenant's medical and financial data. This section is
the set of constraints that makes that acceptable — and the reason the mechanism
is a *registry* rather than a plugin system.

### 18.1 The primary control: an override cannot be arbitrary code

Everything below is defence in depth around one structural fact:

> **An override is a module that was compiled, boundary-checked and tested as
> part of this release. The database selects from a fixed set of names in that
> release's registry. There is no dynamic import by path, no `eval`, no runtime
> compilation, and no plugin loaded from disk or from a network location.**

That is why "runtime code injection" was rejected in ADR-0019 and why the
mechanism is safe: a tenant can choose **which** of the shipped implementations
runs, and cannot introduce one that was never reviewed. A settings row is
therefore not an execution surface — it is a selector over an allow-list that
exists at build time.

### 18.2 An override cannot access another tenant's data

| Constraint | Where it holds |
|---|---|
| The override runs inside the **same request, the same module boundary and the same transaction** as the default — it is not a separate process, a sandbox, or a service. | `02-architecture.md` §13.3 |
| Every query it issues goes through **the same Prisma client extension** that injects the tenant predicate and rejects a query with no tenant context. There is no second client an override can construct. | §5 mitigation 2 |
| **RLS is active in the same transaction**, so even a query that omits the predicate returns zero rows rather than another tenant's. | §4.1, §4.3 |
| The tenant context is **resolved from `Membership` per request** and is never a parameter an override can set, receive, or widen. `set_config('app.tenant_id', …)` is issued by the framework, not by the module. | §3, §4.2 |
| An override has **no path to a second database connection.** The application's data access is a single exported client; opening one's own connection is a review-blocking finding, and the application role is least-privilege with no DDL and no RLS bypass. | §14 |

The consequence: an override is exactly as isolated as the default module —
**no more and no less.** It cannot see another tenant because nothing in the
process can, and it cannot opt out of the mechanism because it does not
construct the mechanism.

### 18.3 An override cannot bypass the permission model

- **`requirePermission` is called by the caller, not by the implementation.**
  The resolver chooses an implementation *after* the tenant and role are
  resolved, and the module entry point that performs the check is part of the
  contract the override satisfies (`05-conventions.md` §15.5). An override that
  omits the check does not compile, because the interface it is typed as
  includes it.
- **An override cannot change the matrix.** The 16 permissions, the three roles,
  the role defaults and the manager column lock (`04-roles-permissions.md`) live
  in `roles-permissions`, a separate module. Overriding `dashboard` cannot alter
  a permission, and there is no override of `roles-permissions` that could be
  written without the same test matrix passing against it.
- **Ownership scoping still applies.** A doctor using an overridden dashboard
  still receives only their own patients, because the ownership predicate is
  applied inside the module query (§6.3) and the override implements that query.
- **The worker is not exempt.** A job whose module is overridden runs the
  override, under the same per-job tenant scope and the same declared-capability
  assertion (§8).

### 18.4 An override cannot bypass the tenant context

| Attempt | Why it fails |
|---|---|
| Read `tenantId` from a request body, header, cookie or query string | Nothing reads a client-supplied tenant (§3, rule 2 of `02-architecture.md` §1). |
| Declare an override that omits the tenant predicate | The client extension rejects a query on a tenant-scoped model with no tenant context rather than returning nothing (§5 mitigation 2) — and RLS fails closed underneath (§4.3). |
| Resolve a module for a tenant other than the caller's | Resolution reads the **server-resolved** context (`02-architecture.md` §13.3). The client sends nothing that participates in the choice. |
| Cache a resolution across tenants | Any cache is keyed by `(tenantId, module)` and invalidated when the tenant's settings row changes; a module-name-only cache is a cross-tenant leak and is a blocking finding in review. |
| Use the override to reach a module it does not replace | The registry maps an override to exactly one module. There is no wildcard, no inheritance, and no "applies to all modules" entry. |

### 18.5 How the core sandboxes an override

The word "sandbox" here is precise: **the containment is process-level, not
container-level.** An override is not isolated in a separate runtime — it is
contained by the same boundaries every module already has, plus four specific to
overrides:

1. **Static registry.** The only way to be selected is to be in the build's
   registry (`05-conventions.md` §15.6 layer 4). Nothing outside the build can
   become an override.
2. **Typed contract.** The override is typed as the default module's exported
   interface, so it cannot widen an input type, add a parameter, or return a
   shape callers do not expect to receive data it should not have
   (`05-conventions.md` §15.5).
3. **No privileged reach.** An override has no access to sessions, to the
   resolver, to the permission matrix, or to the database client's construction.
   Its imports are ordinary module imports, subject to the same ESLint boundary
   rule (`02-architecture.md` §10.6).
4. **Contained failure.** An exception inside an override is caught at the
   resolution boundary and the request continues on the default. The blast radius
   of a defect is **one module for one tenant for the duration of one incident**,
   not one request, and never another tenant.

**Stated honestly:** an override is trusted code, held to the same standard as
the default module, not untrusted code held at arm's length. The isolation it
gets is the isolation every module gets. The reason this is acceptable is that
the override is written, reviewed and tested by the platform's own team as part
of a release — the customer states the requirement, they do not supply the code.

### 18.6 How a bad override is detected and disabled

| Detected by | When | What happens |
|---|---|---|
| **The compiler** | Build | A missing or mistyped export against the module interface fails the build. |
| **CI boundary and structure checks** | CI | A missing `module.ts`, a declaration whose `implementation` does not match its folder, a registry entry pointing at a nonexistent barrel, or a file over 1000 lines fails CI. |
| **The test suite** | CI | The module's own tests, the permission matrix and the cross-tenant isolation suite run against every registered override. An override with no isolation test is not registered. |
| **Startup validation** | Process start | Each declaration is parsed by Zod. A malformed entry is marked invalid and never offered to the resolver. |
| **A circuit breaker** | Runtime | An override that throws is caught at the resolution boundary. After repeated failures within a short window it is **disabled for that tenant** and the default serves the module. |
| **The audit log** | On every state change | Enabling, disabling, and changing an override declaration is written to `AuditLog` with the actor (§13). The original declaration is preserved in the audit record, so a revert is a recorded fact rather than a guess. |

**Disabling is never silent, and it is never automatic forever.** An override
disabled by the circuit breaker stays disabled until a human re-enables it after
the cause is fixed — an override that flaps between enabled and disabled would
serve a tenant two different products on alternating requests, which is worse
than either failure alone.

### 18.7 How the tenant is notified

A tenant whose override has been disabled must not discover it by noticing that
a screen looks different. Notification is tiered by severity:

| Event | Channel |
|---|---|
| Override disabled by the circuit breaker | The tenant's managers receive an in-product notice on next login, in the notification feed, naming the module and stating that the default implementation is now in use. |
| Override disabled, and the module is one the tenant depends on operationally | The same notice, plus an operator-to-customer notification through the support channel — the tenant is being served a different product than the one they were promised, and that is a conversation, not a banner. |
| Declaration invalid at startup | The operator is alerted; the tenant sees the default with the same in-product notice. |
| Declaration changed (enabled, disabled, or reverted) | Recorded in the audit log, visible to the tenant's managers, with the actor and the timestamp. |

**The notification is Persian and specific**, like every other user-facing
message (§7 and `07-localization.md` §8): it names the module in the tenant's own
vocabulary and states what is happening, rather than reporting an internal
identifier. It never says "error"; it says which part of the product has
reverted to the standard behaviour and that support has been informed.

**What the tenant is never told, and never needs to be:** the internal
implementation id, the registry key, or the exception. Those go to the operator's
log with the correlation id (§13), not to the clinic's screen.

---

*Related: `02-architecture.md` (the tenant boundary, the request lifecycle and
the override mechanism), `04-roles-permissions.md` (the matrix and the `can()`
primitive), `05-conventions.md` §15 (the override naming and validation
contract), `03-data-model.md` (which tables carry `tenantId`),
`setup/deployment.md` (RLS and secrets in practice),
`setup/database-migration.md` (the SQLite dev fallback),
`10-testing-strategy.md` (the isolation and permission suites).*
