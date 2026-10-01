# 01 — Technology Stack

> This document is the technology decision of record. It is binding for every
> later phase. Any change requires an ADR in `/docs/roadmap/decisions.md`.

---

## 1. Summary of the decision

| Layer | Choice |
|---|---|
| Application framework | **Next.js (App Router)** — full-stack, single deployable |
| Language | **TypeScript**, strict mode |
| Data access | **Prisma ORM** |
| Database (development) | **SQLite** |
| Database (production / on-premise) | **PostgreSQL** |
| UI | **React Server Components + Client Components**, CSS variables from the design system |
| Styling | CSS Modules + the token block in `docs/knowledge/08-ui-design-system.md` |
| Background jobs | **A separate lightweight Node.js worker process** (see §4) |
| Authentication | Session-based, httpOnly cookie, `next-auth` (Credentials + OTP) |
| Validation | **Zod**, shared between client and server |
| Tests | **Vitest** (unit/integration), **Playwright** (e2e/a11y/responsive) |
| Fonts | **Vazirmatn**, self-hosted with `next/font/local` |
| Dates | **Jalali**, computed in-house in `src/core` (no jQuery-era plugins) |

**Decision: Option B — Next.js full-stack — is adopted, with exactly one
exception: a separate background worker process.**

---

## 2. The comparison

### Option A — Node.js backend as a separate service + Next.js frontend

A standalone HTTP API (Express / Fastify / NestJS) owns the domain, the
database, and the sessions. Next.js is reduced to a rendering client that
talks to that API.

### Option B — Next.js full-stack (App Router + Route Handlers + Server Actions)

One deployable. Server Components read directly from the data layer; Server
Actions and Route Handlers perform writes. The domain logic lives in
`src/modules/*`, imported by route handlers and server components alike.

### 2.1 Dimension-by-dimension

| Dimension | Option A (separate API) | Option B (Next.js full-stack) | Winner for *this* product |
|---|---|---|---|
| **Deployment complexity and cost** | Two deployables, two ports, two health checks, CORS policy, a reverse proxy, two sets of env vars, two build pipelines. On-premise: the clinic's IT (often a single technician) installs two services. | One deployable, one port, one health check, no CORS, one build, one env file. On-premise: one artifact to copy and one service to start. | **B** — decisive. The on-premise channel is a first-class delivery mode here, and halving the install surface materially reduces support load. |
| **Latency between frontend and backend** | Every read is at minimum one extra network hop (browser → Next server → API → DB). Server-rendered pages pay it twice unless the Next server proxies with caching that then has to be invalidated. | Server Components query the database in-process. A dashboard render is one hop: browser → Next server → DB. | **B** — the product's screens are data-dense (day grids, کارتابل, cycle lists) and are rendered many times per day per user. |
| **Type safety end-to-end** | Requires a shared types package or code generation (OpenAPI → client, tRPC, GraphQL codegen). The contract can drift silently; drift is discovered at runtime. | Prisma generates types from the schema; modules export their own types; Server Components and Server Actions consume them directly. A schema change that breaks a caller is a compile error. | **B** — a small team cannot afford to maintain a hand-synchronised contract layer. |
| **Authentication and session management** | The API owns sessions; Next must forward cookies or tokens, and every protected page needs the auth state re-derived. Two places to get auth wrong. | One session, one place to read it. `middleware.ts` gates routes; the module layer re-checks server-side (see `09-security.md` — hiding UI is not security). | **B** — one enforcement point is auditable; two are not. |
| **Multi-tenant isolation guarantees** | The tenant must be resolved in the API *and* re-verified when Next passes a `clinicId` through. Any client-supplied identifier crossing that boundary is a leak vector. | The tenant is resolved once from the session, server-side, and never accepted from the client. RLS still enforces at the engine level. Fewer boundaries means fewer places a `tenantId` can be dropped. | **B** — the isolation boundary should be as short as possible. |
| **Scalability ceiling** | Higher ceiling in principle: the API tier scales independently and can be polyglot. Relevant at very large scale or with a genuinely heavy compute tier. | Next.js scales horizontally like any Node service. The ceiling is far above what this product needs (see §3). | **Tie, practically.** Option A's advantage is real but unreachable at this product's scale. |
| **Team size and skill requirements** | Needs someone who owns API architecture, contracts, and cross-service ops. Realistically 4–6 engineers. | One competent full-stack TypeScript developer is productive. 2–3 engineers. | **B** — the stated context is a small team. |
| **Operational overhead (monitoring, logging, secrets)** | Two services: two log streams to correlate, two APM targets, two secret stores, distributed tracing to follow a request. | One service: one log stream, one APM target, one secret surface. Correlation is a stack trace, not a trace ID. | **B** — correlation cost is paid on every incident. |
| **Suitability for on-premise single-tenant delivery** | Poor. The clinic runs two processes, or you ship a bundled container and explain it. Version skew between the two services is possible on a machine you do not control. | Strong. One process, one port, one `MULTI_TENANT=false` env var (see `02-architecture.md`). Upgrades replace one artifact. | **B** — this is the strongest single argument. |
| **Suitability for multi-tenant SaaS delivery** | Good — and the conventional choice for very large SaaS. | Good. One database, `tenantId` on every row, RLS at the engine, connection pooling per tenant context. | **Tie.** Both are viable; B is sufficient and cheaper to run. |
| **Long-term maintenance cost** | Two dependency trees to patch, two runtimes to upgrade, a contract layer to keep honest, two release trains to sequence. Every security advisory in a shared dependency must be applied twice, in order. | One dependency tree, one upgrade path. A Next.js major upgrade is a single coordinated change. | **B** — the compounding cost lands on a small team. |
| **Ecosystem maturity** | Very mature: Express/Fastify/NestJS are stable and well documented. | Mature and now conventional: App Router, Server Actions, and Route Handlers are production-standard; Prisma and next-auth are stable. | **Tie.** Both are safe bets in 2026. |

