# ADR-0004 — Single-tenant mode as a runtime flag, not a fork

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

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
