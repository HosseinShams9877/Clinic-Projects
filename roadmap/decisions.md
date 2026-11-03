# ADRs

Architecture decision records. `docs/knowledge/08-ui-design-system.md` (preamble,
§46) requires one before any token value in that document changes.

---

## ADR-0001 — The medical blue/white palette override

**Date:** 2026-11-03 · **Status:** accepted · **Supersedes:** the colour and shadow
portion of `08-ui-design-system.md` §46 / §2 (values only — every other dimension
of the design system, the spacing scale, the radii, the typography, the component
contracts, is untouched and remains authoritative)

### Context

The design system was preserved from the Clinic demo, whose brand colour was a
muted dusty rose (`#B56B6B`). The product is a medical clinic; the demo's rose
read as cosmetic/beauty rather than clinical, and the product owner asked for the
visual language to move to a trustworthy medical blue over white and very light
icy blue, with the semantic status colours kept intact and harmonised to the new
blue.

### Decision

Replace the colour and shadow token **values** in `src/app/globals.css` `:root`.
The tokens themselves — their names, their numbers of steps, which namespace each
maps to — are unchanged, so every component that consumes a token restyled with
no component edit. Four steps the demo's block did not enumerate
(`--brand-200`, `--brand-800`, `--brand-900`, `--surface-3`) were added because
components already addressed them; without the declaration the utilities were
unresolvable and silently produced no CSS.

| Token | Was | Is |
|---|---|---|
| `--brand` | `#B56B6B` | `#2563EB` |
| `--brand-btn` | `#AF5D5D` | `#1D4ED8` |
| `--brand-600` | `#A35C5C` | `#1E40AF` |
| `--brand-700` | `#8E4C4C` | `#1E3A8A` |
| `--brand-300` | `#D9A7A7` | `#93C5FD` |
| `--brand-200` | — | `#BFDBFE` |
| `--brand-100` | `#F4E3E0` | `#DBEAFE` |
| `--brand-50` | `#FBF1EE` | `#EFF6FF` |
| `--bg` | `#F7F2F0` | `#F4F7FB` |
| `--bg-alt` | `#FBF7F5` | `#F9FBFD` |
| `--surface` | `#FFFFFF` | `#FFFFFF` (unchanged) |
| `--surface-2` | `#FDFAF9` | `#F7FAFD` |
| `--surface-3` | — | `#E9EFF6` |
| `--surface-sunken` | `#F6EFEC` | `#EDF2F9` |
| `--sidebar-dark` | `#241C1B` | `#10233E` |
| `--sidebar-dark-2` | `#171111` | `#1B355B` |
| `--ink` | `#2E2524` | `#1E293B` |
| `--ink-2` | `#6E5F5B` | `#475569` |
| `--ink-3` | `#817169` | `#64748B` |
| `--ink-inverse` | `#FFFFFF` | `#FFFFFF` (unchanged) |
| `--line` | `#EDE2DE` | `#E2E8F0` |
| `--line-2` | `#E3D5D0` | `#CBD5E1` |
| `--ok` / `--ok-bg` | `#3F8F68` / `#E6F3EC` | `#16A34A` / `#E8F7EE` |
| `--warn` / `--warn-bg` | `#B88424` / `#FBF0DA` | `#B45309` / `#FDF3DF` |
| `--danger` / `--danger-bg` | `#C25B62` / `#F9E5E6` | `#DC2626` / `#FEE2E2` |
| `--dark-danger` / `--dark-danger-bg` | `#8B3941` / `#F2DEDF` | `#B91C1C` / `#FBE3E3` |
| `--info` / `--info-bg` | `#4F7FA8` / `#E6EEF5` | `#1D4ED8` / `#E5EFFD` |
| `--neutral-bg` | `#F0EBE9` | `#EEF2F7` |
| `--sh-1/2/3` rgba base | `rgba(46,37,36,·)` | `rgba(15,23,42,·)` |
| `--sh-brand` | `rgba(181,107,107,.22)` | `rgba(37,99,235,.22)` |

`THEME_COLOR` in `src/app/theme.ts` follows `--bg` and is `#F4F7FB`.

### Consequences

- `08-ui-design-system.md` §46 and §2 remain the faithful record of the demo's
  own values and are **not** edited; they document the reference artifact, which
  is unchanged. The implementation contract now reads `globals.css` through this
  ADR.
- Brand contrast improved: `--brand` (#2563EB) on white is 5.2:1, so a
  `--brand-300` (#93C5FD) field behind `--brand-700` (#1E3A8A) text is 5.7:1 and
  passes AA — the old rose pair was 3.6:1 and failed.
- The clinical material legend in `src/app/_injections/injection-map-catalog.ts`
  is deliberately **not** changed: those colours are data identifiers on the
  body-map diagram, not UI chrome, and recolouring them risks the medical
  meaning.
- Non-token hard-coded colours that predated the theme pass (`bg-white`,
  `text-white`, `bg-black/40`, `#ba6a73`) were migrated to tokens. `bg-white` and
  `bg-black/*` had never resolved at all — Tailwind v4's cleared colour
  namespace made them no-ops — so the migration also fixed invisible overlays
  and surfaces.
