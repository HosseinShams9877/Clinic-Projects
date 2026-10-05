/**
 * `src/core/components/combobox` — the searchable select, and its public surface.
 *
 * `01-tech-stack.md` §8.5 names this folder and `date-picker` as the two controls the
 * form shell describes but Phase 1 did not ship, and the shell's own `field-context.ts`
 * closes by naming them as the next two callers of `useControlWiring`. This barrel is
 * the door the rest of the repository uses; a component is reachable through it and
 * nothing else, which is the same rule a module's barrel keeps (`02-architecture.md`
 * §10 rule 1).
 *
 * ## What is exported
 *
 * The one control, its props and its option type. `ComboboxOption` is exported
 * because a page builds its options from its own rows and the shape is the contract
 * between them — a page that hand-rolled an option would be a page whose `hint` the
 * control does not render.
 *
 * ## What is deliberately not
 *
 * An async variant. The pages this control serves read their options on the server and
 * hand them over, which is the same boundary `booking-dialog`'s option loader keeps;
 * a control that fetched would be a control with a loading state the page cannot
 * render, and the demo has no surface that needs it.
 */

export { Combobox } from './Combobox'
export type { ComboboxOption, ComboboxProps } from './Combobox'
