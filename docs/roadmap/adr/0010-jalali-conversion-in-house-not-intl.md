# ADR-0010 — Jalali conversion in-house, not `Intl`

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** **Superseded by ADR-0022** · was Accepted · Phase 0

**Context.** Every date the product displays is Jalali. The conversion can come
from `Intl.DateTimeFormat('fa-IR-u-ca-persian')`, from a third-party plugin, or
from in-house arithmetic.

**Decision.** **In-house**, in `src/core/localization/jalali.ts`, converting
through the Julian Day Number with an explicit leap-year break table.
`Intl` is used **only inside the test suite**, as a cross-check.

**Why not `Intl` at runtime.** Its output depends on the ICU data bundled with
the Node runtime, which differs between a developer's machine, the SaaS host and
a clinic's on-premise server. A date that renders as one Jalali day on the build
machine and another on the clinic's machine is precisely the failure this product
cannot afford: a clinic acting on the wrong day. Pinning ICU is not a solution
the vendor controls on a customer's server.

**Why not a plugin.** The specification rejects jQuery-era plugin dependencies.
The conversion is a few hundred lines of pure, testable arithmetic and it is core
to every screen. Owning it is cheaper than depending on it.

**Consequences accepted.**

- The correctness burden is ours. Mitigated by the test obligations in
  `07-localization.md` §6.3: a 200-year round-trip property test, anchor vectors,
  and an ICU cross-check across the whole supported range. If a future Node
  version changes ICU, the cross-check fails loudly rather than a screen silently
  changing.
- The supported range (۱۳۹۰–۱۴۵۰) is asserted explicitly rather than assumed.
- The algorithm, the 33-year cycle and the break table must be documented, which
  they are.

**Documented in.** `07-localization.md` §6.
