# ADR-0017 — The public site has eight pages

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted, provisional · Phase 0

**Context.** The specification states «شش صفحه» (six pages) for the public site
in one section and lists eight in another. The text file's tables were damaged by
PDF extraction, so the discrepancy cannot be resolved from that section alone.
This is **OQ-1** in the Phase 0 report.

**Decision.** **Eight pages** — home, services, service detail, booking, doctors,
about, contact, panels — matching the structure of the supplied demo, which is
the rendered and therefore authoritative source.

**Why the demo wins.** Where the specification's extracted tables and the demo
disagree, the demo is the artefact someone actually built and reviewed, and it
has been the correct tiebreaker once already in this project (the permission
matrix, and the behavioral toggles — see OQ-2). The narrative sections of the
specification describe eight distinct public surfaces: a home, a service list, a
service detail with price and session count, a booking flow, a doctor list, an
about, a contact, and a panel-entry page.

**Why provisional.** The count is stated as six in one place, and the difference
is not a typo that can be argued away — it is either a spec that changed and was
not fully updated, or two pages that were merged. **The specification's author
should confirm.** The cost of being wrong is one extra or one missing page, and
the affected phase is Phase 8.

**Consequences accepted.**

- If the answer is six, two pages are merged and the Phase 8 effort range narrows
  slightly. No architectural consequence — `public-site` owns all of them either
  way, and the page → module mapping changes by two rows.

**Documented in.** `reports/phase-00-report.md` (OQ-1), `02-architecture.md` §9.
