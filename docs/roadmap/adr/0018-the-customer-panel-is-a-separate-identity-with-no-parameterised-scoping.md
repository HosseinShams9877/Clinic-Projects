# ADR-0018 — The customer panel is a separate identity with no parameterised scoping

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** The customer panel shows a customer their own appointments, cycle
progress, payments and consent. The conventional implementation is
`/account/appointments?customerId=...`, scoped by an ownership check.

**Decision.** **No customer-scoped route accepts a customer identifier.** The
customer is resolved from the session, and the query is scoped by that resolved
identity. A request **cannot express** another customer.

**Why.** An ownership check is a check that can be forgotten. If the identifier
is not a parameter, there is no route that can be called with the wrong one, and
no future refactor can drop the check because there is no check to drop — the
data is scoped at the query, from a value the caller cannot influence.

This is the same reasoning as ADR-0005 for tenants, applied one layer down:
resolve, never receive.

**What it prevents.** The entire class of IDOR bug in the customer panel — the
most exposed surface in the product, because customers are outside the
organisation and a mobile number is guessable.

**Consequences accepted.**

- A customer cannot share a link to their own appointment; there is no shareable
  URL. Accepted — the product has no such requirement, and the alternative is a
  signed token, which can be added later without weakening this rule.
- Staff viewing a customer's data use the staff surfaces, which are governed by
  the permission matrix and the ownership scoping in `09-security.md` §6.3 —
  a doctor requesting another doctor's patient receives **404**, not 403.

**Documented in.** `09-security.md` §7, `10-testing-strategy.md` §6.4.
