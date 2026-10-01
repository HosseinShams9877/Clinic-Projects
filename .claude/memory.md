# Memory

> Dated decisions and findings carried between sessions. Newest first.
>
> **This file is for things that are not in the repository.** A fact that lives in
> `docs/knowledge/` — an entity, a permission, a token — belongs there, not here.
> What belongs here is the working knowledge that has no other home: what was
> tried and failed, what was learned about the tools, and what a future session
> would otherwise have to rediscover.
>
> Dates are Jalali, matching the product's convention.

---

## ۱۴۰۵/۰۷/۰۹ — Phase 0 closed

**Everything decided in Phase 0 is in `docs/roadmap/decisions.md` (18 ADRs) and
`docs/knowledge/`.** This entry records only what those documents do not.

### The specification file cannot be searched

`سناریوی کام.txt` — the product specification — **cannot be searched with `Grep`
or any standard text tool.** Its Persian text is encoded as presentation-form
glyphs, so a search for a word the file definitely contains returns **zero
matches**. This was verified with several patterns before concluding it.

**What to do instead:** read it with `Read` and `offset`/`limit`, in the section
ranges recorded below. Do not conclude from a failed search that a section is
missing, and do not spend time trying to repair the encoding.

The demo's HTML files **can** be searched normally. When a question is about the
UI or about a default value, search `clinic/` first.

**Section map** (line ranges in the 1428-line file), as read in Phase 0:

| Lines | Content |
|---|---|
| 180–349 | §2 the permission matrix (scrambled) · §3 the data model · §4 booking modes |
| 840–959 | §8 doctor panel · §9 the reception panel's 6 pages · §10 start |
| 959–1108 | §10 the four e2e scenarios · §11 cycle rules |
| 1155–1334 | §12 accounting · §13 campaigns · §14 messages · §15 immutable rules, MVP boundaries, deferred scope · §16 |

### Two of the specification's tables are damaged by PDF extraction

The permission matrix and the behavioral toggles table both had their columns
interleaved. **In both cases, a careful reading produces a wrong answer** — the
toggle reconstruction from the damaged table was wrong on **four of eight rows**,
and it was wrong *plausibly*.

**The rule this establishes:** where the extracted specification is ambiguous,
**the demo's rendered source is authoritative.** It resolved the permission matrix
(`clinic/admin/staff.html` — confirmed by the spec's own statement that the
secretary has «۱۲ دسترسی از ۱۶») and the toggles (`clinic/admin/settings.html`).

**Four tables have not been re-checked against the demo** and should be before
Phase 6 and Phase 7 depend on them: campaign types, audience groups, automatic
messages, acquisition sources. This is OQ-2 in the Phase 0 report.

### The demo's README is stale

It states the manager panel has 14 pages and the reception panel 10. **The actual
demo has 11 and 6**, matching the specification (نسخه ۳). The knowledge layer
follows the demo's files, not its README.

### Two design-system details that will otherwise be re-discovered

- **`--ink-3`** is `#9C8A85` in the theme file but **overridden to `#817169`** in
  the brand stylesheet. **Use `#817169`.**
- The design system's tables write hex values in **uppercase** (`#B56B6B`) while
  its §46 CSS block writes them in **lowercase** (`#b56b6b`). They are the same
  values. The lowercase block is canonical.

### On-premise is a design constraint, not a deployment option

Three decisions exist **because a clinic installs this on its own server**, and
each will look like over-engineering without that context:

- The **worker uses a database-backed job queue**, not Redis or a broker
  (ADR-0006) — an on-premise install must need nothing beyond PostgreSQL.
- The **font is self-hosted**, not loaded from a CDN (`07-localization.md` §2) —
  the product must render correctly with no internet.
- The **Jalali calendar is computed in-house**, not via `Intl` (ADR-0010) — ICU
  data varies between the build machine and the clinic's server, and a date that
  renders one day off is the failure this product cannot afford.

**Any proposal to add an external service must clear this bar first.**

---

## Template for new entries

```markdown
## ۱۴۰۵/MM/DD — <what happened>

**The fact.** What was learned, stated so it can be acted on.

**Why it matters.** What goes wrong without it.

**What to do instead.** The specific action.

**Where it lives now.** If it became a document or an ADR, name it.
```

---

## What does not belong here

- Anything already in `docs/knowledge/` or `docs/roadmap/`. Update those instead.
- Anything derivable from the code or from `git log`.
- Speculation, intentions, or a plan. Those go in `docs/roadmap/phases.md`.
- Anything that only mattered to one session.
