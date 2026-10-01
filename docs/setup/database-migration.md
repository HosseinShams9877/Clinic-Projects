# Setup — Database and Migration

> One Prisma schema that compiles for **SQLite in development** and
> **PostgreSQL in production** (ADR-0007). This document records what that
> constrains, what is avoided and why, how the two environments stay in step, and
> how to move between them.

---

## 1. Why two engines

| | Development | Production |
|---|---|---|
| Engine | **SQLite** | **PostgreSQL** |
| Install | none — a file | a service |
| Speed of a fresh setup | seconds | minutes |
| Row-level security | **not available** | available (ADR-0003) |
| Concurrency | single writer | full |
| Tenancy enforcement | application layer only | application layer **and** RLS |

Development uses SQLite because a developer should not install a database server
to fix a CSS bug. Production uses PostgreSQL because tenant isolation needs RLS
as a genuine second layer, not as a promise.

**The schema is one schema.** There is no `schema.dev.prisma` and no
`schema.prod.prisma` — two schemas drift, and the drift is discovered in
production. The cost of one schema is the avoided-feature list in §3.

**A production boot against SQLite refuses to start**, and so does a boot with
RLS disabled on a tenant-scoped table (`10-testing-strategy.md` §6.5). The
failure is loud at boot rather than quiet at runtime.

---

## 2. The migration path, in order of authority

```
1. prisma/schema.prisma          the single source of truth
2. prisma/migrations/            generated SQL, committed, never edited by hand
3. prisma/migrations-pg/         the PostgreSQL-specific additions (RLS, policies)
4. npm run db:migrate            apply to SQLite (development)
5. npm run db:migrate:pg         apply to PostgreSQL (production, CI, isolation tests)
```

**Migrations are committed.** They are never generated on the deployment machine
and never edited after they have been applied anywhere. A migration that has run
in production is immutable; a correction is a new migration.

**Prisma `migrate dev` is a development tool.** Production uses `migrate deploy`,
which applies committed migrations and never attempts to reconcile schema drift
(`deployment.md` §5).

---

## 3. The avoided features, and what replaces each

This is the enforceable list. Each entry is a rule, not a suggestion: a
PostgreSQL-only feature in the schema is a defect, because it makes the schema
compile on one engine and not the other (ADR-0007).

| Avoided | Why it does not port | What is used instead |
|---|---|---|
| **Native `enum`** | SQLite has no enum type; Prisma emits a migration SQLite cannot apply | A `String` column, an `as const` object in `06-constants.md` §4, and a Zod schema at every boundary |
| **Arrays** (`String[]`) | Not supported on SQLite | A join table, with the relationship modelled explicitly |
| **`Json` / `JSONB`** | PostgreSQL-specific; SQLite has no JSON column type | A `String` column holding JSON, **parsed through Zod at the boundary** — never trusted, never queried in SQL |
| **`@db.Citext`** | An extension; not available | A normalised comparison column (for example `searchName`, lowercased and normalised) |
| **Full-text search** | `tsvector` is PostgreSQL-only; SQLite's FTS5 is a different feature | A normalised `searchName` column with `LIKE` and an index |
| **`CREATE INDEX CONCURRENTLY`** | PostgreSQL-only, and cannot run inside a transaction | A plain index inside the migration transaction. Accepted cost: a brief lock during a production migration |
| **Database-generated ids** (`uuid()`, `auto()`) | Generation differs per engine, and UUID generation on SQLite is not native | **Ids generated in the application** (cuid), so the id exists before the insert and is identical on both engines |
| **`@db.Timestamp` / timezone-specific types** | Type mapping differs | `DateTime` (UTC) plus the Jalali `localDate` string (ADR-0009) |
| **Partial indexes** (`WHERE` clause) | Not supported on SQLite | **One** sanctioned exception, below |
| **Generated columns** | Support and syntax differ | Computed in the application |

### 3.1 The one sanctioned escape hatch

**Exactly one partial-index need exists**: the appointment slot uniqueness
constraint, which must apply to real slot bookings and must **not** apply to slot
blocks (a closed hour is not a booking and must not collide with one).

It is represented portably as a **plain unique index over a nullable `slotKey`
column**:

```
appt_slot_unique   UNIQUE (tenantId, doctorId, slotKey)
```

`slotKey` holds the slot's identity for a real booking and is **NULL** for a slot
block. NULL is not compared in a unique index on either engine, so an unlimited
number of blocks may coexist on the same slot, and exactly one booking may exist
per slot. The semantics are identical on SQLite and PostgreSQL.

**A second escape hatch is a decision, not a drift.** Adding one requires an ADR
(ADR-0016).

---

## 4. The PostgreSQL additions

These live in `prisma/migrations-pg/` and are applied only to PostgreSQL. They
add nothing to the data model — they are the isolation layer.

**Per tenant-scoped table:**

```sql
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "customers"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
```

Three details that matter, all from `09-security.md` §4.1:

- **`FORCE`**, not just `ENABLE`. A table's owner bypasses policies by default,
  and the application typically connects as the owner.
- **`current_setting(..., true)`** — the second argument returns NULL rather than
  raising when the setting is unset. `tenantId = NULL` is never true, so a query
  without a tenant context returns **zero rows**: it fails closed.
