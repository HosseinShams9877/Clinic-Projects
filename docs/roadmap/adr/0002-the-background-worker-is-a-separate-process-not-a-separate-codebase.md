# ADR-0002 — The background worker is a separate process, not a separate codebase

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

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