### 2.2 Where Option A would genuinely have won

To be honest about the trade-off — Option A is the better choice when at
least one of these holds:

- Several teams own separate surfaces and need independent release cadences.
- A non-TypeScript service is required (heavy image processing, ML inference, video).
- One tier needs a radically different scaling profile (e.g. a bursty media
  transcoder) and must not share a deployment with the request path.
- A public, versioned API is the *primary* product and the web app is one of
  many clients.

**None of these hold here.** This product has one codebase, one team, one
release train, and its clients are the clinic's own panels and the clinic's
own website. The only heavy, non-interactive work is scheduled — and that is
handled by the worker, not by splitting the request path.

### 2.3 The one thing Option A does better, and why it does not apply

Option A isolates long-running or bursty work from the web request path by
default. Option B does not — a careless Server Action could run a campaign
send inline and block a request.

**Mitigation, not a redesign:** all scheduled and bulk work is owned by the
background worker (§4). Server Actions are restricted to interactive,
sub-second operations. This is a written rule in `05-conventions.md` and is
enforced in review.

---

## 3. Why this product specifically

| Product fact | Consequence for the stack |
|---|---|
| Sold to **many clinics** (multi-tenant SaaS) | One deployable scales trivially across tenants; per-tenant cost stays low. |
| Also delivered **on-premise, single-tenant** | One artifact, one process, one env var. No CORS, no service discovery, no multi-container orchestration on a clinic PC. |
| **Small team** | One language, one repo, one build, one mental model. |
| **Persian, RTL, Jalali** | Entirely a presentation concern. It does not argue for or against a separate API — but it does argue for keeping the localization layer close to the components, which favours B. |
| **Clinic workflow is data-dense and interactive** | Latency matters on every render. In-process reads (B) beat a network hop (A). |
| **Scheduled work is the only heavy work** | Cycle next-due generation, automatic messages, nightly audience refresh, campaign dispatch. This is a *worker* problem, not an *API split* problem. |
| **No third-party API consumers today** | A separate API tier would have exactly one consumer: this app. |
| **Future mobile app is explicitly deferred** | When it arrives, it needs an API — which Route Handlers under `/api/v1` already provide from the same modules. No rewrite required. |

---

## 4. The single exception: the background worker

**Adopted: one separate lightweight Node.js worker process.**

### Why it must be separate

1. **Scheduled execution.** The audience groups are refreshed "each night"
   (spec §3), cycle next-due dates are computed on a schedule, and the seven
   automatic messages fire at defined offsets. These must run whether or not
   anyone has made a request. A Next.js server has no durable scheduler; a
   serverless deployment has no long-lived process at all.
