# UI Design System — Clinic Demo
## مرجع دقیق برای بازسازی UI در پروژه جدید

این سند از فایل‌های واقعی دمو استخراج شده و مرجع بصری/کامپوننتی پروژه است. هدف این است که بدون نیاز به ارسال فایل دمو، توسعه‌دهنده یا مدل AI بتواند ظاهر و رفتار UI را بازسازی کند.

---

## 1) هویت بصری اصلی

- Direction: RTL
- Language: Persian
- Font family: Vazirmatn
- Fallback: IRANSansX, IRANSans, IRANYekan, Segoe UI, Tahoma, sans-serif
- Overall style: clean, premium, soft, medical/beauty, minimal
- Surfaces: mostly white
- Background: warm off-white
- Brand: muted dusty rose / warm rose
- Borders: very light warm beige
- Shadows: extremely subtle
- Corners: rounded, mostly 10–18px
- Icons: inline SVG, outline/line style, `stroke-width: 1.7`, rounded linecap/linejoin

---

# 2) Color Tokens

## Brand

| Token | HEX | کاربرد |
|---|---|---|
| brand | `#B56B6B` | رنگ اصلی برند |
| brand-btn | `#AF5D5D` | دکمه اصلی |
| brand-600 | `#A35C5C` | Hover دکمه اصلی |
| brand-700 | `#8E4C4C` | متن/رنگ تیره برند |
| brand-300 | `#D9A7A7` | Border و accent ملایم |
| brand-100 | `#F4E3E0` | پس‌زمینه accent |
| brand-50 | `#FBF1EE` | Soft brand background |

## Surfaces

| Token | HEX |
|---|---|
| bg | `#F7F2F0` |
| bg-alt | `#FBF7F5` |
| surface | `#FFFFFF` |
| surface-2 | `#FDFAF9` |
| surface-sunken | `#F6EFEC` |
| sidebar-dark | `#241C1B` |
| sidebar-dark-2 | `#171111` |
| grad-a | `#F3EBE6` |
| grad-b | `#EEE3DC` |

## Text / Ink

| Token | HEX |
|---|---|
| ink | `#2E2524` |
| ink-2 | `#6E5F5B` |
| ink-3 | `#817169` در brand.css / `#9C8A85` در theme.css |
| ink-inverse | `#FFFFFF` |

نکته: فایل brand.css مقدار ink-3 را به `#817169` override می‌کند؛ در پیاده‌سازی نهایی همین مقدار استفاده شود.

## Borders

| Token | HEX |
|---|---|
| line | `#EDE2DE` |
| line-2 | `#E3D5D0` |

## Status Colors

| Status | Foreground | Background |
|---|---|---|
| Success | `#3F8F68` | `#E6F3EC` |
| Warning | `#B88424` | `#FBF0DA` |
| Danger | `#C25B62` | `#F9E5E6` |
| Dark Danger | `#8B3941` | `#F2DEDF` |
| Info | `#4F7FA8` | `#E6EEF5` |
| Neutral | `#6E5F5B` | `#F0EBE9` |

Additional semantic tag colors:
- Instagram: background `#FDEAF3`, text `#B8437E`
- WhatsApp: background `#E6F4EA`, text `#2F7D4F`
- Website: background `#EAEEFB`, text `#4A5BB5`
- Phone: background `#FDF0E3`, text `#A96E28`
- Referral: background `#F0EBFA`, text `#6B52AB`

---

# 3) Typography

Font:
`Vazirmatn`

Fallback:
`IRANSansX, IRANSans, IRANYekan, Segoe UI, Tahoma, sans-serif`

Base:
- body: 14px
- line-height: 1.75

Sizes:
- xs: 11.5px
- sm: 13px
- md: 14px
- lg: 16px
- xl: 19px
- 2xl: 24px
- 3xl: 32px
- 4xl: 42px

Heading mapping:
- H1: 32px / 700
- H2: 24px / 700
- H3: 19px / 700
- H4: 16px / 700

General:
- headings weight: 700
- labels / buttons: 600
- brand name: 800
- body: 400
- avoid overly bold typography
- letter spacing on headings: approximately -0.2px

---

# 4) Spacing

Base spacing scale:

- s1 = 4px
- s2 = 8px
- s3 = 12px
- s4 = 16px
- s5 = 20px
- s6 = 24px
- s7 = 32px
- s8 = 40px
- s9 = 56px
- s10 = 72px

