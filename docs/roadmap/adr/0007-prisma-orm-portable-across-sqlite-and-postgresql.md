# ADR-0007 — Prisma ORM, portable across SQLite and PostgreSQL

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

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
