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
| Client data fetching | **TanStack Query (React Query) v5** — see §8.1 |
| Icons | **Lucide (`lucide-react`)** — outline only, stroke overridden to 1.7 — see §8.2 |
| Headless UI primitives | **Radix UI** — behaviour and accessibility only — see §8.3 |
| Searchable select / command palette | **cmdk** — see §8.4 |
| Forms | **React Hook Form**, paired with Zod — see §8.5 |
| Animation | **Framer Motion**, used sparingly — see §8.7 |
| Background jobs | **A separate lightweight Node.js worker process** (see §4) |
| Authentication | Session-based, httpOnly cookie, `next-auth` (Credentials + OTP) |
| Validation | **Zod**, shared between client and server |
| Tests | **Vitest** (unit/integration), **Playwright** (e2e/a11y/responsive) |
| Fonts | **Vazirmatn**, self-hosted with `next/font/local` |
| Dates | **Jalali.** Arithmetic through **`date-fns-jalali`** (pinned); **all display formatting** through `src/core/localization` — see §8.6 |

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
- **Every library in §8 is pinned exactly**, for the same reason: a build must be
  reproducible and a compromised patch release must not arrive silently
  (`09-security.md` §15). This includes TanStack Query, Lucide, the Radix
  primitives, cmdk, React Hook Form, Zod, date-fns-jalali and Framer Motion.
- **Lucide is additionally pinned by stroke width**, not only by version: the
  wrapper in §8.2 asserts `stroke-width: 1.7`, so a Lucide minor release that
  changed its default would not silently change the product's icon language.
- Vazirmatn: pinned version, self-hosted, no Google Fonts CDN request at
  runtime (see `07-localization.md`).

---

## 8. UI and data libraries

> **The rule.** The design system in `docs/knowledge/08-ui-design-system.md`
> defines every component and every state. Components are built from that
> document. Headless primitives (Radix, cmdk) provide **behaviour only**. **No
> styled component library is used. No component framework's theme is allowed to
> override the design system tokens.**

Every library below is chosen to satisfy one of two constraints: it does work the
product would otherwise rewrite and get subtly wrong (behaviour, accessibility,
cache invalidation, calendar arithmetic), or it supplies nothing at all and
therefore cannot disagree with the design system. **A library that ships a visual
opinion is disqualified**, which is why shadcn/ui, Material UI, Chakra and Ant
Design are rejected in ADR-0021.

Every entry here is **pinned exactly** (§7), and **a new primitive is added to
this document before it is used in a component** (`05-conventions.md` §17).

### 8.1 TanStack Query (React Query) v5 — client-side data fetching

**Used for:** interactive surfaces, client-side caching, optimistic updates,
background refetching, polling, and dependent queries.

**Not used for:** initial page load, SEO-critical pages, and data that does not
change during the session. Those are Server Components — see §8.1.1.

**The surfaces that need it** — five, and they are the reason the library is in
the stack at all:

| Surface | Why it needs a client cache |
|---|---|
| **The appointment day grid** | The receptionist moves between days and doctors continuously. Every move must not be a full server round trip, and a reschedule must appear instantly. |
| **The cycle contact list** | A secretary works down it, recording a contact result per row. Each result must update the row in place and leave the list's counts correct, without a refetch per row. |
| **The debt list** | Bucket counts and the filtered list change as payments are recorded elsewhere in the panel. The list must be invalidated by the mutation that changes it, not reloaded on a timer. |
| **The campaign builder preview** | The audience count updates as the filter changes. This is the definition of a dependent query, and it is debounced. |
| **The notification feed** | Polls, and must be able to refetch on focus so a manager returning to the tab sees the current state. |

These are the surfaces where a Server-Components-only approach produces either a
full-page reload per interaction or a hand-rolled client cache. Both are worse
than a maintained one.

#### 8.1.1 Server Components vs React Query

The two are not alternatives and neither replaces the other. The split is by
**what the data is for**, not by where it comes from:

| Use a **Server Component** | Use **React Query** |
|---|---|
| The initial load of a page or a route segment | A surface the user interacts with repeatedly within one session |
| SEO-critical pages — all 8 of `public-site` | A list the user filters, sorts, or steps through without navigating |
| Data that does not change during the session — service copy, clinic identity, working hours | Data another actor can change while the user is looking at it |
| Data that must be correct at render time and is never re-read — a receipt, a confirmation | Polled data — the notification feed |
| Anything reachable only after a permission check that must happen before render | A count that depends on a filter the user is editing — the campaign preview |
| | Anything requiring an optimistic update — a reschedule, a contact result, a payment |