Use this scale consistently instead of arbitrary spacing.

---

# 5) Border Radius

- xs = 6px
- sm = 10px
- md = 14px
- lg = 18px
- xl = 24px
- pill = 999px

Typical usage:
- inputs/buttons: 10px
- cards: 18px
- large hero/media: 24px
- badges/chips/avatar: pill
- modal: 24px

---

# 6) Shadows

- shadow-1: `0 1px 2px rgba(46,37,36,.04)`
- shadow-2: `0 2px 10px rgba(46,37,36,.06)`
- shadow-3: `0 10px 30px rgba(46,37,36,.10)`
- brand shadow: `0 8px 20px rgba(181,107,107,.22)`

Shadow philosophy:
- subtle
- warm tinted
- never heavy
- cards normally use shadow-1
- hover cards may use shadow-2
- modal/sidebar overlays may use shadow-3
- primary CTA uses brand shadow

---

# 7) Global Layout

- RTL layout
- max content container: 1240px
- desktop sidebar width: 228px
- topbar height: 68px
- public site header height: 76px
- page content padding desktop: 24px
- panel content becomes 16px on smaller screens

---

# 8) Buttons

Base button:
- display inline-flex
- centered vertically/horizontally
- gap: 8px
- padding: 10px 18px
- radius: 10px
- font-size: 13px
- font-weight: 600
- white-space: nowrap
- transition: .18s ease

### Primary
- background: `#AF5D5D`
- text: white
- border: same as background
- shadow: brand shadow
- hover: `#A35C5C`

### Soft
- background: `#FBF1EE`
- text: `#8E4C4C`
- transparent border
- hover background: `#F4E3E0`

### Ghost
- transparent background
- transparent border
- text: `#6E5F5B`
- hover background: `#F6EFEC`

### Outline
- transparent background
- border: `#D9A7A7`
- text: `#8E4C4C`
- hover background: `#FBF1EE`

### Danger
- background: `#F9E5E6`
- text: `#C25B62`
- transparent border
- hover: slightly darker danger background

### Sizes
- default: 10px 18px
- large: 14px 26px, radius 14px, font 14px
- small: 6px 12px, radius 6px, font 11.5px
- icon button: 36x36px, radius 10px
- block: width 100%

---

# 9) Button States

Every button must support:
- default
- hover
- active
- disabled
- loading
- focus-visible

Focus:
- outline: 2px solid brand
- outline-offset: 2px

Loading:
- preserve button dimensions
- replace icon/text area with compact spinner
- do not cause layout shift

Disabled:
- reduce contrast
- preserve shape
- cursor not-allowed

---

# 10) Badge / Status

Base:
- inline-flex
- gap 6px
- padding 4px 11px
- pill radius
- font 11.5px
- weight 600
- default neutral background `#F0EBE9`

By state:
- success: `#E6F3EC` / `#3F8F68`
- warning: `#FBF0DA` / `#B88424`
- danger: `#F9E5E6` / `#C25B62`
- dark danger: `#F2DEDF` / `#8B3941`
- info: `#E6EEF5` / `#4F7FA8`
- brand: `#FBF1EE` / `#8E4C4C`

Default badge contains a 6px circular dot.
Optional `.no-dot` removes the dot.

Examples of semantic labels:
- در حال انجام
- تکمیل شده
- در انتظار
- لغو شده
- فعال
- غیرفعال
- پرداخت شده
- پرداخت نشده
- جدید
- ویژه

---

# 11) Tags

Small rectangular/pill-ish tags:
- padding: 3px 10px
- radius: 6px
- font: 11.5px
- weight: 600

Use semantic colors for:
Instagram, WhatsApp, Website, Phone, Referral.

---

# 12) Cards

Base:
- background: white
- border: `1px solid #EDE2DE`
- radius: 18px
- shadow: shadow-1

Card padding:
- standard: 20px
- header: 16px 20px
- body/foot can use same spacing

Card hover:
- only for interactive cards
- subtle upward movement: ~3px
- shadow-2
- border may shift toward brand-300

---

# 13) Inputs / Forms

Field:
- vertical layout
- gap: 7px

Label:
- 13px
- weight 600
- color `#6E5F5B`

Required marker:
- `#C25B62`

Input/select/textarea:
- width 100%
- padding: 11px 16px
- background white
- border `#E3D5D0`
- radius 10px
- font 13px

Placeholder:
- `#817169`

