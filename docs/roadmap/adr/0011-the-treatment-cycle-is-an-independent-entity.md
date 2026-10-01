# ADR-0011 — The treatment cycle is an independent entity

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** A customer who buys a six-session laser course has a relationship
that spans months. It could be modelled as fields on each appointment
(`sessionNumber`, `totalSessions`, `nextDueDate`), or as its own entity that
appointments link to.

**Decision.** **`TreatmentCycle` is an independent entity.** Appointments
reference it; it does not live on them.

**Why.** The specification says the mechanism that separates this platform from a
calendar is the cycle. Modelling it as fields on appointments makes the cycle a
derived property of whichever appointment you happen to be looking at, which
breaks in three concrete ways:

- **The interval is a property of the cycle, not the service.** The specification
  is explicit: «فاصله از دوره خوانده میشود، نه از تعریف خدمت». If a clinic later
  changes a service's default interval from 28 to 21 days, every in-flight course
  must keep its original schedule. With fields on appointments there is nowhere
  to record the cycle's own interval, and a settings change silently reschedules
  dozens of customers.
- **The cycle must be findable when there is no appointment.** The contact list
  is exactly "cycles that are due with no future appointment". If the cycle only
  exists inside appointments, a customer with no upcoming appointment has no
  cycle to find — which is the case the list exists to catch.
- **The cycle has its own state and lifecycle** — active, completed, abandoned
  with a reason, current session number, next due date — none of which belongs to
  any single appointment.

**Consequences accepted.**

- One more entity, one more join, and cycle creation must be transactional with
  the appointment's transition to `COMPLETED`.
- Creation happens at exactly one transition and must be idempotent, because a
  retried completion must not create a second cycle
  (`10-testing-strategy.md` §3.2).
- The contact list query is over cycles, which is why
  `cycle_tenant_status_due_idx (tenantId, status, nextDueDate)` exists.

**Documented in.** `03-data-model.md` §2.4.
