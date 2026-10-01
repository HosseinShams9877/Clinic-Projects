# ADR-0021 — Headless primitives only; no styled component library

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0 addendum

**Context.** The design system (`08-ui-design-system.md`) defines every component
and every one of its states — colours, radii, shadows, spacing, type scale, button
states, the badge system, the icon language. It was supplied and preserved exactly,
and it is binding (ADR-0015's module discipline assumes it; rule A1 forbids a
hard-coded hex anywhere).

The product still needs components whose *behaviour* is genuinely hard to write
correctly: dialog, popover, select, tooltip, dropdown, tabs, and a searchable
select. Focus trapping, focus restoration, escape handling, collision-aware
positioning, typeahead, and correct `aria-*` wiring are each a source of real
accessibility defects.

**Decision.** **Build components from the design system. Use Radix UI and `cmdk`
for behaviour and accessibility only. Use Lucide for icons, outline-only, with the
stroke width overridden to 1.7.** **No styled component library is used, and no
component framework's theme is allowed to override the design system tokens.**

Concretely (`01-tech-stack.md` §8, `05-conventions.md` §17):

- Every headless primitive is wrapped in `src/core/components/**`, styled by a CSS
  Module that consumes only tokens, and exported as the product's own component.
  **Nothing in `src/modules/**` or `src/app/**` imports `@radix-ui/*` or `cmdk`
  directly.**
- **Only the primitives actually needed are installed** — not the full set, not a
  bundle. Each package is the single primitive it provides.
- Lucide's default `stroke-width` is 2; the design system requires **1.7**
  (`08-ui-design-system.md` §42, rule A7). The override lives in one wrapper and
  nowhere else, so a Lucide release changing its default cannot silently change
  the product's icon language.
- **No icon font** — a blocking request, no tree-shaking, no per-icon stroke
  control, and text-shaped placeholders before the font loads.
- **A new primitive is added to `01-tech-stack.md` §8 before it is used in a
  component.** A dependency added by a component is a stack decision, and stack
  decisions are recorded rather than discovered in a diff.

**Alternatives rejected.**

| Alternative | Why rejected |
|---|---|
| **shadcn/ui** | Its default theme would override the design system tokens — it ships a themed component set built on Tailwind and its own variable names. Making it match this design system means rewriting every component's styling anyway, at which point the value it provides over the underlying Radix primitive is gone. Adapting it costs more than building. |
| **Material UI / Chakra / Ant Design** | Heavy, opinionated, and the wrong visual language. Each brings a large runtime, its own theming system that competes with the token block, and a component appearance that reads as a different product. For a Persian clinic product the visual mismatch is the whole problem, not a detail. |
| **Copy-pasting component code from a framework** | The same theming problem as shadcn/ui, plus maintenance drift: the copied code stops receiving upstream fixes the moment it is copied, and it arrives carrying a licence and a hidden dependency on the framework's helpers. |
| **Writing every primitive from scratch** | Where the design system already specifies a component's *appearance* but not its *behaviour*, rewriting focus management and ARIA wiring is the fastest known way to ship accessibility defects. Radix is adopted precisely so those are not re-invented. |

**Consequences accepted.**

- **More component code is written by us.** Every wrapper's styling, states, RTL
  behaviour and Persian labels are ours. Accepted: that code is exactly the code
  the design system already specifies, and writing it is cheaper than fighting a
  theme.
- **The design system is preserved exactly.** No framework theme can override a
  token, so rule A1–A6 hold by construction rather than by review.
- **Every component state is documented and tested.** Every wrapper carries a test
  for focus trapping, focus restoration, escape, keyboard navigation and the
  RTL keyboard direction, plus an axe scan **in every state** the design system
  defines — not only the default (`10-testing-strategy.md` §17). This is more test
  code than a styled library would require, and it is the price of the previous
  point.
- **A smaller dependency surface**, since Radix primitives are individually
  installed and unstyled, and cmdk is small.

**Documented in.** `01-tech-stack.md` §8.2–§8.4 and §8.8, `05-conventions.md` §17,
`10-testing-strategy.md` §17, `08-ui-design-system.md` §42 and A7.