Focus:
- border `#D9A7A7`
- box-shadow: `0 0 0 3px #FBF1EE`
- no default browser outline

Textarea:
- min-height 96px
- line-height 1.8

Select:
- custom chevron
- chevron aligned left because RTL

Search:
- icon 17px
- input background `#F6EFEC`
- transparent border
- focus returns to white
- left-side icon position

Checkbox:
- 17x17
- accent color brand

---

# 14) Selection Cards

For radio/tile selection:
- padding: 16px
- border: 1.5px solid `#EDE2DE`
- radius: 14px
- white background

Hover:
- border `#D9A7A7`
- background `#FBF1EE`

Active:
- border `#B56B6B`
- background `#FBF1EE`
- subtle 0 0 0 3px brand-50

Icon box:
- 38x38
- radius 10px
- brand-50 background
- brand icon

Active icon:
- brand background
- white icon

---

# 15) Appointment / Time Slot

Time slot:
- padding 9px 4px
- border 1px solid `#E3D5D0`
- radius 10px
- centered
- font 13px / weight 600

Hover:
- brand-300 border
- brand-700 text

Active:
- brand background
- white text
- brand border

Unavailable:
- surface-sunken background
- muted text
- no border
- line-through
- cursor not-allowed

---

# 16) Day Picker

Grid:
- minimum card width around 88px
- gap 8px

Day:
- padding 10px 6px
- border `#E3D5D0`
- radius 10px
- white background
- centered

Active:
- brand background
- white main text
- secondary text uses translucent white

Available indicator:
- success green

---

# 17) Tabs

### Segmented Tabs
Container:
- background `#F6EFEC`
- padding 4px
- radius 14px
- gap 4px

Tab:
- padding 8px 16px
- radius 10px
- 13px
- weight 600
- text `#6E5F5B`

Active:
- white background
- brand-700 text
- subtle shadow

### Underline Tabs
- bottom border `#EDE2DE`
- gap 24px
- tab padding 12px 0
- active color brand
- active bottom border: 2px solid brand

---

# 18) Table

Table:
- font 13px

Header:
- background `#F6EFEC`
- text `#817169`
- font 11.5px
- weight 600
- padding 11px 16px

Body:
- padding 13px 16px
- bottom border `#EDE2DE`

Hover:
- row background `#FDFAF9`

Table action icon:
- 34x30px
- brand-50 background
- brand-700 icon
- hover brand-100

---

# 19) Avatar

Default:
- 36x36
- circular
- brand-50
- brand-700
- bold

Sizes:
- sm: 28x28
- default: 36x36
- lg: 64x64
- xl: 92x92

Images:
- object-fit cover

---

# 20) Alerts

Base:
- display flex
- gap 12px
- padding 16px
- radius 14px
- font 13px

Warning:
- bg `#FBF0DA`
- text `#7D5A13`
- border rgba(184,132,36,.18)

Danger:
- bg `#F9E5E6`
- text `#8B3941`

Info:
- bg `#E6EEF5`
- text `#2F5A7D`

Success:
- bg `#E6F3EC`
- text `#276147`

Icon:
- 19x19px

---

# 21) Modal

Overlay:
- rgba(46,37,36,.45)
- backdrop blur 2px
- full viewport
- centered

Modal:
- white
- max width 560px
- radius 24px
- shadow-3
- max-height 92vh
- internal scroll when needed

---

# 22) Empty State

- centered
- generous vertical padding
- muted text
- icon around 42px
- icon opacity ~45%
- primary action can be brand button

---

# 23) Upload Box

- dashed border 1.5px
- border `#E3D5D0`
- radius 14px
- background `#FDFAF9`
- centered
- generous padding

Hover:
- border brand-300
- background brand-50
- text brand-700

---

# 24) Progress Bar

Normal:
- height 8px
- pill radius
- background `#F6EFEC`

Progress:
- brand background
- pill radius

Small:
- height 5px

---

# 25) Stepper

Step number:
- 28x28
- circular

Default:
- surface-sunken + muted

Done:
- success background + success text

Active:
- brand background + white

Active step label:
- ink + bold

Connector:
- 26x2
- line-2

---

# 26) Sidebar

Desktop:
- width 228px
- white background
- left/right border depending on RTL
- sticky
- full viewport height

Brand area:
- padding 24px 20px 20px
- logo icon box 38x38
- icon box radius 14px
- brand-50 background
- brand icon

