# ADR-0019 — Module override mechanism for per-tenant customization

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0 addendum

**Context.** The product is a multi-tenant SaaS. Modules are global: every tenant
runs the same code (`02-architecture.md` §7). That is what makes one release
train, one migration path and one test suite possible — but it also means the
first customer who needs a materially different implementation of a module (a
clinic group with its own reporting standard and its own dashboard) cannot be
served without either changing the product for everyone or leaving the shared
codebase.

This case will arrive. It was not addressed in Phase 0 and is addressed here,
before it does.

**Decision.** **Global modules plus a tenant-declared override registry held in
the database.**

1. The 20 modules of `02-architecture.md` §7 remain the default implementation
   of every module, in the repository's own tree. The module list stays closed.
2. A tenant's settings row may declare, per module, which implementation to use.
   The declaration is a JSON `String` column parsed through Zod — data, in a
   table already covered by RLS.
3. A **static, build-time registry** maps `(module, implementationId)` to a
   module barrel. The declaration selects a name from that fixed set.
4. A resolver at the module boundary — next to the permission check — returns the
   declared implementation, or the default. It is total: it always returns an
   implementation.
5. An override is a full module tree under the default module's `overrides/`
   folder, typed as the default's public interface, and it runs the default's
   entire test suite.

**Alternatives rejected.**

| Alternative | Why rejected |
|---|---|
| **Fork the codebase per tenant** | Maintenance explosion. Every subsequent fix, security patch and migration must be applied once per fork, and forks drift from each other and from the tested path. The cost grows with the customer count — the inverse of what a platform is supposed to do. It also ends the possibility of a single certification: the tested artefact is no longer the shipped artefact. |
| **A separate `src/` per tenant** | Build complexity for no shared core. Every shared fix becomes N edits in N trees with no compiler forcing consistency; the test suite either multiplies or silently covers one tenant; and "the same repo, same schema, same migrations" stops being true, which is what ADR-0004's single-tenant promise rests on. |
| **Runtime code injection** (a plugin loaded from disk or a network path, evaluated at runtime) | Security risk and unverifiable. Code that was not compiled, linted, or tested as part of the release is code with no CI gate, no boundary check and no isolation test — running inside a process that holds every tenant's medical and financial data. There is also no way to review what it does, and no way to prove it does not read another tenant's rows. Rejected outright; the registry exists specifically so this is never necessary. |
| **Feature flags only** | A flag toggles behaviour that already exists. It cannot change a module's structure — its screens, its queries, its composition. Thirty flags still yield one dashboard. The requirement is substitution, and a boolean cannot express substitution. Flags also accumulate: each new variation multiplies the combinations the test suite must cover, and none of them is independently verifiable. |

**Consequences accepted.**

- **Overrides must pass the same tests as the default module.** The permission
  matrix, the cross-tenant isolation suite, and the module's own unit tests run
  against every registered override. An override with no isolation test is
  unverified and is not registered. This is the cost that makes the mechanism
  safe, and it is not negotiable.
- **A broken override must not be able to take down the platform.** Every failure
  mode — a missing registry entry, a malformed declaration, a disabled entry, a
  runtime exception — resolves to the default during that request. There is no
  state in which a module has no implementation, and no tenant can degrade
  another tenant's service.
- **Overrides are versioned with the platform, not independently.** An override
  ships with the release that contains it and is upgraded when the platform is
  upgraded. A tenant cannot run an override against a different core version.
  The consequence is that an override change waits for a release — accepted,
  because the alternative is a supported matrix of core × override versions that
  a small team cannot test.
- **A second implementation of a module permanently doubles that module's
  maintenance and test surface**, for as long as the tenant exists. This is why
  the declaration is an operator action on a settings row, never a self-service
  control, and why the default implementation is never removed even after the
  last override exists.

**Explicitly not decided here.** The mechanism is specified and validated, but
**no override is built in Phase 1**. The registry, the resolver, the validation
contract and the fail-closed behaviour ship in Phase 1 because they are
foundation; the first real override ships in a later phase against a customer who
has asked for one (`roadmap/phases.md`).

**Documented in.** `02-architecture.md` §13, `05-conventions.md` §15,
`09-security.md` §18, `roadmap/phases.md` (Phase 1 and the phase carrying the
first override).
