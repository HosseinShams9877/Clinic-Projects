# ADR-0014 — Recomputable charge and payment totals alongside a computed balance

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0, resolved ۱۴۰۵/۰۷/۱۰ (Phase 1, OQ-3)

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

**Why it is no longer provisional.** The question was whether the specification
authorised the compromise. Resolved in favour, on the grounds that the rule it
touches names the thing it protects: rule 8 forbids storing **the balance**, a
derived conclusion that can disagree with the ledger it came from. The two
columns are sums of append-only, auditable ledger facts — not a conclusion — and
the balance is still computed at read time and still reproducible from the
ledger alone. The one way this design could still break rule 8 is drift, and
drift is what the reconciliation is for, so the reconciliation is a hard
requirement rather than an operational nicety: **Phase 5 ships a test that
injects a mismatch and asserts the job fails loudly**. If that test does not
exist, this ADR is not implemented.

**If the answer had been no.** The cache would be removed, the audience group's
predicate would become a live aggregate, and `بدهکاران` would be documented as
the one slow group. Nothing else depends on the cache, which is what made the
question safe to leave open.

**Consequences accepted.**

- A nightly reconciliation job, which fails loudly on drift
  (`05-conventions.md` §7).
- Two denormalised columns that must be updated in the same transaction as the
  payment or charge that changes them.
- A reviewer seeing the columns will ask why; this ADR is the answer, including
  the honest note that it is provisional.

**Documented in.** `03-data-model.md` §4.3, `reports/phase-00-report.md` (OQ-3).