Navigation:
- padding 8px 12px 20px
- nav item:
  - padding 10px 12px
  - radius 10px
  - font 13px
  - weight 600
  - gap 12px

Normal:
- text `#6E5F5B`

Hover:
- bg `#F6EFEC`
- text ink

Active:
- bg `#FBF1EE`
- text `#8E4C4C`
- icon brand

Navigation icon:
- 19x19px

Count badge:
- danger red
- white text
- minimum 19x19
- pill

---

# 27) Dark Sidebar Variant

Sidebar:
- `#241C1B`

Brand:
- icon background rgba(255,255,255,.08)
- icon `#D9A7A7`
- name white
- subtitle rgba white 45%

Nav:
- normal rgba white 66%
- hover rgba white 6% + white text
- active rgba white 10% + white text
- active icon brand-300

Use this dark variant only where the demo uses the dark navigation theme.

---

# 28) Topbar

Height:
- 68px

Background:
- white

Border:
- bottom `#EDE2DE`

Sticky:
- top 0

Horizontal padding:
- 24px desktop

Search:
- max width 560px
- pill radius
- vertical padding around 10px

Icon button:
- 38x38
- radius 10px
- muted icon
- hover surface-sunken

Notification dot:
- danger
- small pill
- white border around dot

User chip:
- pill radius
- avatar + name + role
- hover surface-sunken

Date chip:
- surface-sunken
- radius 10px
- padding 8px 12px

---

# 29) Public Header

Height:
- 76px
- sticky
- white with slight transparency
- `rgba(255,255,255,.92)`
- backdrop blur 10px
- bottom border

Logo:
- icon 30px
- brand color
- name 19px / 800

Menu:
- horizontal
- gap 24px
- 13px / 600
- muted text
- active/hover brand

Mobile:
- hamburger replaces desktop navigation

---

# 30) Hero

Background:
`linear-gradient(105deg, #FBF1EE 0%, #F3EBE6 55%, #EEE3DC 100%)`

Desktop:
- 2-column layout
- gap 40px
- vertical padding 72px

H1:
- 42px
- line-height 1.45

Highlighted text:
- brand color
- block display

Hero paragraph:
- 16px
- muted
- line-height 2

Hero actions:
- gap 12px
- margin-top 24px

Hero media:
- aspect ratio 16/11
- radius 24px
- overflow hidden
- background brand-100

---

# 31) Trust Bar

- white background
- bottom border
- 4-column desktop grid
- padding vertical 24px
- each item centered
- vertical divider between items
- icon 26px
- icon brand
- title 13px bold
- subtitle 11.5px muted

---

# 32) Service Cards

- white
- border line
- radius 18px
- overflow hidden
- hover translateY(-3px)
- hover shadow-2
- hover border brand-300

Image:
- 4:3

Body:
- 16px padding
- centered
- compact vertical spacing

Floating icon:
- 34x34
- circular
- brand-50
- brand icon
- white 3px border
- overlaps image/body boundary

Price:
- brand-700
- 13px
- bold

---

# 33) Doctor Cards

- white
- border
- radius 18px
- image square
- body padding 16px
- name 13px bold
- subtitle 11.5px muted

Arrow button:
- 32x32
- circular
- brand-50
- brand icon
- hover becomes brand + white

---

# 34) Before / After

Two-image grid:
- gap 3px
- radius 14px
- overflow hidden

Caption:
- dark translucent `rgba(46,37,36,.72)`
- white
- 11.5px
- small radius

---

# 35) Calendar / Scheduler

Calendar day:
- min-height 62px
- border line
- radius 10px
- centered

Active:
- brand background
- white text

Unavailable:
- surface-sunken
- muted

Appointment blocks:
- radius 10px
- padding 8px 12px
- small font
- colored start border 3px

States:
- busy = brand
- ok = green
- warn = amber
- dang = red
- free = muted/neutral

Scheduler cells:
- minimum height ~46px
- radius 10px
- 7–9px internal padding

Free cell:
- dashed border
- transparent
- hover brand-50

Blocked:
- red striped background
- dashed danger border

Off:
- neutral striped background
- muted text

---

# 36) Pagination

Each page button:
- 34x34
- radius 10px
- border line
- white background
- 13px / 600

Active:
- brand background
- white
- brand border

Gap:
- 4px

---

# 37) Filter Chips

- pill
- padding 7px 15px
- 13px / 600
- white
- line border
- muted text