**The obligation this creates** is stated in `05-conventions.md` §16: the two
patterns must stay clearly separated, and a surface does not use both for the
same data. A Server Component that seeds a React Query cache is a finding, not a
convenience — it produces two sources of truth for one value.

### 8.2 Lucide (`lucide-react`) — the icon library

**Outline only, `fill: none`, `stroke: currentColor`, rounded linecap and
linejoin — matching `08-ui-design-system.md` §42 exactly.**

**The stroke width is overridden.** Lucide's default is `stroke-width: 2`; the
design system requires **1.7** (`08-ui-design-system.md` §42 and rule A7). Every
icon is therefore rendered through a single wrapper in
`src/core/components/icons` that sets `strokeWidth={1.7}`, `strokeLinecap="round"`,
`strokeLinejoin="round"`, `fill="none"`, and a size from the design system's size
scale (14 / 15–16 / 17 / 19 / 20 / 22–30). **A Lucide icon imported directly into
a component is a finding** — it would carry the default stroke and break the icon
language in a way that is visible but easy to miss in review.

| Design-system requirement | How Lucide satisfies it |
|---|---|
| Outline, `fill: none` | Lucide's default; asserted by the wrapper |
| `stroke-width: 1.7` | **Overridden** from Lucide's default of 2, in the wrapper only |
| Rounded linecap and linejoin | Lucide's default |
| Single colour via `currentColor` | Lucide's default; the wrapper adds no colour |
| **No filled, 3D, or multicolour icons** | Enforced by the wrapper's typed props — it exposes no `fill` or colour override |
| Inline SVG, not an icon font | Lucide renders React components producing inline `<svg>` |

**No icon font.** Rejected in ADR-0021: an icon font is a blocking network
request, cannot be tree-shaken, renders as text before the font loads, and cannot
carry per-icon stroke properties.

**Direction-aware mirroring** (`07-localization.md` §3.3) is applied by the
wrapper: direction icons (arrow, chevron, back, next) mirror in RTL; object icons
(phone, camera, clock face) never do.

### 8.3 Radix UI — headless behaviour primitives

**Used for:** dialog, popover, select, tooltip, dropdown menu, tabs — the
components whose *behaviour* is genuinely hard to get right: focus trapping,
focus restoration, escape handling, collision-aware positioning, typeahead,
`aria-*` wiring, and keyboard navigation.

**No styling comes from Radix.** Every Radix primitive is unstyled by design;
each is wrapped in `src/core/components/**`, given a CSS Module that consumes
only design-system tokens, and exported as the product's own component. Nothing
in `src/modules/**` or `src/app/**` imports `@radix-ui/*` directly.

**Only the primitives actually needed are installed** — not the full set, and not
a package that bundles one. Each installed package is the single primitive it
provides.

**This is not a component library.** Radix supplies the behaviour; the design
system supplies the appearance; `08-ui-design-system.md` §21 defines the modal's
560px max-width and 24px radius, and that is what the wrapper implements — not a
Radix default.

### 8.4 cmdk — the searchable select

**The product's searchable select is built on top of `cmdk`.** The design system
defines the control; cmdk supplies the filtering model, the keyboard interaction,
and the ARIA combobox wiring.

**Persian-aware search is added by us, on top of it.** cmdk's default filter is a
substring match on the raw string, which is wrong for this product in three ways
that `src/core/localization/normalize.ts` corrects before the filter runs:

- **Persian and Arabic letter variants.** A user typing `ي` (Arabic Yeh) or `ك`
  (Arabic Kaf) must find a record stored with `ی` and `ک`. Brand-name search
  forms actually produce the Arabic variants on some keyboards.
- **ZWNJ.** «سهشنبه» and «سه شنبه» are the same word to a reader and different
  strings to a filter.
- **Digits.** A user typing `۱۲۳` must find `123`. Typing either must work.

cmdk is **headless**; all styling comes from the design system tokens. The
component does not accept a custom `filter` prop from a module — the
Persian-aware filter is fixed inside the wrapper, so no caller can regress it.

### 8.5 React Hook Form and Zod — forms and validation

