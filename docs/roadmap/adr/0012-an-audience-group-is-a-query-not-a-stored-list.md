# ADR-0012 — An audience group is a query, not a stored list

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

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
