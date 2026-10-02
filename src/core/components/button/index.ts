/**
 * `src/core/components/button` — the button, and its public surface.
 *
 * The barrel exports the component and its types. The CSS Module is not exported
 * and neither are the variant maps: a caller selects a variant by naming it, and
 * nothing outside this directory needs to know how a variant is styled.
 *
 * `ButtonProps` is re-exported as the union rather than as one flattened
 * interface, so a caller writing a wrapper around `Button` inherits the
 * icon-button obligation instead of being able to erase it. A wrapper that takes
 * `ButtonProps` and forwards it cannot accidentally produce an unnamed icon
 * button, because the type it would have to accept cannot describe one.
 */

export { Button, BUTTON_SIZES, BUTTON_VARIANTS } from './Button'
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  IconButtonProps,
  LabelledButtonProps,
} from './Button'
