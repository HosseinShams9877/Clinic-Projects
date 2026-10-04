# 08 — UI Design System

> **This is the single source of truth for the product's visual language.**
> It is a faithful preservation of the Clinic demo's design system, extracted
> from the real demo files. It is **not** a starting point for a redesign.
>
> **Never re-derive a value.** No colour, radius, shadow, spacing, font size, or
> dimension in this document may be invented, approximated, or replaced by a
> framework default. Every value below is exact. Changing any value in this file
> requires an ADR in `roadmap/decisions.md`.
>
> The goal is **not** to redesign the product. The goal is to reproduce the
> visual language of the demo consistently across the new application. If a new
> screen is needed, it must reuse the same palette, typography, radii, spacing,
> shadows, button states, badge system, form controls, and icon language. A new
> component is introduced **only** when a product requirement genuinely needs
> one — and it must look like it belongs to this system.
>
> Source artifact: `clinic_demo_ui_design_system_for_deepseek (1).md` (47
> sections), derived from `clinic/assets/css/{brand,panel,site,theme}.css`.

---

## 1. Visual identity

| Property | Value |
|---|---|
| Direction | **RTL** (hard constraint — there is no LTR mode) |
| Language | **Persian** |
| Font family | **Vazirmatn** |
| Fallback stack | `IRANSansX, IRANSans, IRANYekan, Segoe UI, Tahoma, sans-serif` |
| Overall style | Clean, premium, soft, medical/beauty, minimal |
| Surfaces | Mostly white |
| Background | Warm off-white |
| Brand | Muted dusty rose / warm rose — **never** bright red or pink |
| Borders | Very light warm beige |
| Shadows | Extremely subtle |
| Corners | Rounded, mostly 10–18px |
| Icons | Inline SVG, outline/line style, `stroke-width: 1.7`, rounded linecap/linejoin |

---

## 2. Colour tokens

### 2.1 Brand

| Token | HEX | Usage |
|---|---|---|
| `--brand` | `#B56B6B` | Primary brand colour |
| `--brand-btn` | `#AF5D5D` | Primary button fill |
| `--brand-600` | `#A35C5C` | Primary button hover |
| `--brand-700` | `#8E4C4C` | Brand text / dark brand |
| `--brand-300` | `#D9A7A7` | Borders, soft accent |
| `--brand-100` | `#F4E3E0` | Accent background |
| `--brand-50` | `#FBF1EE` | Soft brand background |

### 2.2 Surfaces

| Token | HEX |
|---|---|
| `--bg` | `#F7F2F0` |
| `--bg-alt` | `#FBF7F5` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#FDFAF9` |
| `--surface-sunken` | `#F6EFEC` |
| `--sidebar-dark` | `#241C1B` |
| `--sidebar-dark-2` | `#171111` |
| `--grad-a` | `#F3EBE6` |
| `--grad-b` | `#EEE3DC` |

### 2.3 Text / Ink

| Token | HEX |
|---|---|
| `--ink` | `#2E2524` |
| `--ink-2` | `#6E5F5B` |
| `--ink-3` | `#817169` |
| `--ink-inverse` | `#FFFFFF` |

> **Discrepancy, resolved.** The demo's `theme.css` defines `--ink-3` as
> `#9C8A85`; `brand.css` overrides it to `#817169`. **Use `#817169`** — that is
> the value the product renders with.

### 2.4 Borders

| Token | HEX |
|---|---|
| `--line` | `#EDE2DE` |
| `--line-2` | `#E3D5D0` |

### 2.5 Status

| Status | Foreground | Background |
|---|---|---|
| Success | `#3F8F68` | `#E6F3EC` |
| Warning | `#B88424` | `#FBF0DA` |
| Danger | `#C25B62` | `#F9E5E6` |
| Dark danger | `#8B3941` | `#F2DEDF` |
| Info | `#4F7FA8` | `#E6EEF5` |
| Neutral | `#6E5F5B` | `#F0EBE9` |

### 2.6 Semantic source tags

| Source | Background | Text |
|---|---|---|
| Instagram | `#FDEAF3` | `#B8437E` |
| WhatsApp | `#E6F4EA` | `#2F7D4F` |
| Website | `#EAEEFB` | `#4A5BB5` |
| Phone | `#FDF0E3` | `#A96E28` |
| Referral | `#F0EBFA` | `#6B52AB` |

These five are the acquisition sources (`06-constants.md` §4.7) and their colours
are fixed.

---

## 3. Typography

**Font:** Vazirmatn · **Fallback:** see §1.

**Base:** body `14px`, line-height `1.75`.

| Size token | Value |
|---|---|
| xs | 11.5px |
| sm | 13px |
| md | 14px |
| lg | 16px |
| xl | 19px |
| 2xl | 24px |
| 3xl | 32px |
| 4xl | 42px |