- **`WITH CHECK` as well as `USING`**, so a write cannot insert a row belonging to
  another tenant.

**Applied at the start of every transaction:**

```sql
SELECT set_config('app.tenant_id', $1, true);
```

- **Not `SET LOCAL`.** `SET LOCAL` cannot take a bind parameter, so it would
  require interpolating the tenant id into SQL text — reintroducing the injection
  surface the design exists to remove.
- **The third argument `true`** scopes the setting to the transaction, which is
  what makes it correct under connection pooling: the setting cannot leak to the
  next request that reuses the connection.

**The policy is generated for every tenant-scoped table**, and a CI check asserts
that a new table with a `tenantId` column has a policy. A table without one is a
security defect, not a missing nicety.

---

## 5. Running migrations

### Development (SQLite)

```bash
npm run db:migrate        # prisma migrate dev — creates and applies
npm run db:reset          # drop, re-create, re-seed — destroys development data
npm run db:studio         # browse the data
```

`db:reset` is safe **only** in development. It refuses to run against a
PostgreSQL URL.

### Production (PostgreSQL)

```bash
npm run db:migrate:pg     # prisma migrate deploy, then the RLS migrations
```

`migrate deploy` applies committed migrations in order and records them. It does
**not** generate, does not reset, and does not reconcile drift — if the database
disagrees with the migration history, it fails, and a human decides what to do.

**Migrations run before the new application version starts**, in the deployment
sequence in `deployment.md` §5. A migration must be **backwards compatible with
the previous application version**, because during a rolling deploy both versions
run against the same database:

- **Adding a column** must be nullable or have a default.
- **Renaming** is three steps across three releases: add the new, write both,
  then remove the old.
- **Dropping** happens only after no running version references the column.

---

## 6. Moving a development database to PostgreSQL

Not a production procedure — a convenience for testing against the production
engine.

```bash
npm run db:migrate:pg                 # create the schema
npm run db:export -- --to json        # export from SQLite
npm run db:import -- --from json      # import into PostgreSQL
npm run db:verify                     # compare row counts and balances
```

`db:verify` recomputes every customer's balance from the ledger on both engines
and compares. A mismatch fails the import — it means the two engines disagree,
which is exactly what this path exists to detect.

**Types that need care in the export:** `BigInt` (exported as a string, imported
as `BigInt`), `DateTime` (exported as ISO-8601 UTC), and the `localDate` string
(copied verbatim — never recomputed, because recomputation is where a
timezone bug enters, ADR-0009).

---

## 7. Moving to a new production server

The supported path for a clinic changing machines, and for a SaaS tenant moving
between hosts.

```bash
# On the source — a consistent snapshot
pg_dump --format=custom --file=clinic.dump "$DATABASE_URL"

# On the target
createdb clinic
pg_restore --dbname=clinic --clean --if-exists clinic.dump
npm run db:migrate:pg          # apply any migrations newer than the dump
```

**The RLS policies are re-applied by the migration step, not carried by
`pg_restore`.** A restored database without policies is a database where every
tenant can read every other tenant, and it will look fine until someone queries
it. `npm run db:migrate:pg` re-emits them, and the isolation suite must be run
against the restored database before it serves traffic.

**Verification after any restore, without exception:**

```bash
npm run test:isolation         # against the restored database
npm run db:verify-balances     # recompute and compare
```

---

## 8. Migration rules for the team

1. **The schema is one file.** A second schema file is a defect (ADR-0007).
2. **No native enum, no array, no JSON column, no `citext`.** §3 is the list.
3. **`BigInt` for money, `DateTime` for instants, `String` for the Jalali date.**
   Never a `number` near an amount, never a computed date at read time.
4. **Every tenant-scoped table gets a policy** in the same migration that creates
   it.
5. **Migrations are backwards compatible** with the previous application version
   (§5).
6. **Every index has a stated query**, with the exact column order and
   `tenantId` as the leading column (`03-data-model.md`). An index without a
   query is dropped.
7. **Never edit an applied migration.** Correct it with a new one.
8. **Never run `db:reset` against PostgreSQL.**

---

## 9. Portability verification

Two checks in CI keep the portability honest.

**Schema portability.** The migration list is applied to a fresh SQLite database
and a fresh PostgreSQL database on every pull request. If a migration uses an
engine-specific feature, the engine that cannot apply it fails the build —
before the developer finds out on the clinic's server.

**Behavioural portability.** A subset of the integration suite runs against both
engines, and the results are compared. The cases that matter: `BigInt` round
trips, the Jalali `localDate` string comparison and ordering, the nullable
`slotKey` uniqueness semantics, and the `LIKE` search. Anything that behaves
differently on the two engines is either fixed or added to §3 with a replacement.

**The isolation suite runs on PostgreSQL only**, because SQLite has no RLS to
test (`09-security.md` §5). That asymmetry is deliberate and documented: it is
the reason production is PostgreSQL.

---

*Related: `installation.md` (development setup), `deployment.md` (production),
`../knowledge/03-data-model.md` §5 (the portability constraints),
`../knowledge/09-security.md` §4 (the RLS design), ADR-0003, ADR-0007,
ADR-0009.*
