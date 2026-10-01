# ADR-0013 — No `debts` table; the debt list is served by the appointment index

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** The product has a debt surface with four buckets. Immutable rule 8
says the balance is computed, never stored, and rule 7 says debt deletion does
not exist. A `debts` table would be the conventional implementation.

**Decision.** **There is no `debts` table.** A debt is an appointment with an
outstanding computed balance. The debt list is a query over appointments, served
by `appt_tenant_status_sched_idx (tenantId, status, scheduledAt)`.

**Why no table.** A debt row is a **stored conclusion** — the very thing rule 8
forbids. It would need to be created when a balance becomes non-zero and removed
when it reaches zero, which means a job that decides when a debt begins and ends,
and a table that can disagree with the ledger. It would also create a delete
path, which rule 7 forbids: the moment a debt is a row, someone will need to
remove it, and the way they remove it will be a delete.

With no table, "debt deletion does not exist" is **structural**, not a promise.
There is nothing to delete.

**Why the appointment index serves it.** The balance is due a grace period after
the appointment, so `dueDate = scheduledAt + grace` is **monotonic** in
`scheduledAt`. That means the four buckets — current, 1–30 days overdue, 31–90,
over 90 — are four **ranges** on a single ordered column, and one index on
`(tenantId, status, scheduledAt)` serves all four. No separate index is needed,
and adding one would be an index that duplicates a range scan the planner already
does well.

**Consequences accepted.**

- Every debt query joins appointments to payments. Mitigated by
  `payment_tenant_customer_paid_idx` and by the appointment index above.
- A future change to the grace period changes bucket boundaries, not the schema.
  A query change only.
- The recomputable totals in ADR-0014 exist because of this — the aggregate
  cannot be read from a table, so it is cached and reconciled.

**Documented in.** `03-data-model.md` §4.3.