**Heading mapping**

| Heading | Size / weight |
|---|---|
| H1 | 32px / 700 |
| H2 | 24px / 700 |
| H3 | 19px / 700 |
| H4 | 16px / 700 |

**Weights:** headings 700 · labels and buttons 600 · brand name 800 · body 400.
Avoid overly bold typography. Heading letter-spacing is approximately `-0.2px`.

---

## 4. Spacing scale

`s1` 4px · `s2` 8px · `s3` 12px · `s4` 16px · `s5` 20px · `s6` 24px · `s7` 32px ·
`s8` 40px · `s9` 56px · `s10` 72px

**Use this scale consistently instead of arbitrary spacing.** An off-scale value
is a finding.

---

## 5. Border radius

`xs` 6px · `sm` 10px · `md` 14px · `lg` 18px · `xl` 24px · `pill` 999px

**Typical usage:** inputs and buttons `10px` · cards `18px` · large hero/media
`24px` · badges, chips and avatars `pill` · modal `24px`.

---

## 6. Shadows

| Token | Value |
|---|---|
| `--sh-1` | `0 1px 2px rgba(46,37,36,.04)` |
| `--sh-2` | `0 2px 10px rgba(46,37,36,.06)` |
| `--sh-3` | `0 10px 30px rgba(46,37,36,.10)` |
| `--sh-brand` | `0 8px 20px rgba(181,107,107,.22)` |

**Philosophy:** subtle, warm-tinted, never heavy. Cards normally use `sh-1`;
hover cards may use `sh-2`; modal and sidebar overlays may use `sh-3`; the
primary CTA uses the brand shadow.

---

## 7. Global layout

| Constant | Value |
|---|---|
| Container max width | **1240px** |
| Desktop sidebar width | **228px** |
| Topbar height | **68px** |
| Public site header height | **76px** |
| Page content padding (desktop) | 24px |
| Panel content padding (smaller screens) | 16px |

---

## 8. Buttons

**Base:** inline-flex · centred both axes · `gap: 8px` · `padding: 10px 18px` ·
`radius: 10px` · `font-size: 13px` · `font-weight: 600` · `white-space: nowrap` ·
`transition: .18s ease`.

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `#AF5D5D` | white | same as bg | `#A35C5C` (+ brand shadow) |
| Soft | `#FBF1EE` | `#8E4C4C` | transparent | bg `#F4E3E0` |
| Ghost | transparent | `#6E5F5B` | transparent | bg `#F6EFEC` |
| Outline | transparent | `#8E4C4C` | `#D9A7A7` | bg `#FBF1EE` |
| Danger | `#F9E5E6` | `#C25B62` | transparent | slightly darker danger bg |

**Sizes:** default `10px 18px` · large `14px 26px`, radius 14px, font 14px ·
small `6px 12px`, radius 6px, font 11.5px · icon button `36×36`, radius 10px ·
block `width: 100%`.

---

## 9. Button states

**Every button must support all six:** default · hover · active · disabled ·
loading · focus-visible.

| State | Rule |
|---|---|
| **Focus** | `outline: 2px solid brand; outline-offset: 2px` |
| **Loading** | Preserve the button's dimensions; replace the icon/text area with a compact spinner; must not cause layout shift |
| **Disabled** | Reduce contrast; preserve the shape; `cursor: not-allowed` |
| **Active** | A visible pressed treatment, distinct from hover |
| **Hover** | Per-variant, §8 |
| **Default** | Per-variant, §8 |

A button missing a focus-visible or loading state is an accessibility finding.

---

## 10. Badge / status

**Base:** inline-flex · `gap: 6px` · `padding: 4px 11px` · pill radius ·
`font: 11.5px` · `weight: 600` · default neutral background `#F0EBE9`.

| State | Background | Text |
|---|---|---|
| Success | `#E6F3EC` | `#3F8F68` |
| Warning | `#FBF0DA` | `#B88424` |
| Danger | `#F9E5E6` | `#C25B62` |
| Dark danger | `#F2DEDF` | `#8B3941` |
| Info | `#E6EEF5` | `#4F7FA8` |
| Brand | `#FBF1EE` | `#8E4C4C` |

The default badge contains a **6px circular dot**; the `.no-dot` modifier removes
it. (The manager column in the permission matrix uses `badge brand no-dot` —
see `04-roles-permissions.md` §2.)

**Semantic labels in use:** در حال انجام · تکمیل شده · در انتظار · لغو شده ·
فعال · غیرفعال · پرداخت شده · پرداخت نشده · جدید · ویژه.

---

## 11. Tags

