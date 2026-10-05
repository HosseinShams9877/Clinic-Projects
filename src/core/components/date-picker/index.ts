/**
 * `src/core/components/date-picker` — the Jalali date picker, and its public surface.
 *
 * `01-tech-stack.md` §8.5 names this folder and `combobox` as the two controls the
 * form shell describes but Phase 1 did not ship, and the shell's own `field-context.ts`
 * closes by naming them as the next two callers of `useControlWiring`. This barrel is
 * the door the rest of the repository uses; a component is reachable through it and
 * nothing else, which is the same rule a module's barrel keeps (`02-architecture.md`
 * §10 rule 1).
 *
 * ## What is exported
 *
 * The one control and its props. The labels are not — a control's own Persian strings
 * are an implementation detail of the control, and no caller should be reading them
 * into a page.
 *
 * ## What is deliberately not
 *
 * A time picker. The appointment surfaces need a *slot*, not a time, and a slot is
 * already a button; a form that asks for a time of day is a form the demo does not
 * have, and a control built for it would be a control with no caller.
 */

export { JalaliDatePicker } from './JalaliDatePicker'
export type { JalaliDatePickerProps } from './JalaliDatePicker'
