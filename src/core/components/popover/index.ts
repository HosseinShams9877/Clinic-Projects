/**
 * `src/core/components/popover` — the popover wrapper, and its public surface.
 *
 * `05-conventions.md` §17 bans a direct `@radix-ui/react-popover` import anywhere
 * outside this directory, and this barrel is the door: a control composes a popover
 * through these names and never through the primitive's own. The directory is one of
 * the six the eslint config names as a headless wrapper, which is the exemption that
 * lets `Popover.tsx` import the library and forbids it everywhere else.
 *
 * ## What is exported
 *
 * The panel, which carries the token styling, and the primitives that do not render
 * appearance — `Root`, `Trigger`, `Portal`, `Anchor`, `Arrow` and `Close` are passed
 * through as-is, because a wrapper that re-typed them would be a wrapper a caller
 * had to read two documents to use.
 *
 * ## What is deliberately not
 *
 * A styled trigger. A popover's trigger is the control that opens it — a date
 * picker's button and a combobox's button are two different controls with two
 * different accessible names, and both already compose `CONTROL_CLASSES`. A trigger
 * here would be a second thing a control composes instead of its own button, and the
 * two would disagree about which one owns the `aria-*` wiring the form shell sets.
 *
 * Persian text. The panel is a frame; the words inside it are the control's own,
 * and they come from the localization layer or the page that loaded the options.
 */

export {
  PopoverAnchor,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from './Popover'