2. **Long-running batches.** A campaign dispatch sends to an audience with a
   daily cap and an allowed sending window. That is a long job with retries,
   not a request.
3. **Idempotency and retry.** Jobs need to be retried, back-pressured, and
   resumed. That is a queue consumer, not a page render.
4. **Isolation of failure.** A failing SMS gateway call must not consume web
   request capacity or crash the web tier.

### Why it is *not* a second codebase

This is the critical constraint that keeps the decision consistent with §2:

- The worker is a **process**, not a project. It lives at
  `src/worker/` inside the same repository, build, and dependency tree.
- It imports the **same modules** (`src/modules/cycles/lib/*`,
  `src/modules/campaigns/lib/*`, `src/modules/notifications/lib/*`) that the
  web tier imports. There is no duplicated business logic and no second
  contract to maintain.
- It uses the **same Prisma schema** and the **same migrations**.
- It uses the **same tenant model**: it runs in a system context with an
  explicit tenant scope per job, mirroring `09-security.md` §7.
- It ships in the **same release**. Version skew between worker and web is
  structurally impossible.

### Why not a queue/broker product

Redis + BullMQ, or SQS, or a hosted scheduler, would each add an external
dependency that must also be installed and operated on-premise. The worker
therefore uses a **database-backed job table** (claim-with-`UPDATE …
WHERE status = 'PENDING'` semantics) so that the on-premise install needs
nothing beyond PostgreSQL. If scale ever demands a broker, the job-table
interface is the seam to swap — this is recorded as an ADR.

### Why not Next.js cron / `vercel.json` crons

Vendor-specific, unavailable on-premise, and no retry semantics. Rejected.

---

## 5. Rejected alternatives (recorded, not silently dropped)

| Alternative | Why rejected |
|---|---|
| Separate NestJS API | §2. Doubles the on-premise install surface for a single-consumer API. |
| tRPC between a custom API and Next | Still two deployables; adds a codegen-ish layer that Option B gets for free from Prisma types. |
| Remix / React Router framework | Viable, but a smaller hiring pool and a less mature server-action story for this Persian RTL admin-heavy surface. |
| SvelteKit | Same reasoning; also a smaller local talent pool. |
| Django / Laravel backend + Next frontend | Two languages, two runtimes, two deploy pipelines — maximally wrong for this team size. |
| Microservices | Wildly disproportionate to 7 entities and 35 pages. |
| MongoDB | The data is deeply relational (customer → appointments → payments → cycles) and the billing rule ("balance is computed, never stored") needs transactional aggregation. Rejected. |
| GraphQL | Adds a schema and resolver layer for exactly one client. Rejected. |
| Serverless-first (Vercel functions only) | The on-premise channel is mandatory and a long-running worker is required. Rejected as the *primary* model — though the web tier remains serverless-deployable if a future tenant is cloud-only. |

---

## 6. Consequences and obligations

Adopting Option B creates these standing obligations. They are checks in
`05-conventions.md` and gates in the phase Definitions of Done:

1. **Server Actions must stay short.** Anything over ~1s or touching an
   external gateway in bulk belongs in the worker.
2. **Module boundaries are the substitute for service boundaries.** With no
   network call to separate concerns, discipline must come from the module
   structure and the barrel imports (`02-architecture.md` §4). Deep
   cross-module imports are forbidden.
3. **The permission check lives in the module, never in the page.** Because
   the same module is called by pages, server actions, and the worker, the
   check must sit at the module layer or it will be bypassed somewhere.
4. **The worker is deployed with the web tier, always.** Any release process
   that ships one without the other is a defect.
5. **`MULTI_TENANT` is read once, at startup, and never at request time.**
   See `02-architecture.md` §3.

---

## 7. Version policy

- Node.js: current LTS, pinned in `.nvmrc` and `package.json` `engines`.
- Next.js, React, Prisma, TypeScript: pinned exactly (no `^`) in
  `package.json`; upgraded deliberately, one dependency at a time, with the
  full test suite green.
- Vazirmatn: pinned version, self-hosted, no Google Fonts CDN request at
  runtime (see `07-localization.md`).

---

*Related: `02-architecture.md` (multi-tenant and module architecture),
`09-security.md` (isolation and enforcement), `roadmap/decisions.md`
(ADR-0001 the stack, ADR-0002 the worker boundary).*
