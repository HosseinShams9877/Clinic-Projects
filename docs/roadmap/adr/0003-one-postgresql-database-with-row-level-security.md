# ADR-0003 — One PostgreSQL database with row-level security

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

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
