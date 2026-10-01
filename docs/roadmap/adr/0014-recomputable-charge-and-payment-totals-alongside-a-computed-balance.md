# ADR-0014 — Recomputable charge and payment totals alongside a computed balance

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted, provisional · Phase 0

**Context.** This is the one point in the design where immutable rule 8 and a
performance requirement pull against each other, and it is raised as **OQ-3** in
the Phase 0 report.

Rule 8: the balance is computed, never stored. The «بدهکاران» audience group,
however, must filter customers by whether they owe money, and doing that
correctly means aggregating every appointment and every payment for every
customer — a query that grows with the clinic's entire history.

**Decision.** Store **`chargedTotal` and `paidTotal`** on the customer as a
**recomputable cache of ledger facts**, and continue to compute the **balance**
at read time as `chargedTotal − paidTotal`. The cache is reconciled nightly, and
a mismatch fails loudly.

**Why this does not violate rule 8.** Rule 8 forbids storing *the balance* —
a derived conclusion that can disagree with the ledger it came from. `chargedTotal`
and `paidTotal` are **sums of ledger facts**, each of which is itself append-only
and auditable. The balance is still computed, still never stored, and still
reproducible from the payment and appointment records alone. If the cache is lost
entirely, nothing is lost — it is recomputable in one query.

**Why it is still provisional.** It is a compromise, and the specification did
not explicitly authorise it. The honest framing: it is a cache, the balance is
not stored, and the nightly reconciliation makes drift loud rather than silent.
**This should be confirmed by the specification's author**, which is why it is
OQ-3 and why this ADR is marked provisional rather than accepted outright.

**If the answer is no.** The cache is removed, the audience group's predicate
becomes a live aggregate, and the `بدهکاران` group is documented as the one slow
group. Nothing else changes; no other decision depends on the cache.

**Consequences accepted.**

- A nightly reconciliation job, which fails loudly on drift
  (`05-conventions.md` §7).
- Two denormalised columns that must be updated in the same transaction as the
  payment or charge that changes them.
- A reviewer seeing the columns will ask why; this ADR is the answer, including
  the honest note that it is provisional.

**Documented in.** `03-data-model.md` §4.3, `reports/phase-00-report.md` (OQ-3).