Small pill-ish tags: `padding: 3px 10px` · `radius: 6px` · `font: 11.5px` ·
`weight: 600`. Use the semantic colours in §2.6 for Instagram, WhatsApp,
Website, Phone, and Referral.

---

## 12. Cards

**Base:** background white · `border: 1px solid #EDE2DE` · `radius: 18px` ·
shadow `sh-1`.

**Padding:** standard 20px · header `16px 20px` · body/foot may use the same.

**Hover** (interactive cards only): subtle upward movement ~3px · shadow `sh-2` ·
border may shift toward `brand-300`.

---

## 13. Inputs / forms

| Element | Spec |
|---|---|
| Field | vertical layout, `gap: 7px` |
| Label | 13px, weight 600, `#6E5F5B` |
| Required marker | `#C25B62` |
| Input / select / textarea | width 100%, `padding: 11px 16px`, white bg, border `#E3D5D0`, radius 10px, font 13px |
| Placeholder | `#817169` |
| **Focus** | border `#D9A7A7`, `box-shadow: 0 0 0 3px #FBF1EE`, no default browser outline |
| Textarea | `min-height: 96px`, line-height 1.8 |
| Select | custom chevron, aligned to the **left** because of RTL |
| Search | icon 17px, background `#F6EFEC`, transparent border, returns to white on focus, icon on the left side |
| Checkbox | `17×17`, accent colour brand |

---

## 14. Selection cards

For radio/tile selection: `padding: 16px` · `border: 1.5px solid #EDE2DE` ·
`radius: 14px` · white background.

| State | Treatment |
|---|---|
| Hover | border `#D9A7A7`, background `#FBF1EE` |
| Active | border `#B56B6B`, background `#FBF1EE`, `0 0 0 3px` brand-50 |
| Icon box | `38×38`, radius 10px, `brand-50` background, brand icon |
| Active icon | brand background, white icon |

---

## 15. Appointment / time slot

| State | Treatment |
|---|---|
| Base | `padding: 9px 4px` · `border: 1px solid #E3D5D0` · radius 10px · centred · 13px / 600 |
| Hover | `brand-300` border, `brand-700` text |
| Active | brand background, white text, brand border |
| Unavailable | `surface-sunken` background, muted text, **no border**, line-through, `cursor: not-allowed` |

The unavailable state carries meaning: an unavailable slot shows no border and is
struck through, so it cannot be mistaken for a selectable one.

---

## 16. Day picker

**Grid:** minimum card width ~88px · `gap: 8px`.

**Day:** `padding: 10px 6px` · border `#E3D5D0` · radius 10px · white background ·
centred.

**Active:** brand background, white main text, secondary text uses translucent
white.

**Available indicator:** success green.

---

## 17. Tabs

**Segmented tabs** — container: background `#F6EFEC`, `padding: 4px`,
radius 14px, `gap: 4px`. Tab: `padding: 8px 16px`, radius 10px, 13px, weight 600,
text `#6E5F5B`. **Active:** white background, `brand-700` text, subtle shadow.

**Underline tabs** — bottom border `#EDE2DE`, `gap: 24px`, tab padding `12px 0`,
active colour brand, active bottom border `2px solid brand`.

---

## 18. Table

| Element | Spec |
|---|---|
| Table | font 13px |
| Header | background `#F6EFEC`, text `#817169`, font 11.5px, weight 600, `padding: 11px 16px` |
| Body | `padding: 13px 16px`, bottom border `#EDE2DE` |
| Row hover | background `#FDFAF9` |
| Action icon | `34×30`, `brand-50` background, `brand-700` icon, hover `brand-100` |

---

## 19. Avatar

Default `36×36`, circular, `brand-50` background, `brand-700` text, bold.

**Sizes:** sm `28×28` · default `36×36` · lg `64×64` · xl `92×92`.
**Images:** `object-fit: cover`.

---

## 20. Alerts

**Base:** `display: flex` · `gap: 12px` · `padding: 16px` · radius 14px ·
font 13px.

| Variant | Background | Text | Border |
|---|---|---|---|
| Warning | `#FBF0DA` | `#7D5A13` | `rgba(184,132,36,.18)` |
| Danger | `#F9E5E6` | `#8B3941` | — |
| Info | `#E6EEF5` | `#2F5A7D` | — |
| Success | `#E6F3EC` | `#276147` | — |

**Icon:** `19×19px`.

> Note the alert text colours are **darker** than the badge foreground colours in
> §2.5. Both sets are correct; they are different components.

---

## 21. Modal

**Overlay:** `rgba(46,37,36,.45)` · backdrop blur 2px · full viewport · centred.

**Modal:** white · **max-width 560px** · **radius 24px** · shadow `sh-3` ·
`max-height: 92vh` · internal scroll when needed.

---

## 22. Empty state

