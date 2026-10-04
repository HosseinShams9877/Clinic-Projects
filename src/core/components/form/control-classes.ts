/**
 * The §13 control, as Tailwind utilities, shared by `TextInput` and `TextArea`.
 *
 * `01-tech-stack.md` §8.5 asks the shell to define "field layout, the Persian
 * label, the error slot, and RTL … once". On CSS Modules that "once" was one
 * `.control` rule in one file; on Tailwind it is this string, which is the reason
 * the string lives in a module of its own rather than being repeated in the two
 * controls — a second copy would be a second thing to keep in step, and the two
 * would drift the day a third control arrives.
 *
 * `08-ui-design-system.md` §13: "Input / select / textarea | width 100%,
 * `padding: 11px 16px`, white bg, border `#E3D5D0`, radius 10px, font 13px", with
 * placeholder `#817169` and a focus treatment of border `#D9A7A7` plus
 * `box-shadow: 0 0 0 3px #FBF1EE`. Every one of those is a token below:
 * `--line-2` is `#E3D5D0`, `--r-sm` is 10px, `--fs-sm` is 13px, `--ink-3` is
 * `#817169`, `--brand-300` is `#D9A7A7`, `--brand-50` is `#FBF1EE`.
 *
 * ## The geometry literals
 *
 * `11px` vertical padding is §13's own value and is not a step of the `--s-*`
 * scale, so it is written as an arbitrary value. The horizontal padding *is* on the
 * scale — 16px is `--s-4` — and `--spacing` is `--s-1`, so `px-4` resolves to
 * exactly it. That is the split the demo's own stylesheet makes (`.input {
 * padding: 11px var(--s-4) }`), and `Button` argues it in full.
 *
 * ## The focus treatment, and why there are two rules for it
 *
 * §13 fixes focus as "border `#D9A7A7`, `box-shadow: 0 0 0 3px #FBF1EE`, no default
 * browser outline", and all three are honoured below. What the section does not
 * account for is that `outline: none` on `:focus` also cancels the product's
 * **own** global rule — `globals.css` carries
 * `:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px }` —
 * since a class plus a pseudo-class outranks a bare pseudo-class.
 *
 * The §13 ring cannot replace it. `--brand-50` on `--surface` is about 1.1:1 and
 * the border step from `--line-2` to `--brand-300` is about 1.5:1, so a keyboard
 * user tabbing through a form would have no focus indicator meeting WCAG 2.1
 * SC 1.4.11's 3:1 for non-text contrast — on the one control type where a lost
 * focus ring matters most, because the user is about to type into it. The brand
 * outline is 3.98:1 on white.
 *
 * So `focus-visible:` restores it, and only for the input modality that needs it:
 * a pointer focus still gets §13's treatment exactly as written, and a keyboard
 * focus gets §13's treatment **and** the outline. This is an addition to §13, not
 * a contradiction of it — "no default browser outline" is about the UA's ring, and
 * the brand ring is the product's.
 *
 * ## The error state
 *
 * §13 gives no error state, and a form with one bad field among twenty needs to
 * show which one without being read line by line. The border takes the status
 * colour, which is what §A13 reserves it for; the message below the control is the
 * primary signal, so nothing here depends on colour alone.
 *
 * §13 gives no disabled state either. The demo's recessed surface is the token
 * whose name says "sunken", which is what an unusable field is.
 */

/** §13's control, in every state §13 names plus the two it does not. */
export const CONTROL_CLASSES =
  'inline-size-full py-[11px] px-4 bg-surface border border-line-2 rounded-sm text-sm text-ink ' +
  'placeholder:text-ink-3 ' +
  '[transition:var(--transition-control)] ' +
  'focus:outline-none focus:border-brand-300 focus:shadow-[0_0_0_3px_var(--brand-50)] ' +
  'focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ' +
  'aria-invalid:border-danger ' +
  'disabled:bg-surface-sunken disabled:cursor-not-allowed'

/**
 * §13: "Textarea | `min-height: 96px`, line-height 1.8". `resize: vertical` is the
 * demo's own rule: a corner drag wider than the column breaks the form's layout,
 * and shorter than three lines makes the value unreadable.
 *
 * `min-h-24` is 96px because `--spacing` is `--s-1` — `24 × 4px` — so the one
 * §13 textarea value that lands on the scale reads as a utility while the 1.8
 * line-height, which is not on any scale, is an arbitrary value.
 */
export const TEXTAREA_CLASSES = 'min-h-24 leading-[1.8] resize-y'
