# 00 — Overview

> The entry point to the knowledge layer. Read this first, then follow §7 to
> whichever document the task needs.

---

## 1. What this product is

A multi-tenant SaaS platform for managing Persian beauty and skin clinics — the
appointments, the treatment cycles, the debts, the campaigns, and the customers
behind all of them.

It is **not a calendar**. The specification says so directly: what separates this
platform from an appointment book is the **treatment-cycle engine** — the
mechanism that knows a customer bought six laser sessions at four-week intervals,
knows when session four is due, notices when she does not book it, puts her in
front of the secretary, and records what happened. A calendar forgets her. This
does not.

Three further things make it what it is:

- **The work list replaces the performance report.** The specification's design
  criterion is that if the secretary's list is empty at the end of the day, no
  customer was lost. Everything is built to make that list empty for the right
  reasons.
- **Persian is the interface, not a translation.** Right-to-left, Vazirmatn,
  Persian digits, the Jalali calendar, and the week starting on شنبه. There is no
  locale switch.
- **Access is enforced on the server.** Hiding a menu is not access control
  (immutable rule 2). Every permission is a rule in a module function, and every
  table is isolated by tenant at the database engine.

---

## 2. Who uses it

| Role | Persian | Surface | What they do |
|---|---|---|---|
| **Manager** | مدیر | 11 admin pages | Owns the clinic: services, prices, staff, permissions, campaigns, reports. The only role that can change access. |
| **Doctor** | پزشک | 4 doctor pages | Owns their own schedule and their own patients' records and cycles. Sees no debts unless granted. |
| **Secretary** | منشی | 6 reception pages | Runs the day: the work list, arrivals, results, booking, cycle contacts, debts, leads. |
| **Customer** | مشتری | 6 customer pages + 8 public pages | Books, pays a deposit, sees their next appointment and cycle progress, manages consent. |

The manager, doctor and secretary are **staff of a tenant**. A customer is not —
the customer panel is a separate, narrowly-scoped identity
(`09-security.md` §7).

---

## 3. The shape of the system

```
35 pages
  ├── 8  public site      →  public-site, appointments, customers, auth
  ├── 6  customer panel   →  auth, dashboard, appointments, payments, customers
  ├── 11 manager panel    →  dashboard, appointments, customers, debts, cycles,
  │                          campaigns, services, staff, reports, settings
  ├── 4  doctor panel     →  dashboard, customers, cycles, debts
  └── 6  reception panel  →  dashboard, notifications, appointments, cycles,
                             debts, payments, customers

20 modules
  auth · dashboard · appointments · customers · cycles · campaigns ·
  campaign-assistant · audience-groups · notifications · messages · services ·
  staff · roles-permissions · debts · payments · reports · settings ·
  public-site · tenant-management · license

1 database
  2 deployable processes: the web tier, and the background worker
  2 runtime modes: multi-tenant (SaaS) and single-tenant (on-premise)
```

The full page → module mapping is in `02-architecture.md` §9, with an explicit
coverage check. Every page maps; no module is unreferenced.

---

## 4. The decisions already made

Phase 0 exists to make these before any code is written. Each has an ADR in
`roadmap/decisions.md`.

| Decision | Outcome | Document |
|---|---|---|
| **Stack** | Next.js App Router full-stack. One codebase, one deployable, plus a separate background worker **process**. | `01-tech-stack.md` |
| **Multi-tenancy** | `tenantId` is the boundary, `clinicId` is a branch within it. One PostgreSQL database, RLS as the second layer. | `02-architecture.md` |
| **Single-tenant mode** | `MULTI_TENANT=false`. Identical schema, migrations and modules; only the tenant switcher and two route trees change. | `setup/single-tenant.md` |
| **Modules** | 20 modules under `src/modules/`, each with the same internal contract, imported only through a barrel. `src/app/` is thin routing. | `02-architecture.md` |
| **Database** | Prisma, portable between SQLite (dev) and PostgreSQL (production). A documented list of avoided features. | `setup/database-migration.md` |
| **Money** | `BigInt` Rial, serialised as a string, never a float. Balance is computed, never stored. | `03-data-model.md` §3.3 |
| **Dates** | Dual representation: UTC instant for arithmetic, Jalali `localDate` for display, grids and uniqueness. | `03-data-model.md` §3.2 |
| **Calendar** | Jalali computed in-house, not via `Intl`, because ICU varies by runtime host. | `07-localization.md` §6 |
| **Design system** | Preserved exactly. Every token as specified; no invented value. | `08-ui-design-system.md` |
| **Testing** | The permission matrix (16 × 3 × both directions), tenant isolation, and the four specification scenarios are all mandatory. | `10-testing-strategy.md` |