Centred · generous vertical padding · muted text · icon ~42px · icon opacity
~45% · the primary action may be a brand button. The copy explains the next
action (`07-localization.md` §8).

---

## 23. Upload box

Dashed border 1.5px, colour `#E3D5D0` · radius 14px · background `#FDFAF9` ·
centred · generous padding.

**Hover:** border `brand-300`, background `brand-50`, text `brand-700`.

---

## 24. Progress bar

Normal: height 8px, pill radius, background `#F6EFEC`.
Progress: brand background, pill radius.
Small: height 5px.

---

## 25. Stepper

Step number `28×28`, circular.

| State | Treatment |
|---|---|
| Default | `surface-sunken` + muted |
| Done | success background + success text |
| Active | brand background + white |

Active step label: `ink` + bold. Connector: `26×2`, colour `line-2`.

---

## 26. Sidebar (light)

| Element | Spec |
|---|---|
| Desktop | width 228px, white background, border on the inline edge per RTL, sticky, full viewport height |
| Brand area | `padding: 24px 20px 20px`; logo icon box `38×38`, radius 14px, `brand-50` background, brand icon |
| Navigation | `padding: 8px 12px 20px` |
| Nav item | `padding: 10px 12px`, radius 10px, 13px, weight 600, `gap: 12px` |
| Normal | text `#6E5F5B` |
| Hover | bg `#F6EFEC`, text `ink` |
| Active | bg `#FBF1EE`, text `#8E4C4C`, icon brand |
| Navigation icon | `19×19px` |
| Count badge | danger red, white text, minimum `19×19`, pill |

---

## 27. Sidebar (dark variant)

Sidebar `#241C1B`.

| Element | Treatment |
|---|---|
| Brand icon background | `rgba(255,255,255,.08)` |
| Brand icon | `#D9A7A7` |
| Brand name | white |
| Brand subtitle | `rgba(255,255,255,.45)` |
| Nav normal | `rgba(255,255,255,.66)` |
| Nav hover | bg `rgba(255,255,255,.06)` + white text |
| Nav active | bg `rgba(255,255,255,.10)` + white text |
| Nav active icon | `brand-300` |

Use the dark variant only where the demo uses the dark navigation theme.

---

## 28. Topbar

Height **68px** · white background · bottom border `#EDE2DE` · sticky at top 0 ·
horizontal padding 24px desktop.

| Element | Spec |
|---|---|
| Search | max-width 560px, pill radius, vertical padding ~10px |
| Icon button | `38×38`, radius 10px, muted icon, hover `surface-sunken` |
| Notification dot | danger, small pill, white border around the dot |
| User chip | pill radius, avatar + name + role, hover `surface-sunken` |
| Date chip | `surface-sunken`, radius 10px, `padding: 8px 12px` |

---

## 29. Public header

Height **76px** · sticky · white with slight transparency
`rgba(255,255,255,.92)` · backdrop blur 10px · bottom border.

| Element | Spec |
|---|---|
| Logo | icon 30px, brand colour, name 19px / weight 800 |
| Menu | horizontal, `gap: 24px`, 13px / 600, muted text, active and hover brand |
| Mobile | hamburger replaces the desktop navigation |

---

## 30. Hero

**Background:** `linear-gradient(105deg, #FBF1EE 0%, #F3EBE6 55%, #EEE3DC 100%)`

| Element | Spec |
|---|---|
| Desktop | 2-column layout, `gap: 40px`, vertical padding 72px |
| H1 | 42px, line-height 1.45 |
| Highlighted text | brand colour, `display: block` |
| Paragraph | 16px, muted, line-height 2 |
| Actions | `gap: 12px`, `margin-top: 24px` |
| Media | aspect ratio 16/11, radius 24px, overflow hidden, background `brand-100` |

---

## 31. Trust bar

White background · bottom border · 4-column desktop grid · vertical padding 24px ·
each item centred · vertical divider between items · icon 26px, brand colour ·
title 13px bold · subtitle 11.5px muted.

---

## 32. Service cards

White · border `line` · radius 18px · overflow hidden · hover `translateY(-3px)` ·
hover shadow `sh-2` · hover border `brand-300`.

| Element | Spec |
|---|---|
| Image | 4:3 |
| Body | padding 16px, centred, compact vertical spacing |
| Floating icon | `34×34`, circular, `brand-50`, brand icon, white 3px border, overlapping the image/body boundary |
| Price | `brand-700`, 13px, bold |

---

## 33. Doctor cards

White · border · radius 18px · square image · body padding 16px · name 13px bold ·
subtitle 11.5px muted.

**Arrow button:** `32×32` · circular · `brand-50` · brand icon · hover becomes
brand background with a white icon.

---

## 34. Before / after

Two-image grid: `gap: 3px` · radius 14px · overflow hidden.

