# ADR-0022 — `date-fns-jalali` for calendar arithmetic; owning the display layer

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0 addendum · **Supersedes ADR-0010**

**Context.** ADR-0010 decided that Jalali conversion would be **in-house**,
rejecting both `Intl.DateTimeFormat('fa-IR-u-ca-persian')` and third-party plugins.
Its two reasons were specific and are both still sound:

1. **`Intl`'s output depends on the ICU data bundled with the Node runtime**, which
   differs between a developer's machine, the SaaS host and a clinic's on-premise
   server. A date rendering as one Jalali day on the build machine and another on
   the clinic's machine is the failure this product cannot afford.
2. **"The specification rejects jQuery-era plugin dependencies"** — the
   plugin class in view being `moment`/`jalali-moment` and similar: large, mutable,
   locale data loaded at runtime, and unmaintained.

The Phase 0 addendum introduces `date-fns-jalali` to the stack. That is a change to
ADR-0010's decision, so it is recorded here rather than made by editing it.

**Decision.** **`date-fns-jalali` is used for Jalali conversion and calendar
arithmetic. All display formatting remains ours, in `src/core/localization`.**

The split is explicit (`01-tech-stack.md` §8.6):

| Concern | Owner |
|---|---|
| Gregorian ↔ Jalali conversion, day/month/year arithmetic, month grids, week ranges | `date-fns-jalali`, pinned exactly |
| Rendering `۱۴۰۵/۰۶/۲۹` or «۲۹ شهریور ۱۴۰۵» | `src/core/localization/format.ts` |
| Persian digits and the `٬` separator | `src/core/localization/digits.ts` |
| The week starting on **شنبه** | `src/core/localization/calendar.ts` |

**Why the change is safe against ADR-0010's own reasons.**

- **It is not `Intl`.** `date-fns-jalali` is pure JavaScript carrying its own
  calendar data; it does not read the runtime's ICU. The runtime-dependence that
  ADR-0010 correctly refused is absent, and pinning the version pins the
  behaviour.
- **It is not the rejected plugin class.** It is a modern, tree-shakeable,
  functional, immutable library in the `date-fns` family — the opposite of a
  mutable jQuery-era plugin loading locale data at runtime.
- **ADR-0010's display-layer requirement is retained, not dropped.** The reason
  Persian digits and separators were always going to be ours is that they are
  product rules, not calendar rules (`07-localization.md` §4). Owning
  conversion as well was a means to that end, not the end.

**Why the change is worth making.**

- **The correctness burden moves to a library that is independently used.** The
  break-table arithmetic in `07-localization.md` §6.2 is a few hundred lines of
  pure logic whose failure mode is a clinic acting on the wrong day — the
  highest-consequence pure logic in the product, by the document's own assessment.
  A pinned, widely-exercised implementation is a better owner of it than we are.
- **Month grids and week ranges are the part of this that is genuinely fiddly**,
  and they are needed in every calendar surface, starting with the Jalali date
  picker in Phase 1.
- It removes a body of arithmetic that would otherwise have to be written, tested
  and maintained before any UI could be built.

**ADR-0010's test obligations are retained in full** (`10-testing-strategy.md`
§3.5), with the cross-check's target updated:

- the **200-year round-trip property test**;
- the **anchor vectors** — known Nowruz dates, known leap years, the last day of
  each month in a common and a leap year, and the ۲۹/۳۰ اسفند → ۱ فروردین
  boundary;
- the **explicit ۱۳۹۰–۱۴۵۰ supported range**, asserted rather than assumed;
- the **`Intl` cross-check across that range** — which now guards the *library's*
  output rather than our own arithmetic, and still fails loudly if a Node
  version changes ICU.

**Consequences accepted.**

- **A runtime dependency is added** to a deliberately small dependency tree
  (`09-security.md` §15), pinned exactly like every other.
- **A future `date-fns-jalali` release could change a conversion.** Mitigated by
  exact pinning plus the round-trip, anchor and ICU cross-check tests, which turn
  such a change into a failing test rather than a silent one-day drift. This is a
  strictly weaker guarantee than owning the arithmetic — and it is accepted
  because the tests detect the failure before a clinic sees it.
- **Two calendars now exist in the codebase's dependency graph**, so a developer
  could be tempted to format a date with `date-fns-jalali` directly. The rule is
  absolute: **a date formatted outside `src/core/localization` is a finding**
  (`05-conventions.md` §14), the same as one formatted at render time.
- **`07-localization.md` §6.1–§6.2 must be re-read as historical.** The algorithm
  description remains the specification of what the conversion must *do*; it is no
  longer the specification of what we *write*.

**Documented in.** `01-tech-stack.md` §8.6, `07-localization.md` §6,
`10-testing-strategy.md` §3.5, `05-conventions.md` §14.
