# Roadmap — Decisions

> Architecture Decision Records. Each records a decision that was **made**, the
> alternatives that were **rejected**, and the consequences that were
> **accepted**. A decision is not revisited by re-arguing it in a pull request;
> it is revisited by writing a new ADR that supersedes it.
>
> An ADR is immutable once accepted. To change a decision, add a new one — never
> edit the old text.

**One file per decision**, in `roadmap/adr/`. This file is the index and the
only place the list is maintained. The split is not cosmetic: an ADR log grows
monotonically, and a single file reaches the 1000-line limit of
`05-conventions.md` §4 and then has to be re-split — which would move text and
break links every time. One file per decision never needs splitting again.

---

## Index

| ADR | Decision | Status |
|---|---|---|
| [`0001`](adr/0001-nextjs-full-stack-as-a-single-deployable.md) | Next.js full-stack as a single deployable | Accepted |
| [`0002`](adr/0002-the-background-worker-is-a-separate-process-not-a-separate-codebase.md) | The background worker is a separate **process**, not a separate codebase | Accepted |
| [`0003`](adr/0003-one-postgresql-database-with-row-level-security.md) | One PostgreSQL database with row-level security | Accepted |
| [`0004`](adr/0004-single-tenant-mode-as-a-runtime-flag-not-a-fork.md) | Single-tenant mode as a runtime flag, not a fork | Accepted |
| [`0005`](adr/0005-access-through-membership-tenant-resolved-server-side.md) | Access through Membership; tenant resolved server-side | Accepted |
| [`0006`](adr/0006-database-backed-job-queue-not-an-external-broker.md) | Database-backed job queue, not an external broker | Accepted |
| [`0007`](adr/0007-prisma-orm-portable-across-sqlite-and-postgresql.md) | Prisma ORM, portable across SQLite and PostgreSQL | Accepted |
| [`0008`](adr/0008-money-as-bigint-rial-serialised-as-a-string.md) | Money as `BigInt` Rial, serialised as a string | Accepted |
| [`0009`](adr/0009-dual-date-representation.md) | Dual date representation (UTC instant + Jalali local date) | Accepted |
| [`0010`](adr/0010-jalali-conversion-in-house-not-intl.md) | Jalali conversion in-house, not `Intl` | **Superseded by ADR-0022** |
| [`0011`](adr/0011-the-treatment-cycle-is-an-independent-entity.md) | The treatment cycle is an independent entity | Accepted |
| [`0012`](adr/0012-an-audience-group-is-a-query-not-a-stored-list.md) | An audience group is a query, not a stored list | Accepted |
| [`0013`](adr/0013-no-debts-table-the-debt-list-is-served-by-the-appointment-index.md) | No `debts` table; the debt list is served by the appointment index | Accepted |
| [`0014`](adr/0014-recomputable-charge-and-payment-totals-alongside-a-computed-balance.md) | Recomputable charge/payment totals alongside a computed balance | Accepted, provisional |
| [`0015`](adr/0015-a-modular-monolith-with-barrel-imports-and-a-1000-line-limit.md) | A modular monolith with barrel imports and a 1000-line limit | Accepted |
| [`0016`](adr/0016-the-immutable-rules-and-the-constant-sets-are-amended-only-by-adr.md) | The immutable rules and constant sets are amended only by ADR | Accepted |
| [`0017`](adr/0017-the-public-site-has-eight-pages.md) | The public site has eight pages | Accepted, provisional |
| [`0018`](adr/0018-the-customer-panel-is-a-separate-identity-with-no-parameterised-scoping.md) | The customer panel is a separate identity with no parameterised scoping | Accepted |
| [`0019`](adr/0019-module-override-mechanism-for-per-tenant-customization.md) | Module override mechanism for per-tenant customization | Accepted |
| [`0020`](adr/0020-tanstack-query-for-client-side-data-fetching-alongside-server-components.md) | TanStack Query for client-side data fetching alongside Server Components | Accepted |
| [`0021`](adr/0021-headless-primitives-only-no-styled-component-library.md) | Headless primitives only; no styled component library | Accepted |
| [`0022`](adr/0022-date-fns-jalali-for-calendar-arithmetic-owning-the-display-layer.md) | `date-fns-jalali` for calendar arithmetic; owning the display layer | Accepted — supersedes ADR-0010 |

---

## Adding a decision

1. Take the next number. Never reuse or renumber.
2. Create `roadmap/adr/NNNN-<kebab-case-slug>.md` — a new file, never an edit to
   an existing one. The heading is `# ADR-NNNN — Title`, followed by the index
   back-link, then the body.
3. Write it in the same shape: **Status · Context · Decision · Why · Consequences
   accepted · Documented in.**
4. Include the alternatives **rejected** and the reason. A decision without a
   rejected alternative is a preference, not a decision.
5. State the consequences honestly, including the ones that are costs. An ADR
   with no downside is an ADR that has not been thought through.
6. **Add it to the index above.** An ADR that is not in the index does not exist.
7. If it changes an earlier decision, the new ADR **supersedes** it — update the
   old one's **Status** line to `Superseded by ADR-XXXX` and update its index row,
   and leave its text untouched. Both are the only permitted edits to an
   accepted ADR.
8. Commit it with `docs(adr): ...`.