---

## 5. The ten immutable rules

Restated here because every design decision traces back to one of them. The
Persian original, the enforcement mechanism, and the reasoning are in
`06-constants.md` §1.

1. **No diagnosis, no treatment advice, no outcome guarantee.** Medical questions go to a doctor. This is both a professional duty and a legal risk.
2. **Access is enforced on the server.** Hiding a menu is not access control.
3. **Medical data is separate from the assistant and campaigns.** Grouping uses behavioural and financial data only.
4. **No bulk send without human approval.**
5. **Customer consent outranks the clinic's wishes.**
6. **Before/after images only with written consent, revocable at any time.**
7. **Debt deletion does not exist.** A discount is recorded with the name of who granted it.
8. **Balance is computed, never stored.**
9. **No user changes their own access.**
10. **A service is deactivated, never deleted.** History must stay intact.

These are not guidelines. A feature that requires violating one is not built.

---

## 6. What is deliberately not in scope

Named here so that a later phase does not quietly add them, and so that a reader
does not assume they were forgotten. Full reasoning in `06-constants.md` §3.

- **Secretary performance report** in the manager panel — the specification
  deferred it because a *correct* measure was never defined, and a wrong measure
  is worse than none. The empty work list is the intended replacement.
- **A service-recording page** — service recording happens inside the
  appointments table.
- **Inventory and consumables** — a separate scope, not a differentiator.

Also out of scope: any second language, any locale switch, financial reporting
(the `reports` module is retention-only by design), and a stored audience list
(audience groups are queries).

---

## 7. How to read this knowledge layer

| Read | When |
|---|---|
| **`00-overview.md`** (this file) | First, always |
| **`01-tech-stack.md`** | Before questioning the stack, or adding a dependency |
| **`02-architecture.md`** | Before creating a module, a page, or an import across boundaries |
| **`03-data-model.md`** | Before adding an entity, a column, or an index |
| **`04-roles-permissions.md`** | Before writing any authorisation check, or any page a non-manager sees |
| **`05-conventions.md`** | Before writing any code. This is the one to keep open |
| **`06-constants.md`** | Before hard-coding any number, label, or closed set |
| **`07-localization.md`** | Before rendering any date, number, or currency |
| **`08-ui-design-system.md`** | Before writing any style. Binding |
| **`09-security.md`** | Before touching tenancy, sessions, or customer data |
| **`10-testing-strategy.md`** | Before declaring a phase done |
| **`roadmap/phases.md`** | To know what is being built now and what comes next |
| **`roadmap/progress.md`** | To know what is actually built |
| **`roadmap/decisions.md`** | To understand why, or to add a decision |
| **`setup/*.md`** | To install, deploy, or run single-tenant |
| **`reports/`** | To read the Phase 0 findings and open questions |

---

## 8. The phase structure

Phase 0 — this one — produced no application code. It produced the foundation
every later phase builds against.

| Phase | What it delivers |
|---|---|
| **0** | This knowledge layer, the roadmap, the decisions, the repository skeleton |
| **1** | Foundation: project setup, tokens, localization, Prisma schema, RLS, auth, tenant context, the permission primitive |
| **2** | Appointments and the day grid |
| **3** | Customers, services, staff |
| **4** | Treatment cycles |
| **5** | Payments, debts |
| **6** | Messages, notifications |
| **7** | Campaigns, audience groups, the assistant |
| **8** | Public site |
| **9** | Customer panel |
| **10** | Reports, settings, tenant management, licensing |
| **11** | Worker, hardening, and the full verification suite |

The authoritative version — with deliverables, measurable definitions of done,
dependencies and effort ranges — is `roadmap/phases.md`. This table is a
navigational summary and does not override it.

---

## 9. Status

**Phase 0 is complete.** The knowledge layer is written, the roadmap is
scheduled, the decisions are recorded, and the repository is initialized. No
application code exists, by design.

Three open questions were raised during Phase 0 and are recorded in
`reports/phase-00-report.md`. None blocks Phase 1; all three should be answered
before the phase that depends on them.

---

*Next: `01-tech-stack.md`.*
