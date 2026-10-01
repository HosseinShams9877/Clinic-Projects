# ADR-0001 — Next.js full-stack as a single deployable

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

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
