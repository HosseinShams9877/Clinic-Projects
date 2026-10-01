# ADR-0016 — The immutable rules and the constant sets are amended only by ADR

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** `06-constants.md` §1 records the ten immutable rules from the
specification, and §4 records closed sets — the 16 permissions, the 8 appointment
statuses, the 8 campaign types, the 8 audience groups, the 7 automatic messages,
the 8 behavioral toggles. These are the product's invariants.

**Decision.** **Any change to §1 or §4 of `06-constants.md` requires a new ADR**
that states which rule or member changes, what breaks, and why. The change is not
made by editing the constants file, and not by a pull request that happens to
touch it.

**Why.** These sets are load-bearing. The 16 permissions define the permission
matrix test suite; adding a 17th permission without one is an unverified
permission. The 8 appointment statuses define the lifecycle and the day grid's
colours. The 8 audience groups each have an index that serves them. A silent
addition produces a product that is subtly inconsistent in a way no test catches,
because the test was written against the old set.

**What this specifically prevents.** A developer adding an appointment status
without adding it to the lifecycle tests, the design system's status colours, and
the localization catalog. A developer adding a permission without adding positive
and negative tests for all three roles. A developer adding an audience group
whose predicate has no index.

**Consequences accepted.**

- A slightly heavier process for a small change. Accepted — the alternative is
  discovering the inconsistency in production.
- The CI checks in `10-testing-strategy.md` §12 exist because of this ADR: every
  enum member must have a label, every permission must have a negative test,
  every status must have a design-system colour.

**Documented in.** `06-constants.md` §1 and §7.