**React Hook Form is used for all forms**, paired with **Zod** for validation.
The Zod schema is defined once and **shared between the client and the server**,
so a form and its handler cannot disagree about what is valid.

- The client-side validation is a **convenience**: it gives the user immediate,
  Persian feedback. It is never the enforcement.
- **The server always re-validates** the same schema. A Server Action that trusts
  client validation is a defect (`05-conventions.md` §5).
- Schemas live in the module's `validation/` folder and are resolved through
  `@hookform/resolvers/zod`.
- **No input schema contains `tenantId`, `clinicId`, `userId` or `role`**
  (`05-conventions.md` §5). They are not fields.
- The shared Persian form shell (`src/core/components/form`) wraps both: field
  layout, the Persian label, the error slot, and RTL are defined once, and a
  module's form composes it rather than restating it.

Zod appears in the summary table under **Validation** because that is its primary
role in the stack; it is described here because its client-half obligation is a UI
concern.

### 8.6 date-fns-jalali — Jalali calendar arithmetic

**Used for conversion and arithmetic only.** Every date the product *displays* is
formatted by `src/core/localization`, so that Persian digits, the `٬` separator,
the month and weekday names, and the relative-date wording are identical on every
surface.

| Concern | Owner |
|---|---|
| Gregorian ↔ Jalali conversion, day/month/year arithmetic, month grids, week ranges | **`date-fns-jalali`**, pinned |
| Rendering a date as `۱۴۰۵/۰۶/۲۹` or «۲۹ شهریور ۱۴۰۵» | **`src/core/localization/format.ts`** |
| Persian digits and separators | **`src/core/localization/digits.ts`** |
| The week starting on **شنبه** | **`src/core/localization/calendar.ts`** |

**This supersedes ADR-0010.** Phase 0 decided the conversion would be in-house,
rejecting both `Intl` (ICU data varies by runtime) and third-party plugins. The
decision is revised in **ADR-0022**: `date-fns-jalali` is a pinned, pure-JavaScript,
tree-shakeable implementation with its own calendar data, so it does not carry
`Intl`'s runtime-dependence, and it is not the jQuery-era plugin class ADR-0010
rejected. ADR-0010's requirement that the *display* layer be ours is retained and
is the reason the table above splits conversion from formatting.

ADR-0010's test obligations are retained in full (`10-testing-strategy.md` §3.5):
the round-trip property test across 200 years, the anchor vectors, the explicit
۱۳۹۰–۱۴۵۰ supported range, and the `Intl` cross-check — the cross-check now
guarding the library's output rather than our own arithmetic.

### 8.7 Framer Motion — animation

**Used sparingly**, in exactly three places:

- modal open and close
- popup transitions (the three-step booking popup)
- list reordering (a day-grid row moving after a reschedule)

**Never used for decorative motion.** The design system specifies a calm,
premium feel (`08-ui-design-system.md` §44); an animation that draws attention to
itself is a finding against it. Two further constraints:

- **Animation never carries meaning.** A state change must be legible with motion
  disabled, which is also required for `prefers-reduced-motion` — the wrapper
  honours it, and a component that animates without honouring it is a finding.
- **Animation never delays data.** A transition wraps a state change; it does not
  gate the render of fetched content.

### 8.8 What is deliberately absent

| Not used | Why |
|---|---|
| shadcn/ui | Its default theme would override the design system tokens. Adapting it costs more than building the component. ADR-0021. |
| Material UI, Chakra, Ant Design | Heavy, opinionated, and the wrong visual language for a Persian clinic product. ADR-0021. |
| Any icon font | Blocking request, no tree-shaking, no per-icon stroke control. §8.2. |
| A CSS-in-JS runtime | CSS Modules and CSS variables already express the design system; a runtime adds cost and a hydration surface. |
| `moment` / `jalali-moment` | Deprecated, large, mutable, and locale data loaded at runtime. Superseded by §8.6. |
| A state-management library (Redux, Zustand) | There is no global client state to manage. Server data belongs in React Query; everything else is local to a component. |

---

*Related: `02-architecture.md` (multi-tenant and module architecture),
`05-conventions.md` §16 (client data fetching and the UI component rules),
`08-ui-design-system.md` (the components these libraries serve),
`09-security.md` (isolation and enforcement), `roadmap/decisions.md`
(ADR-0001 the stack, ADR-0002 the worker boundary, ADR-0020 React Query,
ADR-0021 headless primitives, ADR-0022 date-fns-jalali).*