**Caption:** dark translucent `rgba(46,37,36,.72)` · white text · 11.5px · small
radius.

> These images require written, revocable consent — immutable rule 6
> (`06-constants.md` §1).

---

## 35. Calendar / scheduler

**Calendar day:** `min-height: 62px` · border `line` · radius 10px · centred.
**Active:** brand background, white text. **Unavailable:** `surface-sunken`,
muted.

**Appointment blocks:** radius 10px · `padding: 8px 12px` · small font ·
coloured start border **3px**.

| State | Colour |
|---|---|
| busy | brand |
| ok | green |
| warn | amber |
| dang | red |
| free | muted / neutral |

**Scheduler cells:** min-height ~46px · radius 10px · 7–9px internal padding.
**Free cell:** dashed border, transparent, hover `brand-50`.
**Blocked:** red striped background, dashed danger border.
**Off:** neutral striped background, muted text.

> Reminder: the week starts on **شنبه** (Saturday) — see `07-localization.md`
> §6.4. The grid's column order obeys this.

---

## 36. Pagination

Each page button `34×34` · radius 10px · border `line` · white · 13px / 600.
**Active:** brand background, white text, brand border. **Gap:** 4px.

---

## 37. Filter chips

Pill · `padding: 7px 15px` · 13px / 600 · white · border `line` · muted text.
**Hover:** `brand-300` border, `brand-700` text. **Active:** brand background,
white text.

---

## 38. KPI cards

Variants: default · amber · green · blue · red. The icon area uses the
corresponding status background and colour.

**Keep KPI cards visually calm — do not use saturated solid backgrounds for the
whole card.**

---

## 39. Quick action tile

`brand-50` background · transparent border · radius 18px · padding 20px ·
centred · `brand-700` text · bold.

**Hover:** `brand-100` background, `brand-300` border, `translateY(-1px)`.

---

## 40. Timeline

Vertical timeline · icon node `32×32` · circular · `brand-50` · brand icon ·
connector 2px line · item `gap: 12px`.

---

## 41. Notification / toast

Same visual language as alerts (§20): rounded 14px · compact padding · semantic
status background · semantic icon · close action on the opposite side · subtle
shadow if floating.

---

## 42. Icons

The product does **not** use a heavy icon font. Icons are **inline SVG**.

**Default characteristics:** outline icon · `fill="none"` · `stroke="currentColor"`
· `stroke-width="1.7"` · `stroke-linecap="round"` · `stroke-linejoin="round"`.

| Size | Use |
|---|---|
| 14px | compact action icons |
| 15–16px | card / action icons |
| 17px | form, search, date icons |
| 19px | sidebar, topbar |
| 20px | quick actions |
| 22–30px | branding, hero, trust |

If an icon library replaces inline SVG, use one with the **same visual
characteristics** — prefer a rounded outline family. **Do not use filled, 3D, or
multicolour icons.**

**Categories in use:** home · dashboard · calendar · appointment · users · doctor ·
services · reports · settings · search · notification · phone · email · location ·
Instagram · Telegram · menu · close · edit · delete · view · arrow · clock ·
payment · shield · sparkles · skin/beauty treatment · upload · download ·
chevron · filter.

**Direction-aware mirroring:** icons that encode direction (arrow, chevron, back,
next) follow the RTL layout; icons that encode real-world objects (phone, camera,
clock face) are never mirrored. See `07-localization.md` §3.3.

---

## 43. Responsive rules

**Desktop:** full sidebar · multi-column cards/grids · full public navigation.

**At ≤ 1000px:**
- Sidebar becomes fixed off-canvas.
- Hamburger / nav toggle appears.
- Content padding becomes **16px**.
- Topbar horizontal padding becomes **16px**.
- Date chip and user metadata may hide.

**At mobile:**
- Grids collapse.
- Calendar gaps shrink.
- Calendar secondary availability labels may hide.
- Tables become horizontally scrollable.
- Public navigation collapses to a hamburger.
- Preserve large touch targets.
- Avoid dense text.

---

## 44. UX / visual principles

1. Keep the interface calm and premium.
2. Use warm whites rather than cold grey backgrounds.
3. Brand colour is muted rose, not bright red or pink.
4. Use colour mainly for actions and semantic states.
5. Avoid excessive shadows.
6. Avoid excessive gradients; the gradient is primarily used in the hero.
7. Cards should have thin warm borders.
8. Rounded corners are a major visual characteristic.
9. Icons should remain outline-based and lightweight.
10. Persian text must be rendered RTL correctly.
11. Keep hierarchy through spacing, weight, and muted text rather than large
    colour blocks.
12. Do not introduce random colours outside the semantic token system.
13. Use the same component language across the public site and the dashboards.
14. Interactive components need clear hover, focus, active and disabled states.
15. **Preserve the exact token system when creating new pages.**

