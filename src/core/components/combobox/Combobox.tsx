/**
 * The searchable select — the fourth control of the form shell.
 *
 * `01-tech-stack.md` §8.5 names this control and the Jalali date picker as the two the
 * shell describes but Phase 1 did not ship, and `field-context.ts` closes by naming
 * them as the next two callers of `useControlWiring`. This file is the second, and it
 * joins the same contract: `Field` gives it the `id`, the `aria-*` wiring and the
 * label, and the control reads them through the hook rather than accepting them as
 * props.
 *
 * ## Why a searchable select at all
 *
 * The clinic's own lists are long enough that a plain `<select>` is a scroll: a
 * services catalogue, a staff list, a customer file of hundreds. The demo's own
 * markup solves this with a text input that filters a list (`admin/services.html`'s
 * «جستجوی خدمت»), and this component is that pattern as a control — the filter and
 * the list are one affordance, and the value it emits is an option's id.
 *
 * ## Why `cmdk`
 *
 * The list is keyboard-reachable, filtered and arrow-navigable, and `cmdk` is the
 * library the shell's own popover already pairs with: `@radix-ui/react-popover` holds
 * the panel, `cmdk` holds the list, and the two together give the focus trap, the
 * type-ahead and the `aria-activedescendant` wiring that a hand-rolled list gets wrong
 * silently. The control's own code is the filter and the render.
 *
 * ## Why the empty state is a prop and not a sentence
 *
 * A list that found nothing has a different meaning on each surface — no service by
 * that name, no person by that number, no doctor in that clinic — and a control that
 * shipped its own sentence would ship the wrong one. The caller names it, from the
 * caller's catalog, which is `05-conventions.md` §14's rule applied at the boundary.
 *
 * ## Accessibility, in detail
 *
 * The trigger is a `<button>` whose accessible name is the label text plus the chosen
 * option, so a screen reader announces «پزشک، مریم صالحی» and not "combobox". The
 * list is `role="listbox"` with `role="option"` children and `aria-selected` on the
 * chosen one, and the filter input is labelled by the trigger's text through
 * `aria-label`, because the input is the popover's own focus and its label is the
 * field's.
 */

'use client'

import { useMemo, useState } from 'react'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from '../popover'
import { Command } from 'cmdk'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { CONTROL_CLASSES } from '../form/control-classes'
import { useControlWiring } from '../form/field-context'

/** One option the list renders. */
export interface ComboboxOption {
  /** The value the form submits — an id, a slug, a stored code. */
  readonly value: string
  /** The Persian label the person reads. */
  readonly label: string
  /** A second line, when the option has one a person needs to disambiguate it. */
  readonly hint?: string
  /** Whether the option can be chosen at all; a disabled one is shown and not selectable. */
  readonly disabled?: boolean
}

/** The props a form hands the control; the wiring comes from the enclosing `Field`. */
export interface ComboboxProps {
  /** The current value, as the form holds it. */
  readonly value: string | null | undefined
  /** Called with an option's `value` when it is chosen. */
  readonly onChange: (value: string) => void
  /** The options, already loaded by the page; the control does not fetch. */
  readonly options: readonly ComboboxOption[]
  /** The placeholder of the filter input. */
  readonly placeholder: string
  /** The sentence for an empty result, from the caller's catalog. */
  readonly emptyMessage: string
  readonly disabled?: boolean
  readonly name?: string
}

/**
 * The searchable select, as a `Field`'s control.
 *
 * @throws when rendered outside a `<Field>` — via `useControlWiring`, which is the
 *   shell's own check and not this component's.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  emptyMessage,
  disabled,
  name,
}: ComboboxProps) {
  const wiring = useControlWiring('Combobox')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  const shown = useMemo(() => {
    if (filter.trim() === '') return options
    const needle = filter.trim()
    return options.filter(
      (option) => option.label.includes(needle) || (option.hint ?? '').includes(needle),
    )
  }, [options, filter])

  return (
    <>
      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={value ?? ''}
          aria-invalid={wiring['aria-invalid']}
          aria-required={wiring['aria-required']}
        />
      )}

      <PopoverRoot
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setFilter('')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            id={wiring.id}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-describedby={wiring['aria-describedby']}
            className={cx(CONTROL_CLASSES, 'inline-flex items-center justify-between gap-2 text-start')}
          >
            <span className="truncate">{selected === null ? placeholder : selected.label}</span>
            <Icon name="selectIndicator" size="control" />
          </button>
        </PopoverTrigger>

        <PopoverPortal>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-56 rounded-lg border border-line bg-surface p-2 shadow-3"
          >
            <Command
              label={placeholder}
              shouldFilter={false}
              className="flex flex-col gap-2"
              onKeyDown={(event) => {
                // Escape closes the popover; cmdk would otherwise clear the filter and
                // leave the panel open, which is a dead end a keyboard user hits.
                if (event.key === 'Escape') setOpen(false)
              }}
            >
              <div className="relative">
                <span className="absolute inset-y-0 flex items-center ps-3 text-ink-3">
                  <Icon name="search" size="compact" />
                </span>
                <Command.Input
                  value={filter}
                  onValueChange={setFilter}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  className={cx(CONTROL_CLASSES, 'ps-9')}
                />
              </div>

              <Command.List className="max-h-60 overflow-auto">
                {shown.length === 0 ? (
                  <Command.Empty className="px-2 py-6 text-center text-sm text-ink-3">
                    {emptyMessage}
                  </Command.Empty>
                ) : (
                  shown.map((option) => (
                    <Command.Item
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      onSelect={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                      className={cx(
                        'flex cursor-pointer items-center gap-2 rounded-xs px-2 py-2 text-sm text-ink',
                        'data-[selected=true]:bg-bg-alt',
                        option.disabled && 'cursor-not-allowed text-ink-3',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          'inline-flex size-4 shrink-0 items-center justify-center rounded-xxs border',
                          option.value === value
                            ? 'border-brand bg-brand text-surface'
                            : 'border-line-2',
                        )}
                      >
                        {option.value === value ? <Icon name="confirm" size="compact" /> : null}
                      </span>
                      <span className="flex flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.hint === undefined ? null : (
                          <span className="text-xs text-ink-3">{option.hint}</span>
                        )}
                      </span>
                    </Command.Item>
                  ))
                )}
              </Command.List>
            </Command>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </>
  )
}
