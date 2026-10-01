# ADR-0005 — Access through Membership; tenant resolved server-side

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** A user's relationship to a tenant can be modelled as ownership (the
user owns the tenant), as a role column on the user, or as a separate membership
entity.

**Decision.** **A `Membership` join entity** — `User ──< Membership >── Tenant` —
carrying the role, the permitted clinic ids, and the per-user permission
overrides. The session stores **only the user id**; the tenant and role are
resolved on the server, on every request, from the membership.

**Why Membership and not ownership.** A doctor works at two clinics. A manager
owns one tenant and consults at another. An ownership model cannot express
either without duplicating user records, and duplicating users duplicates
identity, which breaks login and audit. Membership expresses all of it as rows.

**Why not a role column on the user.** A role is a property of the *relationship*,
not of the person. The same person is a manager in one tenant and a doctor in
another. A `role` column on `User` makes that inexpressible and makes every
`User` row a cross-tenant object.

**Why the tenant is never accepted from the client.** A client-supplied
`tenantId` is a request to read someone else's data, and no amount of validation
makes it safe — the correct answer is that the value is never read. The tenant
switcher sends an **index into the user's own membership list**, not a tenant
identifier. `tenantId`, `clinicId` and `role` are absent from every input schema
(`05-conventions.md` §5).

**Consequences accepted.**

- Every request resolves a membership. Mitigated by caching per session and by
  indexing `Membership` on `(userId, tenantId)`.
- The permission check needs the resolved context, so it cannot happen in
  middleware alone. It happens in the module layer, which also means the worker
  and Server Actions pass through the same check
  (`02-architecture.md` §11).
- Switching tenants is a session-scoped operation, not a data operation.

**Documented in.** `02-architecture.md` §2, `04-roles-permissions.md`,
`09-security.md` §3.