---

## 45. Implementation instruction (binding)

When generating new UI for this project:

- Treat this document as the source of truth for visual design.
- **Do not invent a new colour palette.**
- **Do not replace the dusty-rose brand with blue, purple, or green.**
- **Do not use Tailwind default colours as visual choices.**
- Use CSS variables/tokens for **all** colours, spacing, radii and shadows.
- Use Vazirmatn for Persian.
- Use RTL.
- Use outline icons with approximately 1.7px stroke.
- Keep cards white with warm borders.
- Keep the background warm off-white.
- Keep controls rounded.
- Use semantic status colours only for status meaning.
- Match the component states described above.
- New components must visually look like they belong to the same design system.

---

## 46. Exact core token block

This block is the implementation contract. It is reproduced exactly as it appears
in the demo's `brand.css`. **It is copied into `src/app/globals.css` without
modification.**

```css
:root {
  --brand: #b56b6b;
  --brand-btn: #af5d5d;
  --brand-600: #a35c5c;
  --brand-700: #8e4c4c;
  --brand-300: #d9a7a7;
  --brand-100: #f4e3e0;
  --brand-50: #fbf1ee;

  --bg: #f7f2f0;
  --bg-alt: #fbf7f5;
  --surface: #ffffff;
  --surface-2: #fdfaf9;
  --surface-sunken: #f6efec;

  --sidebar-dark: #241c1b;
  --sidebar-dark-2: #171111;

  --ink: #2e2524;
  --ink-2: #6e5f5b;
  --ink-3: #817169;
  --ink-inverse: #ffffff;

  --line: #ede2de;
  --line-2: #e3d5d0;

  --ok: #3f8f68;
  --ok-bg: #e6f3ec;

  --warn: #b88424;
  --warn-bg: #fbf0da;

  --danger: #c25b62;
  --danger-bg: #f9e5e6;

  --dark-danger: #8b3941;
  --dark-danger-bg: #f2dedf;

  --info: #4f7fa8;
  --info-bg: #e6eef5;

  --neutral-bg: #f0ebe9;

  --r-xs: 6px;
  --r-sm: 10px;
  --r-md: 14px;
  --r-lg: 18px;
  --r-xl: 24px;
  --r-pill: 999px;

  --sh-1: 0 1px 2px rgba(46,37,36,.04);
  --sh-2: 0 2px 10px rgba(46,37,36,.06);
  --sh-3: 0 10px 30px rgba(46,37,36,.10);
  --sh-brand: 0 8px 20px rgba(181,107,107,.22);

  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-7: 32px;
  --s-8: 40px;
  --s-9: 56px;
  --s-10: 72px;

  --fs-xs: 11.5px;
  --fs-sm: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --fs-xl: 19px;
  --fs-2xl: 24px;
  --fs-3xl: 32px;
  --fs-4xl: 42px;

  --sidebar-w: 228px;
  --topbar-h: 68px;
  --container: 1240px;
}
```

**Note:** the values in §2.1–§2.4 and §6–§7 above are written in uppercase hex
and longhand for readability; **this lower-case block is the canonical form** and
is what ships. The two are the same values.

---

## 47. Final instruction

The goal is **not** to redesign the product.

The goal is to **reproduce the visual language of the provided Clinic demo
consistently across the new application.**

If a new screen is required, reuse:
the same palette · the same typography · the same radius · the same spacing
scale · the same shadows · the same button states · the same badge/status system ·
the same form controls · the same card/table/navigation patterns · the same
outline icon language.

Only introduce a new component when the product requirement genuinely needs it,
and make it visually consistent with this system.

---

## A. Enforceable rules (the checkable summary)

| # | Rule |
|---|---|
| A1 | No component hard-codes a hex value. Every colour comes from a token. |
| A2 | No Tailwind default palette colour is used as a visual choice. |
| A3 | Every spacing value comes from the `--s-*` scale. |
| A4 | Every radius comes from the `--r-*` scale. |
| A5 | Every shadow comes from the `--sh-*` scale. |
| A6 | Every font size comes from the `--fs-*` scale (11.5 / 13 / 14 / 16 / 19 / 24 / 32 / 42). |
| A7 | Every icon is outline, `stroke-width: 1.7`, rounded caps and joins. No filled, 3D, or multicolour icons. |
| A8 | Every interactive element implements all six states (§9). |
| A9 | Layout uses logical properties only (`margin-inline-start`, never `margin-left`). |
| A10 | The week starts on Saturday in every calendar grid. |
| A11 | The responsive breakpoint is **≤ 1000px**, with 16px content and topbar padding below it. |
| A12 | The modal max-width is 560px and its radius is 24px. |
| A13 | Semantic status colours are used only for status meaning, never decoratively. |
| A14 | Persian text renders RTL with Persian digits and Jalali dates (§ `07-localization.md`). |

