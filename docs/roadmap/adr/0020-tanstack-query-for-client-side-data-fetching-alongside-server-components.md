# ADR-0020 — TanStack Query for client-side data fetching alongside Server Components

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0 addendum

**Context.** The stack is Next.js App Router (ADR-0001). Server Components fetch
on the server with no client cache, which is right for a page's initial load. But
five of the product's surfaces are not page loads — they are places where a
receptionist works continuously for hours inside one screen:

- the **appointment day grid** — moving between days and doctors, rescheduling;
- the **cycle contact list** — working down a list and recording a result per row;
- the **debt list** — whose buckets change as payments are recorded elsewhere;
- the **campaign builder preview** — a count that depends on a filter being edited;
- the **notification feed** — polled.

Each needs a client-side cache, invalidation driven by the mutation that changed
the data, and — for the first three — optimistic updates.

**Decision.** **Server Components for initial load; TanStack Query (React Query)
v5 for interactive, cached, and optimistic client-side data.** The split is by
what the data is for, stated as a table in `01-tech-stack.md` §8.1.1 and applied
as rules in `05-conventions.md` §16.

React Query fetches; **writes still go through Server Actions** (ADR-0001). No
`useMutation` posts to a bespoke API route.

**Alternatives rejected.**

| Alternative | Why rejected |
|---|---|
| **Server Components only** | No client-side cache and no optimistic update. Every day-grid move, every contact-list row, and every filter change is a full server round trip or a hand-rolled cache. On a Persian clinic's connection, over a working day, that is the difference between a tool and a chore. |
| **SWR** | A smaller feature set for exactly what this product needs. No first-class mutation with lifecycle callbacks, no `onMutate` snapshot/rollback primitive for optimistic updates, no query cancellation, and a thinner invalidation model. The five surfaces above are the heavy end of client caching. |
| **Manual `fetch` + `useState`** | No cache invalidation, no background refetch, no deduplication, no cancellation, and no stale-while-revalidate. Every one of those becomes hand-written state that drifts from the server, and the bug surface is largest precisely on the screens the clinic uses most. |
| **Redux Toolkit Query** | Heavier, and it brings a global store this product does not need. There is no cross-cutting client state to manage — server data is the whole problem, and React Query solves only that, which is why it is the right size. Adding a store to hold server data also invites holding *derived* server data in it, which reintroduces the drift the cache exists to prevent. |

**Consequences accepted.**

- **Two data-fetching patterns must be clearly separated in conventions.** This is
  the real cost, and it is a review obligation: a surface uses a Server Component
  or React Query for a given piece of data, never both. Seeding a React Query
  cache from a Server Component is a finding (`01-tech-stack.md` §8.1.1), because
  it creates two sources of truth for one value and defers the mismatch to
  production.
- **Query keys must be tenant-scoped to prevent cross-tenant cache leaks.** A key
  without `tenantId` serves tenant A's cached rows to tenant B **from memory,
  with no query issued** — so RLS never runs and the database cannot catch it. The
  key builder therefore lives in `src/core/query/keys.ts`, not in each module, and
  a single property test over every exported builder guards the rule
  (`10-testing-strategy.md` §16.3).
- **Optimistic updates must handle rollback.** On failure the cache is restored to
  the exact pre-mutation snapshot and the user is told, because a silent rollback
  leaves the screen disagreeing with the database. Both paths are tested
  (`10-testing-strategy.md` §16.4); a mutation with no `onError` rollback is a
  blocking finding.
- **One more runtime dependency** in a deliberately small dependency tree
  (`09-security.md` §15), pinned exactly.

**Documented in.** `01-tech-stack.md` §8.1 and §8.1.1, `05-conventions.md` §16,
`10-testing-strategy.md` §16.
