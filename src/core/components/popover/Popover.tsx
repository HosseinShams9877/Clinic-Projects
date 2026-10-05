/**
 * The popover wrapper — `05-conventions.md` §17's one door to Radix's popover.
 *
 * > No component imports `@radix-ui/*` or cmdk directly. They are wrapped in
 * > `src/core/components/**` and reachable only through that wrapper, so the token
 * > styling and the Persian-aware filter cannot be bypassed.
 *
 * This directory is one of the six the eslint config names as a headless wrapper
 * (`HEADLESS_WRAPPER_DIRECTORIES`), which is the exemption that lets *this* file
 * import the primitive and forbids it everywhere else. What the wrapper owns is the
 * appearance: the panel's surface, border, radius and shadow are the design system's
 * tokens (`08-ui-design-system.md`), and a caller that styled its own panel would be
 * a caller whose panel drifted from every other panel the first time the tokens
 * moved. The width is **not** owned here — the two callers have two different ones
 * (`var(--radix-popover-trigger-width)` for a dropdown that covers its trigger, a
 * fixed width for a calendar) — and Radix's `--radix-popover-trigger-width` is set
 * on the content itself, so a caller's own `className` reads it through this wrapper
 * unchanged.
 *
 * What the wrapper does **not** own is the Persian labels or the RTL behaviour, and
 * for the same reason: both are the caller's. A popover is a frame, and the words
 * inside it are the control that opened it (`JalaliDatePicker`'s month names come
 * from the localization layer and `Combobox`'s options from the page that loaded
 * them). Radix already honours `dir` for placement, so an RTL page gets an RTL panel
 * without this file having a direction of its own.
 *
 * The focus trap, the escape handling, the outside-click dismissal and the
 * `aria-*` wiring are Radix's and are not re-implemented — a second focus trap is
 * the bug no reviewer catches, and the wrapper's job is to keep the one true
 * styling, not the one true keyboard model.
 */

import * as Popover from '@radix-ui/react-popover'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'
import { forwardRef } from 'react'

import { cx } from '@/core/lib'

/**
 * The panel's own appearance, as the design system's tokens state it.
 *
 * `shadow-3` is the elevation a floating panel carries (`08-ui-design-system.md`'s
 * elevation scale), and `z-50` is what keeps it above a table's sticky header. A
 * caller's `className` is appended, so a panel that needs a width or a different
 * padding adds it without restating the six tokens it is not changing.
 */
const POPOVER_CONTENT_CLASSES =
  'z-50 rounded-lg border border-line bg-surface shadow-3'

/**
 * The panel, with the token styling the wrapper owns.
 *
 * Forwards the ref, because a caller that measures the panel or moves focus into it
 * needs the element and not the wrapper.
 */
export const PopoverContent = forwardRef<
  ElementRef<typeof Popover.Content>,
  ComponentPropsWithoutRef<typeof Popover.Content>
>(function PopoverContent({ className, ...props }, ref) {
  return (
    <Popover.Content ref={ref} className={cx(POPOVER_CONTENT_CLASSES, className)} {...props} />
  )
})

export const PopoverRoot = Popover.Root
export const PopoverTrigger = Popover.Trigger
export const PopoverPortal = Popover.Portal
export const PopoverAnchor = Popover.Anchor
export const PopoverArrow = Popover.Arrow
export const PopoverClose = Popover.Close