---

## B. What Phase 1 does with this

Phase 1 implements these as:
- `src/app/globals.css` — the §46 token block, verbatim, in `:root`, and the single
  source of truth for styling.
- `src/core/components/**` — components styled with Tailwind utilities, consuming
  only tokens. The engine reads the `:root` block through `@theme`, so a utility
  resolves to a §46 value and to nothing else.
- Vazirmatn loaded through `next/font/local`, self-hosted, no CDN
  (`07-localization.md` §2).
- A visual regression baseline captured from the demo, so any drift between the
  implementation and this document fails a test rather than being noticed by a
  customer.

> **The mechanism changed; the system did not.** Phase 1 wrote one CSS Module per
> component. That has been reversed in favour of Tailwind v4 — `01-tech-stack.md`
> §1 records the decision, and §48.5 records the one rule of this document that the
> reversal touched. The tokens, the values, the visual language and the demo as the
> reference artifact are all unchanged: this document still governs every pixel, and
> a utility that would introduce a colour, radius, spacing or shadow the token block
> does not define is wrong — the token is added to the block instead.

The source demo files under `clinic/` remain in the repository as the reference
artifact for any visual question this document does not settle.

---

## 48. Recorded exceptions

Every place the built components depart from the rules above, and why each is a
decision rather than a defect. Each entry names the rule it excepts, what the code
does instead, and what would close it; Appendix A.1 of `reports/phase-01-report.md`
traces each one, and closing one means an ADR in `roadmap/decisions.md`.

### 48.1 A sixth button variant, `neutral` — excepts §8

§8's table names five variants and its "Base" line gives geometry only, with no
colour. `BUTTON_VARIANTS` ships six; the sixth is the default — `neutral` is
`--surface` on a `--line` border with `--ink` text, hovering `--surface-2` on
`--line-2`. `theme.css` draws that appearance in `.btn` itself, so all five §8 rows
are modifiers on it, and no §8 row reproduces the bare class, since Ghost and
Outline are both transparent and neither carries `--ink` text. §B makes the demo the
reference for what this document does not settle, and this is the question it
settles: the bare element maps to the bare class, so `<Button>` is `<button
class="btn">`. Closes when §8 gains a row for the base button, until which the table
is the set §8 *enumerates*, not all ordinary buttons.

### 48.2 Control geometry is quoted, not snapped — excepts rule A3

A3 sends every spacing value to the `--s-*` scale; §8 and §13 state control
geometry the scale cannot reach — `10px 18px`, `14px 26px`, `6px 12px`, the icon
button's `36×36`, §13's `gap: 7px`, `padding: 11px 16px`, `min-height: 96px` and
its ring's `3px`. None is a scale step, so A3 and §8/§13 cannot both hold. The
components write §8's and §13's values as literals and take everything the scale
*does* reach from a token — the control's horizontal `16px` is `--s-4`, the
button's `gap: 8px` is `--s-2`. Snapping would resize every control away from the
demo; the reading taken is that A3 governs the space *between* things and a
control's own geometry belongs to the section that states it. Closes when §46 gains
steps for the geometry, or when A3 is narrowed to layout spacing.

### 48.3 The pressed state is derived — excepts §9

§9 requires "a visible pressed treatment, distinct from hover" and states no value
for it, and the preamble forbids inventing one. Each variant therefore takes the
next step on the ramp it already uses — `--surface` → `--surface-2` →
`--surface-sunken`, `--brand-50` → `--brand-100` — and contracts by `transform:
scale(0.97)`. The transform is load-bearing: Soft, Ghost and Danger hover on
backgrounds whose next darker step fails AA behind their text — `--brand-300`
behind `--brand-700` is 3.6:1 — and a transform gives them a press the contrast
floor permits. Closes when §9 or §8 states the pressed values.

### 48.4 The keyboard focus ring is added to §13's focus treatment — excepts §13

§13 fixes focus as border `#D9A7A7`, `box-shadow: 0 0 0 3px #FBF1EE` and "no
default browser outline". The control class string (`src/core/components/form/control-classes.ts`)
honours all three and adds a fourth on `:focus-visible`, `outline: 2px solid var(--brand)`
at a `2px` offset. §13's `outline: none` on `:focus` cancels the product's *own* ring
along with the browser's, and §13's ring cannot stand in for it: `--brand-50` on
`--surface` is about 1.1:1, under SC 1.4.11's 3:1 for a non-text boundary, on the
control a keyboard user is about to type into; the brand outline is 3.98:1. An
addition, not a contradiction — "no default browser outline" is the UA's ring, and
the brand ring is the product's, which §9 states as *the* focus treatment. Closes
when §13 names a focus treatment that already clears 3:1, at which point the added
rule deletes itself.

