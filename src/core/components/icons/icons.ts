/**
 * The icon registry — `01-tech-stack.md` §8.2, `08-ui-design-system.md` §42.
 *
 * §8.2 states the obligation and the reason in one paragraph:
 *
 * > **A Lucide icon imported directly into a component is a finding** — it would
 * > carry the default stroke and break the icon language in a way that is visible
 * > but easy to miss in review.
 *
 * Lucide's default stroke width is `2`. The design system requires **1.7** (§42 and
 * rule A7), so every icon is rendered through `Icon.tsx`, which asserts it. The
 * import-boundary rule in `eslint.config.mjs` bans `lucide-react` everywhere except
 * this directory, which makes "a finding" a build failure rather than a review note.
 *
 * ## Why this file maps concepts rather than names
 *
 * The keys are **product concepts** — `appointment`, `payment`, `doctor` — not
 * Lucide's names. `ICONS.appointment` resolves to `CalendarCheck` today; a module
 * asks for the appointments icon and never learns which glyph that is. Two things
 * follow, and both are the point:
 *
 * - **Changing the glyph is one edit, in one file.** Deciding that `CalendarCheck`
 *   reads better than `CalendarDays` for a booked appointment is a visual decision
 *   with a single place to make it.
 * - **§42's direction-aware mirroring becomes data.** `mirrorsInRtl` is a property
 *   of the concept — "this icon points in the reading direction" — not of the call
 *   site, so a caller cannot forget it.
 *
 * ## Mirroring, and why the flag exists at all
 *
 * §42: "icons that encode direction (arrow, chevron, back, next) follow the RTL
 * layout; icons that encode real-world objects (phone, camera, clock face) are never
 * mirrored."
 *
 * Lucide's glyphs are authored for a left-to-right layout, so the direction ones are
 * the **wrong way round** in this product and the wrapper flips them. Encoding that
 * as `true` on the entry rather than as a transform at the call site is what keeps
 * §42's second half — that a clock face must *not* flip — from being a rule everyone
 * has to remember. `chevronDown` is the case that shows the flag is not simply
 * "is it a chevron": it is vertical, so it is `false`.
 *
 * ## What is deliberately not here
 *
 * **Brand marks.** §42 lists Instagram and Telegram among the categories in use, and
 * `08-ui-design-system.md` §2.6 gives the five acquisition sources fixed colours.
 * **Lucide 1.49.0 ships no brand icons** — `Instagram`, `WhatsApp` and `Telegram`
 * are absent from the package's type declarations, which is where Lucide moved them
 * out. They are therefore inline SVG, which §42 and `05-conventions.md` §17 both
 * permit ("Icons are Lucide components or inline SVG"), and they belong to the
 * module that first renders one — `audience-groups` or `public-site` — so that the
 * mark's path data is written against the source that needs it rather than guessed
 * at here. Recorded in the Phase 1 report.
 */

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Banknote,
  Bell,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Clock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Funnel,
  House,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Repeat,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
  Trash,
  TriangleAlert,
  Upload,
  UserCog,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'

/**
 * `08-ui-design-system.md` §42, and rule A7: "Every icon is outline,
 * `stroke-width: 1.7`, rounded caps and joins."
 *
 * Exported so the number appears once and so the test can assert the rendered
 * attribute against the token rather than against a second literal.
 */
export const ICON_STROKE_WIDTH = 1.7

/**
 * The icon sizes of §42's table, as named roles.
 *
 * | §42 | Role |
 * |---|---|
 * | 14px — compact action icons | `compact` |
 * | 15–16px — card / action icons | `card` |
 * | 17px — form, search, date icons | `control` |
 * | 19px — sidebar, topbar | `nav` |
 * | 20px — quick actions | `action` |
 *
 * **The 22–30px branding row is deliberately absent.** §42 gives it as a *range*
 * with no single value, and the document's own preamble forbids re-deriving a
 * dimension: "No colour, radius, shadow, spacing, font size, or dimension in this
 * document may be invented, approximated, or replaced by a framework default."
 * Picking 26 for it here would be inventing a value to fill a gap, so the role is
 * added by the surface that needs it — `public-site`, whose §29 logo is 30px and is
 * the one member of the range the document states exactly.
 */
export const ICON_SIZES = {
  compact: 14,
  card: 16,
  control: 17,
  nav: 19,
  action: 20,
} as const

/** One of the named sizes above. A bare `13` does not type-check. */
export type IconSize = keyof typeof ICON_SIZES

/**
 * The pixels a size name stands for, for the one place that needs the number: the
 * Lucide glyph's own `size` prop, which takes pixels and not the role.
 *
 * `Icon` reads a name and hands this value down, so a caller writes `size="nav"` and
 * never `19` — the name is the thing §42 states and the pixel is the thing it is
 * stated *for*, and looking it up here is what keeps a caller from picking a value
 * the scale does not hold.
 */
export function iconPixels(size: IconSize): (typeof ICON_SIZES)[IconSize] {
  return ICON_SIZES[size]
}

/** A registered icon: the glyph to render, and whether RTL must flip it. */
export interface IconDefinition {
  /** The Lucide component. Never rendered except through `Icon.tsx`. */
  readonly glyph: LucideIcon
  /** `true` for an icon that points in the reading direction. See the header. */
  readonly mirrorsInRtl: boolean
}

