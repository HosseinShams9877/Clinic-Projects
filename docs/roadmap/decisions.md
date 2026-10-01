# Roadmap — Decisions

> Architecture Decision Records. Each records a decision that was **made**, the
> alternatives that were **rejected**, and the consequences that were
> **accepted**. A decision is not revisited by re-arguing it in a pull request;
> it is revisited by writing a new ADR that supersedes it.
>
> An ADR is immutable once accepted. To change a decision, add a new one — never
> edit the old text.

---

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](#adr-0001--nextjs-full-stack-as-a-single-deployable) | Next.js full-stack as a single deployable | Accepted |
| [0002](#adr-0002--the-background-worker-is-a-separate-process-not-a-separate-codebase) | The background worker is a separate **process**, not a separate codebase | Accepted |
| [0003](#adr-0003--one-postgresql-database-with-row-level-security) | One PostgreSQL database with row-level security | Accepted |
| [0004](#adr-0004--single-tenant-mode-as-a-runtime-flag-not-a-fork) | Single-tenant mode as a runtime flag, not a fork | Accepted |
| [0005](#adr-0005--access-through-membership-tenant-resolved-server-side) | Access through Membership; tenant resolved server-side | Accepted |
| [0006](#adr-0006--database-backed-job-queue-not-an-external-broker) | Database-backed job queue, not an external broker | Accepted |
| [0007](#adr-0007--prisma-orm-portable-across-sqlite-and-postgresql) | Prisma ORM, portable across SQLite and PostgreSQL | Accepted |
| [0008](#adr-0008--money-as-bigint-rial-serialised-as-a-string) | Money as `BigInt` Rial, serialised as a string | Accepted |
| [0009](#adr-0009--dual-date-representation) | Dual date representation (UTC instant + Jalali local date) | Accepted |
| [0010](#adr-0010--jalali-conversion-in-house-not-intl) | Jalali conversion in-house, not `Intl` | Accepted |
| [0011](#adr-0011--the-treatment-cycle-is-an-independent-entity) | The treatment cycle is an independent entity | Accepted |
| [0012](#adr-0012--an-audience-group-is-a-query-not-a-stored-list) | An audience group is a query, not a stored list | Accepted |
| [0013](#adr-0013--no-debts-table-the-debt-list-is-served-by-the-appointment-index) | No `debts` table; the debt list is served by the appointment index | Accepted |
| [0014](#adr-0014--recomputable-charge-and-payment-totals-alongside-a-computed-balance) | Recomputable charge/payment totals alongside a computed balance | Accepted, provisional |
| [0015](#adr-0015--a-modular-monolith-with-barrel-imports-and-a-1000-line-limit) | A modular monolith with barrel imports and a 1000-line limit | Accepted |
| [0016](#adr-0016--the-immutable-rules-and-the-constant-sets-are-amended-only-by-adr) | The immutable rules and constant sets are amended only by ADR | Accepted |
| [0017](#adr-0017--the-public-site-has-eight-pages) | The public site has eight pages | Accepted, provisional |
| [0018](#adr-0018--the-customer-panel-is-a-separate-identity-with-no-parameterised-scoping) | The customer panel is a separate identity with no parameterised scoping | Accepted |

---

## ADR-0001 — Next.js full-stack as a single deployable

**Status:** Accepted · Phase 0

**Context.** The product is a Persian multi-tenant clinic platform with a staff
panel, a customer panel, a public site, and scheduled background work. Two
shapes were considered: a separate Node.js backend service with a Next.js
frontend (Option A), or Next.js full-stack using the App Router, Route Handlers
and Server Actions (Option B).

**Decision.** **Option B.** One Next.js application, one deployable, one
codebase, TypeScript throughout. **One exception**, recorded separately in
ADR-0002: scheduled work runs in a separate worker process.

**Why.** Across twelve dimensions the comparison favours B on nine, ties on
three, and A wins on none for *this* product. The decisive factors:

- **On-premise deployment.** Some clinics install on their own server. One
  process tree to install, configure and supervise is a different order of
  difficulty from two, and the customer's IT is often a single part-time person.
- **Auth and session.** Session resolution, tenant resolution and the permission
  check happen in the same request as the render. With a separate backend, every
  page load is a network call that must independently re-establish identity and
  tenancy — three places to get tenant isolation wrong instead of one.
- **Tenant isolation.** One data path means one place to enforce the tenant
  predicate. A second service means a second data path that must be audited
  independently, forever.
- **Type safety across the boundary.** No hand-maintained API contract between
  frontend and backend, so no class of "the client thinks this field is
  optional" bug.
- **Team size.** The maintainer is one or two people. A second service is
  duplicated build, deploy, log and dependency work with no payoff at this size.
- **Latency.** A Persian clinic on a modest connection avoids a round trip per
  page.

**Consequences accepted.**

- The web tier and background work share a process model, so a long-running job
  must never run in a request. Mitigated by ADR-0002 and by the Server Action
  rule in `05-conventions.md` §6: interactive and sub-second only, no bulk sends.
- Serverless-first hosting is off the table; the worker needs a long-lived
  process. Accepted — the SaaS deployment is a container either way.
- The scalability ceiling is lower than a service-per-domain design. Accepted —
  the realistic load (hundreds of clinics, each with hundreds of customers) is
  far below where that matters, and `03-data-model.md` indexes the hot paths.

**Rejected alternatives.** NestJS backend (the strongest Option A), tRPC,
Remix, SvelteKit, Django/Laravel, microservices, MongoDB, GraphQL,
serverless-first. Reasoning per alternative in `01-tech-stack.md` §5.

**Documented in.** `01-tech-stack.md`.

---

## ADR-0002 — The background worker is a separate process, not a separate codebase

**Status:** Accepted · Phase 0

**Context.** Four things must run without a request: treatment-cycle due
detection, automatic message dispatch, campaign dispatch, and audience-group
refresh. ADR-0001 chose a single deployable, which raises the question of where
scheduled work lives.

**Decision.** A **separate Node.js process** at `src/worker/`, started by
`npm run worker`, that **imports the same modules, the same Prisma schema, the
same migrations and the same localization layer** as the web tier. Same
repository, same release, same version. It is a process boundary, not a code
boundary.

**Why a separate process.** A job that takes minutes cannot run inside a request
lifecycle; a crash in a job must not take down the web tier; and a scheduled job
must run even when nobody is using the product — at 6am, when the reminder
messages go out.

**Why not a separate codebase.** The jobs must obey the same tenancy, the same
permissions, the same cycle rules and the same message rules as the web tier. A
second codebase would duplicate every one of those rules and drift from them.
The cycle-creation rule, for example, must behave identically whether triggered
by a doctor completing a session or by the hourly sweep.

**Consequences accepted.**

- The worker must be started, supervised and monitored separately. Documented in
  `setup/deployment.md`, and the health check is part of the Phase 1 DoD.
- A shared dependency must not assume a request context. `getTenantContext()` has
  a worker variant that resolves a tenant explicitly per job
  (`09-security.md` §8).
- The worker cannot do anything the web tier could not: it cannot alter
  permissions, cannot record payments, and cannot bypass consent
  (`09-security.md` §8).

**Documented in.** `01-tech-stack.md` §4, `02-architecture.md` §12.

---

## ADR-0003 — One PostgreSQL database with row-level security

**Status:** Accepted · Phase 0

**Context.** Multi-tenant isolation can be implemented as a database per tenant,
a schema per tenant, or one database with a tenant column and policies.

**Decision.** **One database, one schema, a `tenantId` column on every
tenant-scoped table, and PostgreSQL row-level security as the second layer.**
The first layer is application-level filtering through a Prisma client
extension.

**Why not a database per tenant.**

- **Migrations.** A schema change must be applied to every tenant database. With
  150 clinics that is 150 migration runs per release, each able to fail
  independently, leaving tenants on different schema versions. There is one
  migration path in the chosen design.
- **Cost and operations on the SaaS host.** Connection pooling, backups and
  monitoring multiply per database. One database is one backup job.
- **Cross-tenant reporting.** A platform-level aggregate ("how many clinics")
  becomes a fan-out query.
- **A new tenant is a row, not a provisioned database** — provisioning becomes a
  transaction instead of an infrastructure operation.

**Why not a schema per tenant.** The same migration multiplication, plus
connection-pool exhaustion as every connection needs `search_path` set, plus
Prisma's weaker support for dynamic schema switching.

**Why RLS is genuinely a second layer and not decoration.** The design assumption
is that **the application layer will eventually have a bug** — a query missing its
`where`, a new model added without the tenant predicate. RLS means that bug
returns zero rows instead of another clinic's customers. Two details make it
work:

- **`FORCE ROW LEVEL SECURITY`**, because a table's owner bypasses policies by
  default and the application connects as the owner in most setups.
- **`set_config('app.tenant_id', $1, true)`, not `SET LOCAL`.** `SET LOCAL`
  cannot take a bind parameter, so using it would require interpolating the
  tenant id into SQL text — reintroducing exactly the injection surface the
  design exists to remove. The third argument scopes the setting to the
  transaction, which is required for correctness under connection pooling.

**Consequences accepted.**

- Every tenant-scoped table needs a policy, and a new table without one is a
  security defect. Mitigated by making policy generation part of the migration
  and by a CI check that every tenant-scoped table has one.
- A missing tenant context **fails closed** — `current_setting('app.tenant_id',
  true)` returns NULL, and `tenantId = NULL` is never true. Queries return zero
  rows, loudly, rather than everything.
- SQLite dev has no RLS. This is a real, accepted gap between dev and production,
  documented honestly in `09-security.md` §5, and mitigated four ways. The
  cross-tenant suite runs on PostgreSQL in CI.

**Documented in.** `02-architecture.md` §3, `09-security.md` §4.

---

## ADR-0004 — Single-tenant mode as a runtime flag, not a fork

**Status:** Accepted · Phase 0

**Context.** Some clinics buy the product to install on their own server. They
are one tenant. The obvious implementations are a separate stripped-down build,
or a runtime flag.

**Decision.** **`MULTI_TENANT=false`.** One schema, one set of migrations, one
codebase, one module list. The flag changes exactly two things: whether the
tenant switcher renders, and whether the `tenant-management` and `license` route
trees are reachable.

**Why.** A fork is two codebases that must both be maintained, both migrated and
both tested. Every bug fix applies twice, and they diverge within months. A flag
means the single-tenant customer is running the same code the SaaS customers run
— the code with the most usage, the most tests and the fastest fixes.

**Why the schema does not change.** The single-tenant install seeds exactly one
`Tenant` row. Every tenant-scoped table still carries `tenantId`, every RLS
policy still exists, and every query still filters. The isolation machinery is
inert because there is one tenant, not because it was removed. This also means
the two modes cannot diverge in behaviour, and a single-tenant customer who later
moves to SaaS needs no migration.

**Consequences accepted.**

- A single-tenant install carries a `tenantId` it will never need, and the RLS
  overhead applies. Accepted — the cost is a column and an indexed predicate.
- The flag must not leak into business logic. It gates **UI reachability only**;
  no module branches on it. A module that behaves differently under the flag is a
  finding.
- Both modes must be tested. The Phase 11 DoD requires the identical suite to
  pass under both flag values.

**Documented in.** `02-architecture.md` §4, `05-conventions.md`,
`setup/single-tenant.md`.

---

## ADR-0005 — Access through Membership; tenant resolved server-side

**Status:** Accepted · Phase 0

**Context.** A user's relationship to a tenant can be modelled as ownership (the
user owns the tenant), as a role column on the user, or as a separate membership
entity.

**Decision.** **A `Membership` join entity** — `User ──< Membership >── Tenant` —
carrying the role, the permitted clinic ids, and the per-user permission
overrides. The session stores **only the user id**; the tenant and role are
resolved on the server, on every request, from the membership.

**Why Membership and not ownership.** A doctor works at two clinics. A manager
owns one tenant and consults at another. An ownership model cannot express
either without duplicating user records, and duplicating users duplicates
identity, which breaks login and audit. Membership expresses all of it as rows.

**Why not a role column on the user.** A role is a property of the *relationship*,
not of the person. The same person is a manager in one tenant and a doctor in
another. A `role` column on `User` makes that inexpressible and makes every
`User` row a cross-tenant object.

**Why the tenant is never accepted from the client.** A client-supplied
`tenantId` is a request to read someone else's data, and no amount of validation
makes it safe — the correct answer is that the value is never read. The tenant
switcher sends an **index into the user's own membership list**, not a tenant
identifier. `tenantId`, `clinicId` and `role` are absent from every input schema
(`05-conventions.md` §5).

**Consequences accepted.**

- Every request resolves a membership. Mitigated by caching per session and by
  indexing `Membership` on `(userId, tenantId)`.
- The permission check needs the resolved context, so it cannot happen in
  middleware alone. It happens in the module layer, which also means the worker
  and Server Actions pass through the same check
  (`02-architecture.md` §11).
- Switching tenants is a session-scoped operation, not a data operation.

**Documented in.** `02-architecture.md` §2, `04-roles-permissions.md`,
`09-security.md` §3.

---

## ADR-0006 — Database-backed job queue, not an external broker

**Status:** Accepted · Phase 0

**Context.** The worker (ADR-0002) needs a way to know what to run. The options
are an external broker (Redis, RabbitMQ, SQS), a scheduler library, or a table in
the existing database.

**Decision.** **A `Job` table in PostgreSQL with claim semantics** — a job is
claimed by updating it with a conditional `where` on its status and owner, and a
claim expires so a killed worker's jobs are recovered.

**Why not a broker.**

- **On-premise.** A clinic's server must install with nothing beyond PostgreSQL.
  Requiring Redis is an additional service to install, secure, back up and
  monitor, on a machine the vendor does not control. This alone decides it.
- **The database is already the consistency boundary.** Enqueuing a job inside
  the same transaction as the change that caused it means the job cannot be lost
  by a crash between "the cycle became due" and "the reminder was queued". With
  an external broker that gap exists and needs an outbox pattern to close.
- **Operational surface.** One fewer thing to monitor, and the job queue is
  inspectable with SQL — which matters when diagnosing a clinic's problem at
  distance.
- **Volume.** The product's job volume is in the tens of thousands per day at
  full scale, far below where PostgreSQL's `SKIP LOCKED` claim pattern is a
  bottleneck.

**Consequences accepted.**

- Claiming must be correct under concurrency. `SELECT ... FOR UPDATE SKIP
  LOCKED` plus a conditional update; the double-run and mid-job-kill tests in the
  Phase 11 DoD verify it.
- A long-running job holds a row lock for its duration. Mitigated by claiming in
  one short transaction and running the work outside it, with the job's
  ownership recorded.
- No built-in fan-out or dead-letter semantics. A failed job increments an
  attempt count and returns to the queue with backoff; after a threshold it is
  marked failed and surfaced in worker health.

**Documented in.** `02-architecture.md` §12, `setup/deployment.md`.

---

## ADR-0007 — Prisma ORM, portable across SQLite and PostgreSQL

**Status:** Accepted · Phase 0

**Context.** Development wants a zero-install database; production needs
PostgreSQL for RLS (ADR-0003). The schema must be one schema, not two.

**Decision.** **Prisma**, with a schema that compiles for both engines, and a
documented list of features **avoided** precisely because they do not port.

**The avoided list, and what is used instead:**

| Avoided | Why | Instead |
|---|---|---|
| Native `enum` | SQLite has no enum type; a native enum is a migration that cannot port | `String` column + an `as const` object + a Zod schema |
| Arrays | Not supported on SQLite | A join table |
| `JSONB` | PostgreSQL-specific | `String` holding JSON, parsed through Zod at the boundary |
| `citext` | Extension, not available | A normalised column for comparison |
| Full-text search | Different implementation per engine | A normalised `searchName` column with `LIKE` |
| `CREATE INDEX CONCURRENTLY` | PostgreSQL-specific | A plain index in a transaction |
| Database-generated ids | Behaviour differs per engine | Ids generated in the application (cuid) |

**The one sanctioned escape hatch.** Exactly **one** partial index is used — the
appointment slot uniqueness constraint. It is represented portably as a **plain
unique index over a nullable `slotKey` column**, which is NULL for slot blocks.
NULL is not compared in a unique index on either engine, so the semantics are
identical on both. This is the single exception and it is documented here so that
a second one is a decision, not a drift.

**Consequences accepted.**

- No database-level enum means a typo is possible at the SQL layer; guarded by
  Zod at every boundary and by constants in one place (`06-constants.md`).
- No JSONB means JSON columns are opaque to the database and cannot be indexed or
  queried in SQL. Accepted — the fields holding JSON are configuration, not
  queryable data.
- A reviewer may reasonably ask why a PostgreSQL feature is not used; the answer
  is this ADR.

**Documented in.** `03-data-model.md` §5, `setup/database-migration.md`.

---

## ADR-0008 — Money as `BigInt` Rial, serialised as a string

**Status:** Accepted · Phase 0

**Context.** The product handles prices, deposits, payments, discounts and
balances. A floating-point error in a clinic's balance is a customer-visible
dispute.

**Decision.** **All money is `BigInt` in Rial.** Never a float, never a JS
`Number`. Serialised as a **string** across every JSON boundary. Rendered in
Toman (Rial ÷ 10) with Persian digits and the `٬` separator.

**Why Rial and not Toman.** Rial is the unit the payment gateways and the SMS
billing operate in. Storing the display unit and multiplying at the boundary
introduces a rounding decision in a dozen places; storing the base unit
introduces none.

**Why `BigInt` and not `number`.** A JS `number` is a double: it is exact only to
2⁵³. Money arithmetic that is exact today becomes inexact at a scale nobody
watches for, and the failure is a one-Rial difference that compounds. `BigInt`
maps to `INTEGER` on SQLite and `BIGINT` on PostgreSQL, both of which are
portable (ADR-0007).

**Why a string across JSON.** `JSON.stringify` throws on a `BigInt`, and
`JSON.parse` would produce a `number` and silently lose precision. A string is
the only lossless representation both sides understand.

**Consequences accepted.**

- Every arithmetic operation goes through `src/core/lib/money.ts`. Inline `+` on
  an amount is a finding (`05-conventions.md` §8).
- Every formatter and every consumer must expect a string. The type is branded so
  a raw `string` cannot be passed where a money string is expected.
- A `number` appearing near an amount is a review finding, without exception.

**Documented in.** `03-data-model.md` §3.3, `05-conventions.md` §8.

---

## ADR-0009 — Dual date representation

**Status:** Accepted · Phase 0

**Context.** The product displays Jalali dates but must sort, compare and
schedule across time zones. Storing only a Jalali date loses the instant;
storing only a UTC instant means every display does a timezone conversion, and
every conversion is a place for an off-by-one-day bug.

**Decision.** **Store both.** Every scheduled thing carries:

- **`scheduledAt`** — a UTC `Date`, canonical for arithmetic, ordering and
  range queries.
- **`localDate`** — a `String` `YYYY-MM-DD` in **Jalali**, plus **`localTime`** —
  `HH:mm`, for display, day grids, and uniqueness.

**Why both, and why the local date is a string.** The day grid asks "everything
on ۱۵ مهر" — that is a string equality on `localDate`, which is indexable and
exact. Deriving it from `scheduledAt` at read time means every such query depends
on the server's timezone being correct, which it will not always be. Conversely,
"the next 7 days" and "sort by time" are arithmetic on `scheduledAt`.

The string form matters because a Jalali date has no native database type. A
string sorts correctly, compares exactly, and — unlike a computed value — cannot
drift when a runtime's ICU data changes (ADR-0010).

**Consequences accepted.**

- Two columns to keep consistent on write. Mitigated by computing both in one
  helper at the single point of write, never in a caller.
- A stored `localDate` that disagrees with `scheduledAt` is a data defect. The
  nightly reconciliation checks for it and fails loudly.
- Never derive a date at render time; use the stored value
  (`05-conventions.md` §8).

**Documented in.** `03-data-model.md` §3.2.

---

## ADR-0010 — Jalali conversion in-house, not `Intl`

**Status:** Accepted · Phase 0

**Context.** Every date the product displays is Jalali. The conversion can come
from `Intl.DateTimeFormat('fa-IR-u-ca-persian')`, from a third-party plugin, or
from in-house arithmetic.

**Decision.** **In-house**, in `src/core/localization/jalali.ts`, converting
through the Julian Day Number with an explicit leap-year break table.
`Intl` is used **only inside the test suite**, as a cross-check.

**Why not `Intl` at runtime.** Its output depends on the ICU data bundled with
the Node runtime, which differs between a developer's machine, the SaaS host and
a clinic's on-premise server. A date that renders as one Jalali day on the build
machine and another on the clinic's machine is precisely the failure this product
cannot afford: a clinic acting on the wrong day. Pinning ICU is not a solution
the vendor controls on a customer's server.

**Why not a plugin.** The specification rejects jQuery-era plugin dependencies.
The conversion is a few hundred lines of pure, testable arithmetic and it is core
to every screen. Owning it is cheaper than depending on it.

**Consequences accepted.**

- The correctness burden is ours. Mitigated by the test obligations in
  `07-localization.md` §6.3: a 200-year round-trip property test, anchor vectors,
  and an ICU cross-check across the whole supported range. If a future Node
  version changes ICU, the cross-check fails loudly rather than a screen silently
  changing.
- The supported range (۱۳۹۰–۱۴۵۰) is asserted explicitly rather than assumed.
- The algorithm, the 33-year cycle and the break table must be documented, which
  they are.

**Documented in.** `07-localization.md` §6.

---

## ADR-0011 — The treatment cycle is an independent entity

**Status:** Accepted · Phase 0

**Context.** A customer who buys a six-session laser course has a relationship
that spans months. It could be modelled as fields on each appointment
(`sessionNumber`, `totalSessions`, `nextDueDate`), or as its own entity that
appointments link to.

**Decision.** **`TreatmentCycle` is an independent entity.** Appointments
reference it; it does not live on them.

**Why.** The specification says the mechanism that separates this platform from a
calendar is the cycle. Modelling it as fields on appointments makes the cycle a
derived property of whichever appointment you happen to be looking at, which
breaks in three concrete ways:

- **The interval is a property of the cycle, not the service.** The specification
  is explicit: «فاصله از دوره خوانده میشود، نه از تعریف خدمت». If a clinic later
  changes a service's default interval from 28 to 21 days, every in-flight course
  must keep its original schedule. With fields on appointments there is nowhere
  to record the cycle's own interval, and a settings change silently reschedules
  dozens of customers.
- **The cycle must be findable when there is no appointment.** The contact list
  is exactly "cycles that are due with no future appointment". If the cycle only
  exists inside appointments, a customer with no upcoming appointment has no
  cycle to find — which is the case the list exists to catch.
- **The cycle has its own state and lifecycle** — active, completed, abandoned
  with a reason, current session number, next due date — none of which belongs to
  any single appointment.

**Consequences accepted.**

- One more entity, one more join, and cycle creation must be transactional with
  the appointment's transition to `COMPLETED`.
- Creation happens at exactly one transition and must be idempotent, because a
  retried completion must not create a second cycle
  (`10-testing-strategy.md` §3.2).
- The contact list query is over cycles, which is why
  `cycle_tenant_status_due_idx (tenantId, status, nextDueDate)` exists.

**Documented in.** `03-data-model.md` §2.4.

---

## ADR-0012 — An audience group is a query, not a stored list

**Status:** Accepted · Phase 0

**Context.** A campaign targets a group such as "customers whose birthday is in
Mehr". This can be materialised — a table of group members refreshed nightly — or
evaluated as a query at read and send time.

**Decision.** **A group is a saved predicate, evaluated on demand, with a nightly
refresh only for the cached count.** No membership table.

**Why.** A stored list is a snapshot, and a snapshot goes stale in exactly the
way that causes a visible error: a customer who revokes consent at 10am is still
in last night's list at 2pm, and the campaign messages her. A query evaluates
consent, dedupe and the audience predicate **at the moment of send**, so the
latest state always wins.

It also removes a whole class of drift: there is no membership table that can
disagree with the predicate that generated it, and no reconciliation job to
repair that disagreement.

**Why the count is cached anyway.** The campaign builder shows a live count, and
counting a predicate over the full customer table on every keystroke is wasteful.
The nightly job computes and stores the **count only** — never the membership.
The count is a display convenience; the send always re-evaluates the predicate.

**Consequences accepted.**

- Larger predicates may be slower at send time than reading a list. Mitigated by
  the index coverage map in `03-data-model.md` §2.6: every built-in group has an
  index that serves it.
- The displayed count can be up to a day stale. Accepted and expected — the
  specification's own scenario has the assistant report «۳۴ نفر».
- The predicate builder must be a closed, typed construction so a clinical field
  cannot be expressed in it (immutable rule 3), verified by a type-level test.

**Documented in.** `03-data-model.md` §2.6, `09-security.md` §9.

---

## ADR-0013 — No `debts` table; the debt list is served by the appointment index

**Status:** Accepted · Phase 0

**Context.** The product has a debt surface with four buckets. Immutable rule 8
says the balance is computed, never stored, and rule 7 says debt deletion does
not exist. A `debts` table would be the conventional implementation.

**Decision.** **There is no `debts` table.** A debt is an appointment with an
outstanding computed balance. The debt list is a query over appointments, served
by `appt_tenant_status_sched_idx (tenantId, status, scheduledAt)`.

**Why no table.** A debt row is a **stored conclusion** — the very thing rule 8
forbids. It would need to be created when a balance becomes non-zero and removed
when it reaches zero, which means a job that decides when a debt begins and ends,
and a table that can disagree with the ledger. It would also create a delete
path, which rule 7 forbids: the moment a debt is a row, someone will need to
remove it, and the way they remove it will be a delete.

With no table, "debt deletion does not exist" is **structural**, not a promise.
There is nothing to delete.

**Why the appointment index serves it.** The balance is due a grace period after
the appointment, so `dueDate = scheduledAt + grace` is **monotonic** in
`scheduledAt`. That means the four buckets — current, 1–30 days overdue, 31–90,
over 90 — are four **ranges** on a single ordered column, and one index on
`(tenantId, status, scheduledAt)` serves all four. No separate index is needed,
and adding one would be an index that duplicates a range scan the planner already
does well.

**Consequences accepted.**

- Every debt query joins appointments to payments. Mitigated by
  `payment_tenant_customer_paid_idx` and by the appointment index above.
- A future change to the grace period changes bucket boundaries, not the schema.
  A query change only.
- The recomputable totals in ADR-0014 exist because of this — the aggregate
  cannot be read from a table, so it is cached and reconciled.

**Documented in.** `03-data-model.md` §4.3.

---

## ADR-0014 — Recomputable charge and payment totals alongside a computed balance

**Status:** Accepted, provisional · Phase 0

**Context.** This is the one point in the design where immutable rule 8 and a
performance requirement pull against each other, and it is raised as **OQ-3** in
the Phase 0 report.

Rule 8: the balance is computed, never stored. The «بدهکاران» audience group,
however, must filter customers by whether they owe money, and doing that
correctly means aggregating every appointment and every payment for every
customer — a query that grows with the clinic's entire history.

**Decision.** Store **`chargedTotal` and `paidTotal`** on the customer as a
**recomputable cache of ledger facts**, and continue to compute the **balance**
at read time as `chargedTotal − paidTotal`. The cache is reconciled nightly, and
a mismatch fails loudly.

**Why this does not violate rule 8.** Rule 8 forbids storing *the balance* —
a derived conclusion that can disagree with the ledger it came from. `chargedTotal`
and `paidTotal` are **sums of ledger facts**, each of which is itself append-only
and auditable. The balance is still computed, still never stored, and still
reproducible from the payment and appointment records alone. If the cache is lost
entirely, nothing is lost — it is recomputable in one query.

**Why it is still provisional.** It is a compromise, and the specification did
not explicitly authorise it. The honest framing: it is a cache, the balance is
not stored, and the nightly reconciliation makes drift loud rather than silent.
**This should be confirmed by the specification's author**, which is why it is
OQ-3 and why this ADR is marked provisional rather than accepted outright.

**If the answer is no.** The cache is removed, the audience group's predicate
becomes a live aggregate, and the `بدهکاران` group is documented as the one slow
group. Nothing else changes; no other decision depends on the cache.

**Consequences accepted.**

- A nightly reconciliation job, which fails loudly on drift
  (`05-conventions.md` §7).
- Two denormalised columns that must be updated in the same transaction as the
  payment or charge that changes them.
- A reviewer seeing the columns will ask why; this ADR is the answer, including
  the honest note that it is provisional.

**Documented in.** `03-data-model.md` §4.3, `reports/phase-00-report.md` (OQ-3).

---

## ADR-0015 — A modular monolith with barrel imports and a 1000-line limit

**Status:** Accepted · Phase 0

**Context.** The product has 20 functional areas and 35 pages. The structure can
be feature modules, layers (controllers/services/repositories), or a monolith
with no enforced boundaries.

**Decision.** **20 feature modules** under `src/modules/<name>/`, each with the
same internal contract (`components/`, `lib/`, `validation/`, `types/`, `hooks/`,
`api/`, `tests/`, `index.ts`), imported **only through the barrel**. `src/app/`
is thin routing. **No file exceeds 1000 lines**, enforced by CI.

**Why feature modules and not layers.** A layered structure puts one feature's
logic in four directories and makes a change touch all of them. A feature module
makes a change local, makes deletion possible, and makes ownership clear.

**Why the barrel is enforced.** A module's public surface should be a decision.
Without the rule, everything is public by accident and a refactor inside one
module breaks three others.

**Why the 1000-line limit.** It is a proxy for "one file, one responsibility",
and unlike the principle it is mechanically checkable. When a file reaches the
limit, it is split **by responsibility**, guided by the module's own subfolders —
never by taking the bottom half.

**Consequences accepted.**

- Some duplication between modules where a layer would have shared code. Accepted
  — `core` exists for genuinely shared logic, and premature sharing couples
  modules.
- The rule must be enforced by tooling, not memory: an ESLint
  `no-restricted-imports` pattern and a CI file-length check, both wired in
  Phase 1.

**Documented in.** `02-architecture.md` §6–§10, `05-conventions.md` §4.

---

## ADR-0016 — The immutable rules and the constant sets are amended only by ADR

**Status:** Accepted · Phase 0

**Context.** `06-constants.md` §1 records the ten immutable rules from the
specification, and §4 records closed sets — the 16 permissions, the 8 appointment
statuses, the 8 campaign types, the 8 audience groups, the 7 automatic messages,
the 8 behavioral toggles. These are the product's invariants.

**Decision.** **Any change to §1 or §4 of `06-constants.md` requires a new ADR**
that states which rule or member changes, what breaks, and why. The change is not
made by editing the constants file, and not by a pull request that happens to
touch it.

**Why.** These sets are load-bearing. The 16 permissions define the permission
matrix test suite; adding a 17th permission without one is an unverified
permission. The 8 appointment statuses define the lifecycle and the day grid's
colours. The 8 audience groups each have an index that serves them. A silent
addition produces a product that is subtly inconsistent in a way no test catches,
because the test was written against the old set.

**What this specifically prevents.** A developer adding an appointment status
without adding it to the lifecycle tests, the design system's status colours, and
the localization catalog. A developer adding a permission without adding positive
and negative tests for all three roles. A developer adding an audience group
whose predicate has no index.

**Consequences accepted.**

- A slightly heavier process for a small change. Accepted — the alternative is
  discovering the inconsistency in production.
- The CI checks in `10-testing-strategy.md` §12 exist because of this ADR: every
  enum member must have a label, every permission must have a negative test,
  every status must have a design-system colour.

**Documented in.** `06-constants.md` §1 and §7.

---

## ADR-0017 — The public site has eight pages

**Status:** Accepted, provisional · Phase 0

**Context.** The specification states «شش صفحه» (six pages) for the public site
in one section and lists eight in another. The text file's tables were damaged by
PDF extraction, so the discrepancy cannot be resolved from that section alone.
This is **OQ-1** in the Phase 0 report.

**Decision.** **Eight pages** — home, services, service detail, booking, doctors,
about, contact, panels — matching the structure of the supplied demo, which is
the rendered and therefore authoritative source.

**Why the demo wins.** Where the specification's extracted tables and the demo
disagree, the demo is the artefact someone actually built and reviewed, and it
has been the correct tiebreaker once already in this project (the permission
matrix, and the behavioral toggles — see OQ-2). The narrative sections of the
specification describe eight distinct public surfaces: a home, a service list, a
service detail with price and session count, a booking flow, a doctor list, an
about, a contact, and a panel-entry page.

**Why provisional.** The count is stated as six in one place, and the difference
is not a typo that can be argued away — it is either a spec that changed and was
not fully updated, or two pages that were merged. **The specification's author
should confirm.** The cost of being wrong is one extra or one missing page, and
the affected phase is Phase 8.

**Consequences accepted.**

- If the answer is six, two pages are merged and the Phase 8 effort range narrows
  slightly. No architectural consequence — `public-site` owns all of them either
  way, and the page → module mapping changes by two rows.

**Documented in.** `reports/phase-00-report.md` (OQ-1), `02-architecture.md` §9.

---

## ADR-0018 — The customer panel is a separate identity with no parameterised scoping

**Status:** Accepted · Phase 0

**Context.** The customer panel shows a customer their own appointments, cycle
progress, payments and consent. The conventional implementation is
`/account/appointments?customerId=...`, scoped by an ownership check.

**Decision.** **No customer-scoped route accepts a customer identifier.** The
customer is resolved from the session, and the query is scoped by that resolved
identity. A request **cannot express** another customer.

**Why.** An ownership check is a check that can be forgotten. If the identifier
is not a parameter, there is no route that can be called with the wrong one, and
no future refactor can drop the check because there is no check to drop — the
data is scoped at the query, from a value the caller cannot influence.

This is the same reasoning as ADR-0005 for tenants, applied one layer down:
resolve, never receive.

**What it prevents.** The entire class of IDOR bug in the customer panel — the
most exposed surface in the product, because customers are outside the
organisation and a mobile number is guessable.

**Consequences accepted.**

- A customer cannot share a link to their own appointment; there is no shareable
  URL. Accepted — the product has no such requirement, and the alternative is a
  signed token, which can be added later without weakening this rule.
- Staff viewing a customer's data use the staff surfaces, which are governed by
  the permission matrix and the ownership scoping in `09-security.md` §6.3 —
  a doctor requesting another doctor's patient receives **404**, not 403.

**Documented in.** `09-security.md` §7, `10-testing-strategy.md` §6.4.

---

## Adding a decision

1. Take the next number. Never reuse or renumber.
2. Write it in the same shape: **Status · Context · Decision · Why · Consequences
   accepted · Documented in.**
3. Include the alternatives **rejected** and the reason. A decision without a
   rejected alternative is a preference, not a decision.
4. State the consequences honestly, including the ones that are costs. An ADR
   with no downside is an ADR that has not been thought through.
5. Add it to the index.
6. If it changes an earlier decision, the new ADR **supersedes** it — set the old
   one's status to `Superseded by ADR-XXXX` and leave its text untouched.
7. Commit it with `docs(adr): ...`.