Hover:
- brand-300 border
- brand-700 text

Active:
- brand background
- white

---

# 38) KPI Cards

KPI variants:
- default
- amber
- green
- blue
- red

Icon area uses corresponding status background and color.

Keep KPI cards visually calm; do not use saturated solid backgrounds for the whole card.

---

# 39) Quick Action Tile

- brand-50 background
- transparent border
- radius 18px
- padding 20px
- centered
- brand-700 text
- bold

Hover:
- brand-100 background
- brand-300 border
- translateY(-1px)

---

# 40) Timeline

- vertical timeline
- icon node 32x32
- circular
- brand-50
- brand icon
- connector 2px line
- item gap 12px

---

# 41) Notification / Toast

Use same visual language as alerts:
- rounded 14px
- compact padding
- semantic status background
- semantic icon
- close action on the opposite side
- subtle shadow if floating

---

# 42) Icons

The actual demo does NOT rely on a heavy icon font.

Icons are inline SVG.

Default icon characteristics:
- outline icon
- `fill="none"`
- `stroke="currentColor"`
- `stroke-width="1.7"`
- `stroke-linecap="round"`
- `stroke-linejoin="round"`

Common sizes:
- 14px: compact action icons
- 15–16px: card/action icons
- 17px: form/search/date icons
- 19px: sidebar/topbar
- 20px: quick actions
- 22–30px: branding/hero/trust

Use an icon library with the same visual characteristics if replacing inline SVG. Prefer a rounded outline icon family. Do NOT use filled/3D/multicolor icons.

Common icon categories in the demo:
- home
- dashboard
- calendar
- appointment
- users
- doctor
- services
- reports
- settings
- search
- notification
- phone
- email
- location
- Instagram
- Telegram
- menu
- close
- edit
- delete
- view
- arrow
- clock
- payment
- shield
- sparkles
- skin/beauty treatment
- upload
- download
- chevron
- filter

---

# 43) Responsive Rules

Desktop:
- full sidebar
- multi-column cards/grids
- full public navigation

At <= 1000px:
- sidebar becomes fixed off-canvas
- hamburger/nav toggle appears
- content padding becomes 16px
- topbar horizontal padding becomes 16px
- date chip and user metadata may hide

At mobile:
- grids collapse
- calendar gaps shrink
- calendar secondary availability labels can hide
- tables become horizontally scrollable
- public navigation collapses to hamburger
- preserve large touch targets
- avoid dense text

---

# 44) UX / Visual Principles

1. Keep the interface calm and premium.
2. Use warm whites rather than cold gray backgrounds.
3. Brand color is muted rose, not bright red/pink.
4. Use color mainly for actions and semantic states.
5. Avoid excessive shadows.
6. Avoid excessive gradients; gradient is primarily used in the hero.
7. Cards should have thin warm borders.
8. Rounded corners are a major visual characteristic.
9. Icons should remain outline-based and lightweight.
10. Persian text must be rendered RTL correctly.
11. Keep hierarchy through spacing, weight, and muted text rather than large color blocks.
12. Do not introduce random colors outside the semantic token system.
13. Use the same component language across public site and dashboards.
14. Interactive components need clear hover/focus/active/disabled states.
15. Preserve the exact token system when creating new pages.

---

# 45) Implementation Instruction for AI

When generating new UI for this project:

- Treat this document as the source of truth for visual design.
- Do not invent a new color palette.
- Do not replace the dusty-rose brand with blue/purple/green.
- Do not use Tailwind default colors as visual choices.
- Use CSS variables/tokens for all colors, spacing, radii and shadows.
- Use Vazirmatn for Persian.
- Use RTL.
- Use outline icons with approximately 1.7px stroke.
- Keep cards white with warm borders.
- Keep background warm off-white.
- Keep controls rounded.
- Use semantic status colors only for status meaning.
- Match the component states described above.
- New components should visually look like they belong to the same design system.

---

# 46) Exact Core Token Block

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

---

# 47) Final instruction

The goal is NOT to redesign the product.

The goal is to reproduce the visual language of the provided Clinic demo consistently across the new application.

If a new screen is required, reuse:
- the same palette
- the same typography
- the same radius
- the same spacing scale
- the same shadows
- the same button states
- the same badge/status system
- the same form controls
- the same card/table/navigation patterns
- the same outline icon language

Only introduce a new component when the product requirement genuinely needs it, and make it visually consistent with this system.