/**
 * The registry.
 *
 * `satisfies` rather than a type annotation, so the keys stay literal and
 * `IconName` is a union of exactly the registered concepts — an `Icon` with a
 * misspelled name is a compile error and an exhaustive switch over the names is
 * possible. The `IconDefinition` bound is what keeps every entry honest.
 */
export const ICONS = {
  /* Chrome and navigation — §26 sidebar, §28 topbar, §29 public header. */
  home: { glyph: House, mirrorsInRtl: false },
  dashboard: { glyph: LayoutDashboard, mirrorsInRtl: false },
  menu: { glyph: Menu, mirrorsInRtl: false },
  close: { glyph: X, mirrorsInRtl: false },
  settings: { glyph: Settings, mirrorsInRtl: false },
  logout: {
    // §42 does not name the sign-out icon in either list. It is read as a
    // real-world object — a door — rather than as a bare arrow, and so joins the
    // side of the rule that never mirrors. A sign-out that felt wrong in RTL is
    // a one-line change here, which is the reason the flag is data.
    glyph: LogOut,
    mirrorsInRtl: false,
  },

  /* Direction — §42's mirrored set, and its explicit exceptions. */
  back: { glyph: ArrowLeft, mirrorsInRtl: true },
  forward: { glyph: ArrowRight, mirrorsInRtl: true },
  chevronStart: { glyph: ChevronLeft, mirrorsInRtl: true },
  chevronEnd: { glyph: ChevronRight, mirrorsInRtl: true },
  /** Vertical, so it never mirrors — §42's "real-world objects" half of the rule. */
  chevronDown: { glyph: ChevronDown, mirrorsInRtl: false },
  /** The select trigger's indicator, §13: a custom chevron. */
  selectIndicator: { glyph: ChevronsUpDown, mirrorsInRtl: false },
  /** Out of the product, into another host. Not a reading-direction arrow. */
  externalLink: { glyph: ArrowUpRight, mirrorsInRtl: false },

  /* The diary — §15 time slot, §16 day picker, §35 calendar. */
  calendar: { glyph: CalendarDays, mirrorsInRtl: false },
  appointment: { glyph: CalendarCheck, mirrorsInRtl: false },
  appointmentUnavailable: { glyph: CalendarOff, mirrorsInRtl: false },
  clock: { glyph: Clock, mirrorsInRtl: false },

  /* People. */
  customers: { glyph: Users, mirrorsInRtl: false },
  customer: { glyph: UserRound, mirrorsInRtl: false },
  doctor: { glyph: Stethoscope, mirrorsInRtl: false },
  staff: { glyph: UserCog, mirrorsInRtl: false },

  /* Clinical and commercial. */
  treatment: { glyph: Sparkles, mirrorsInRtl: false },
  services: { glyph: Tag, mirrorsInRtl: false },
  reports: { glyph: ChartColumn, mirrorsInRtl: false },

  /* Money — §18 table, the debt and payment surfaces. */
  payment: { glyph: CreditCard, mirrorsInRtl: false },
  debt: { glyph: Wallet, mirrorsInRtl: false },
  invoice: { glyph: Receipt, mirrorsInRtl: false },
  money: { glyph: CircleDollarSign, mirrorsInRtl: false },
  cash: { glyph: Banknote, mirrorsInRtl: false },

  /* Access — §10 badge, the permission matrix. */
  access: { glyph: LockKeyhole, mirrorsInRtl: false },
  shield: { glyph: Shield, mirrorsInRtl: false },
  shieldCheck: { glyph: ShieldCheck, mirrorsInRtl: false },
  blocked: { glyph: Ban, mirrorsInRtl: false },

  /* Contact and reach. */
  phone: { glyph: Phone, mirrorsInRtl: false },
  email: { glyph: Mail, mirrorsInRtl: false },
  location: { glyph: MapPin, mirrorsInRtl: false },
  message: { glyph: MessageSquare, mirrorsInRtl: false },
  notification: { glyph: Bell, mirrorsInRtl: false },

  /* Actions — §8 buttons, §18 table row actions. */
  add: { glyph: Plus, mirrorsInRtl: false },
  edit: { glyph: Pencil, mirrorsInRtl: false },
  remove: { glyph: Trash, mirrorsInRtl: false },
  confirm: { glyph: Check, mirrorsInRtl: false },
  view: { glyph: Eye, mirrorsInRtl: false },
  hide: { glyph: EyeOff, mirrorsInRtl: false },
  search: { glyph: Search, mirrorsInRtl: false },
  filter: { glyph: Funnel, mirrorsInRtl: false },
  upload: { glyph: Upload, mirrorsInRtl: false },
  download: { glyph: Download, mirrorsInRtl: false },
  retry: { glyph: Repeat, mirrorsInRtl: false },
  /** The §9 loading state's spinner. Rotated by the wrapper, never by a caller. */
  spinner: { glyph: LoaderCircle, mirrorsInRtl: false },

  /* Feedback — §20 alerts, §41 toasts. */
  alert: { glyph: TriangleAlert, mirrorsInRtl: false },
  error: { glyph: CircleX, mirrorsInRtl: false },
  success: { glyph: CircleCheck, mirrorsInRtl: false },
  warning: { glyph: CircleAlert, mirrorsInRtl: false },
  info: { glyph: Info, mirrorsInRtl: false },
} satisfies Record<string, IconDefinition>

/** Every registered concept. A name outside this union does not compile. */
export type IconName = keyof typeof ICONS
