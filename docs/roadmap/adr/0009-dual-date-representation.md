# ADR-0009 — Dual date representation

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** The product displays Jalali dates but must sort, compare and
schedule across time zones. Storing only a Jalali date loses the instant;
storing only a UTC instant means every display does a timezone conversion, and
every conversion is a place for an off-by-one-day bug.

**Decision.** **Store both.** Every scheduled thing carries:

- **`scheduledAt`** — a UTC `Date`, canonical for arithmetic, ordering and
  range queries.
- **`localDate`** — a `String` `YYYY-MM-DD` in **Jalali**, plus **`localTime`** —
  `HH:mm`, for display, day grids, and uniqueness.

**Why both, and why the local date is a string.** The day grid asks "everything
on ۱۵ مهر" — that is a string equality on `localDate`, which is indexable and
exact. Deriving it from `scheduledAt` at read time means every such query depends
on the server's timezone being correct, which it will not always be. Conversely,
"the next 7 days" and "sort by time" are arithmetic on `scheduledAt`.

The string form matters because a Jalali date has no native database type. A
string sorts correctly, compares exactly, and — unlike a computed value — cannot
drift when a runtime's ICU data changes (ADR-0010).

**Consequences accepted.**

- Two columns to keep consistent on write. Mitigated by computing both in one
  helper at the single point of write, never in a caller.
- A stored `localDate` that disagrees with `scheduledAt` is a data defect. The
  nightly reconciliation checks for it and fails loudly.
- Never derive a date at render time; use the stored value
  (`05-conventions.md` §8).

**Documented in.** `03-data-model.md` §3.2.
