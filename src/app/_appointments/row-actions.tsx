/**
 * The row-level actions a day cell and a cartable row carry.
 *
 * The grid is a server component, because the rows it renders are the module's own
 * queries; the actions are a client component, because a click is a state change and
 * the sentence the module raises comes back onto the same row. The split is the one
 * `02-architecture.md` §6 draws: `src/app/` composes, and the composition of a read
 * and a write is two components rather than one that does both.
 *
 * ## Which actions a status offers
 *
 * The state machine is the module's, and this component does not re-derive it: it
 * asks `canTransition` for the pair and renders the buttons the machine permits.
 * That is what keeps a button from offering a transition the module will refuse —
 * the refusal would still be a sentence on the row, and the honest answer is to not
 * show the affordance at all.
 *
 * ## Why the actions are not optimistic
 *
 * The row is revalidated by the action (`revalidatePath`), so the grid the person
 * sees after a click is the grid the database holds. An optimistic update would
 * render a state the sweep or a second desk may already have moved, and the two
 * would disagree until the next render — the module's own answer to a race is the
 * index, and the UI's is to show what was written.
 */

'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import { AppointmentStatus } from '@/core/constants'
import { canTransition } from '@/modules/appointments'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import {
  cancelAppointmentAction,
  markArrivedAction,
  markNoShowAction,
  recordResultAction,
  type ActionResult,
} from './actions'

/** The panel the actions resolve, which is the caller's own. */
type ActionPanel = 'reception' | 'doctor' | 'admin'

/** The row's own props: its id, its status, and which panel is acting on it. */
export interface RowActionsProps {
  readonly appointmentId: string
  readonly status: string
  readonly panel: ActionPanel
}

/** The actions one row offers, as the state machine permits them. */
export function RowActions({ appointmentId, status, panel }: RowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function run(action: (panel: ActionPanel, id: string) => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await action(panel, appointmentId)
      // The sentence the module raised is shown on the row itself, because the row is
      // what the person was acting on; a toast would be a second surface this
      // component does not own.
      setMessage(outcome.ok ? null : outcome.message)
    })
  }

  const canArrive = canTransition(status as AppointmentStatus, AppointmentStatus.AwaitingArrival)
  const canComplete = canTransition(status as AppointmentStatus, AppointmentStatus.Completed)
  const canNoShow = canTransition(status as AppointmentStatus, AppointmentStatus.NoShow)
  const canCancel = canTransition(status as AppointmentStatus, AppointmentStatus.Cancelled)

  if (!canArrive && !canComplete && !canNoShow && !canCancel) {
    // A terminal row offers nothing. Rendering an empty group would still claim the
    // row's end cell, so the component returns nothing instead.
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
      {canArrive ? (
        <ActionButton
          label={APPOINTMENTS_PAGE.controls.arrived}
          icon="confirm"
          disabled={pending}
          onClick={() => run(markArrivedAction)}
        />
      ) : null}
      {canComplete ? (
        <ActionButton
          label={APPOINTMENTS_PAGE.controls.result}
          icon="confirm"
          disabled={pending}
          onClick={() => run(recordResultAction)}
        />
      ) : null}
      {canNoShow ? (
        <ActionButton
          label={APPOINTMENTS_PAGE.controls.noShow}
          icon="blocked"
          disabled={pending}
          onClick={() => run(markNoShowAction)}
        />
      ) : null}
      {canCancel ? (
        <ActionButton
          label={APPOINTMENTS_PAGE.controls.cancel}
          icon="close"
          disabled={pending}
          onClick={() => run(cancelAppointmentAction)}
        />
      ) : null}
      </div>
      {message === null ? null : (
        <p
          className="flex items-center gap-1 text-xs text-danger"
          role="alert"
          aria-live="polite"
        >
          <Icon name="error" size="compact" />
          {message}
        </p>
      )}
    </div>
  )
}

/** One row action, sized for the cell it sits in. */
function ActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  readonly label: string
  readonly icon: Parameters<typeof Icon>[0]['name']
  readonly disabled: boolean
  readonly onClick: () => void
}) {
  return (
    <Button size="small" variant="neutral" leadingIcon={icon} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
}
