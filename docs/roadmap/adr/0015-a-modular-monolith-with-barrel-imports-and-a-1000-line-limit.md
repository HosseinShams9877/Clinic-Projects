# ADR-0015 — A modular monolith with barrel imports and a 1000-line limit

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** The product has 20 functional areas and 35 pages. The structure can
be feature modules, layers (controllers/services/repositories), or a monolith
with no enforced boundaries.

**Decision.** **20 feature modules** under `src/modules/<name>/`, each with the
same internal contract (`components/`, `lib/`, `validation/`, `types/`, `hooks/`,
`api/`, `tests/`, `index.ts`), imported **only through the barrel**. `src/app/`
is thin routing. **No file exceeds 1000 lines**, enforced by CI.

**Why feature modules and not layers.** A layered structure puts one feature's
logic in four directories and makes a change touch all of them. A feature module
makes a change local, makes deletion possible, and makes ownership clear.

**Why the barrel is enforced.** A module's public surface should be a decision.
Without the rule, everything is public by accident and a refactor inside one
module breaks three others.

**Why the 1000-line limit.** It is a proxy for "one file, one responsibility",
and unlike the principle it is mechanically checkable. When a file reaches the
limit, it is split **by responsibility**, guided by the module's own subfolders —
never by taking the bottom half.

**Consequences accepted.**

- Some duplication between modules where a layer would have shared code. Accepted
  — `core` exists for genuinely shared logic, and premature sharing couples
  modules.
- The rule must be enforced by tooling, not memory: an ESLint
  `no-restricted-imports` pattern and a CI file-length check, both wired in
  Phase 1.

**Documented in.** `02-architecture.md` §6–§10, `05-conventions.md` §4.