### 48.5 Styling is Tailwind, not CSS Modules — excepts §B, and closes the family question

§B was written when the styling mechanism was one CSS Module per component. That
mechanism is gone: `src/` holds no `*.module.css`, and components are styled with
Tailwind utilities that read the §46 token block through `@theme` in
`src/app/globals.css`. `01-tech-stack.md` §1 records the decision and the reason.

The rule this entry was originally about — whether "one per component" means one per
*component* or one per *family* — is settled by the reversal rather than by a ruling
on the ambiguity, and settled the way the wider reading argued for: the form family
shares one class string, exported from `src/core/components/form/control-classes.ts`,
so §13's control geometry is stated once and `TextInput` and `TextArea` cannot drift
apart. §8.5's shell composes it rather than restating it, which is the same
reasoning, and the demo's `button/Button.module.css` — a one-component directory —
could never have distinguished the two readings anyway. **Closed.**

Two things the reversal does *not* close, because they are properties of the design
system and not of the mechanism:

- A utility that introduces a colour, radius, spacing, shadow or font weight the
  token block does not define is still a finding; the token is added to the block.
- The compiled stylesheet resolves utilities by their order in the generated CSS, not
  by the order of the `class` attribute. Two utilities on one element that each set
  the same property are decided by that order, so a component's class strings are
  written with each variant and each state naming every property it owns — the base
  string states none — and a call site's `className` is appended last. See
  `src/core/components/button/Button.tsx`'s header for the concrete case.

### 48.6 The 22–30px branding icon size is not in `ICON_SIZES` — excepts §42

§42's table has six size rows and `ICON_SIZES` ships five — `compact` 14, `card`
16, `control` 17, `nav` 19 and `action` 20 — with the 22–30px branding row absent.
It is a *range* with no single value, and the preamble forbids approximating a
dimension — choosing 26 would be inventing a value this document does not state, and
§29's 30px logo is the one member stated exactly, which belongs to the surface that
renders it. Closes when §42 states one value for the row; until then a surface
needing one names it in its own module.

### 48.7 `THEME_COLOR` is the one colour literal — excepts §45 and rule A1

`src/app/theme.ts` exports `'#f7f2f0'` for `Viewport.themeColor`, the one colour
literal outside the §46 block. It cannot be a `var()`: Next emits it into `<meta
name="theme-color">`, which the browser reads before any stylesheet is applied to
paint the mobile address bar, and a computed-style variable has no value there. The
file states the constraint it cannot enforce, that the literal must equal `--bg` —
drift shows on a phone, not on a desktop. This one does not close; it is the
platform's limit, and `--bg` and `THEME_COLOR` stay one fact in two places, traced
only by that comment.

### 48.8 `globals.css` carries tokens beyond the §46 block — excepts §46 and §B

§B's "the §46 token block, verbatim" is true of the first `:root` block, character
for character; a second block follows it — the fallback stack and base metrics of §1
and §3, the layout constants of §7, the modal values of §21, §43's breakpoint,
`--transition-control`, and the `--z-*` order. Each is quoted from the section its
comment names, since §46 does not enumerate them and the alternative is a literal
per component; none overrides a §46 token.
`--transition-control` is the one that replaced a demo value: the demo's controls
use `.16s` — five times in `theme.css`, with `.15s` and `.2s` beside them — §13
states no duration for a control, and §8 pins `.18s ease`. Promoting the button's
`.18s` to the one control transition is how the system stays one system. Closes when
§46 enumerates these values and the second block dissolves into the first.

### 48.9 The demo's global paragraph margin is not adopted — excepts §B

The demo's base layer carries `p { margin: 0 0 var(--s-3) }` and a `:focus-visible`
rule whose third declaration is `border-radius: var(--r-xs)`. `globals.css` carries
the second and not the first — `p { margin: 0 }`. §B points at the demo for a margin
this document does not state, and its rule is a good one for prose — but
`Field` renders its hint and error as `<p>` inside a flex column spaced by §13's
`gap: 7px`, and a global 12px margin would make the field's spacing stop being the
field's. The focus rule's `border-radius` *is* carried, because rounding the ring on
focusable elements that set no corner of their own has to be global, and §9 does not
name it. Closes when prose surfaces exist — the public site, empty-state copy — at
which point a scoped prose style there is the margin's right home.

---

*Related: `07-localization.md` (font, RTL, digits, Jalali), `06-constants.md` §4.7
(the source-tag colours), `05-conventions.md` §9 and §14 (the styling rules and the
forbidden list), `roadmap/decisions.md` (any change to a value here requires an ADR).*
