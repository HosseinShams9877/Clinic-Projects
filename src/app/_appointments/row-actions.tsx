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
 * ## Why a slot block's "arrived" opens the note dialog
 *
 * A slot block is a closed hour, not a booking: it has no customer, no service, and
 * no arrival stage to walk through. The desk closes it in one step — `BOOKED` →
 * `COMPLETED` — and the note the dialog collects is the only fact the desk records
 * about it. The button is therefore labelled «حاضر شد» (the block's own word for
 * "this hour is over") and it opens `ResultDialog`, which writes the same
 * `resultNote` a real booking's completion would.
 *
 * A real booking keeps the two-step path: «حاضر شد» on `BOOKED` is the plain arrival
 * transition, and «ثبت نتیجه» on `ARRIVED` is the note dialog. The two rows mean two
 * different things by "arrived", and the `isSlotBlock` flag is what tells them
 * apart.
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
import { CANCEL_CONFIRM } from './catalog'
import { EditDialog, type DoctorOption } from './edit-dialog'
import type { ServiceOption } from './booking-dialog'
import {
  cancelAppointmentAction,
  markArrivedAction,
  markNoShowAction,
  type ActionResult,
} from './actions'
import { ResultDialog } from './result-dialog'

/** The panel the actions resolve, which is the caller's own. */
type ActionPanel = 'reception' | 'doctor' | 'admin'

/** What the «ویرایش نوبت» button needs — the row's own values and the pick lists. */
export interface RowEditContext {
  readonly doctorId: string
  readonly serviceId: string | null
  readonly localDate: string
  readonly localTime: string
  readonly isSlotBlock: boolean
  readonly services: readonly ServiceOption[]
  readonly doctorOptions: readonly DoctorOption[]
  /**
   * The service ids each doctor offers, keyed by doctor id — the same map the
   * booking popup reads. Optional, because a surface that does not read the day
   * grid (the cartable) has no map to hand, and the edit dialog's own fallback
   * (the whole catalogue) is the right one there.
   */
  readonly servicesByDoctorId?: Readonly<Record<string, readonly string[]>>
}

/** The row's own props: its id, its status, which panel is acting, and the edit context. */
export interface RowActionsProps {
  readonly appointmentId: string
  readonly status: string
  readonly panel: ActionPanel
  /**
   * Whether the row is a slot block — a closed hour. A block shares the `BOOKED`
   * status with a real booking, so the state machine alone cannot tell them apart;
   * this flag is what lets the row render the actions a block may actually take.
   */
  readonly isSlotBlock?: boolean
  /** The edit popup's data; omitted on surfaces that do not offer an edit (the cartable). */
  readonly edit?: RowEditContext
}

/** The actions one row offers, as the state machine permits them. */
export function RowActions({ appointmentId, status, panel, isSlotBlock = false, edit }: RowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  function run(action: (panel: ActionPanel, id: string) => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await action(panel, appointmentId)
      // The sentence the module raised is shown on the row itself, because the row is
      // what the person was acting on; a toast would be a second surface this
      // component does not own.
      setMessage(outcome.ok ? null : outcome.message)
    })
  }

  // A slot block closes in one step: it shows «حاضر شد» as the trigger for the note
  // dialog, and the dialog writes `BOOKED` → `COMPLETED` with the note. A real
  // booking walks the two-step path — «حاضر شد» is the plain arrival, and «ثبت
  // نتیجه» is the note dialog from `ARRIVED`. The two rows mean different things
  // by "arrived", and this is where they part ways.
  const canArriveAsBooking =
    !isSlotBlock && canTransition(status as AppointmentStatus, AppointmentStatus.Arrived)
  const canComplete = canTransition(status as AppointmentStatus, AppointmentStatus.Completed)
  const canNoShow = !isSlotBlock && canTransition(status as AppointmentStatus, AppointmentStatus.NoShow)
  const canCancel = canTransition(status as AppointmentStatus, AppointmentStatus.Cancelled)
  // A block's "arrived" is the dialog trigger, not a plain transition.
  const canCloseBlock = isSlotBlock && canComplete
  // An edit is offered on a live booking only — a row the machine would still let the
  // desk cancel, that holds a service (not a slot block). A terminal row offers none.
  const canEdit =
    edit !== undefined && !edit.isSlotBlock && edit.serviceId !== null && (canArriveAsBooking || canCancel)

  if (!canArriveAsBooking && !canComplete && !canNoShow && !canCancel && !canEdit && !canCloseBlock) {
    // A terminal row offers nothing. Rendering an empty group would still claim the
    // row's end cell, so the component returns nothing instead.
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {canArriveAsBooking ? (
          <ActionButton
            label={APPOINTMENTS_PAGE.controls.arrived}
            icon="confirm"
            disabled={pending}
            onClick={() => run(markArrivedAction)}
          />
        ) : null}
        {canCloseBlock ? (
          <ResultDialog
            panel={panel}
            appointmentId={appointmentId}
            triggerLabel={APPOINTMENTS_PAGE.controls.arrived}
          />
        ) : null}
        {canComplete && !isSlotBlock ? (
          <ResultDialog panel={panel} appointmentId={appointmentId} />
        ) : null}
        {canNoShow ? (
          <ActionButton
            label={APPOINTMENTS_PAGE.controls.noShow}
            icon="blocked"
            disabled={pending}
            onClick={() => run(markNoShowAction)}
          />
        ) : null}
        {canEdit && edit !== undefined ? (
          <EditDialog
            appointmentId={appointmentId}
            panel={panel}
            services={edit.services}
            doctorOptions={edit.doctorOptions}
            canChangeDoctor={panel === 'admin'}
            servicesByDoctorId={edit.servicesByDoctorId}
            current={{
              doctorId: edit.doctorId,
              serviceId: edit.serviceId ?? '',
              localDate: edit.localDate,
              localTime: edit.localTime,
            }}
          />
        ) : null}
        {canCancel ? (
          <ActionButton
            label={APPOINTMENTS_PAGE.controls.cancel}
            icon="close"
            disabled={pending}
            onClick={() => setConfirmingCancel(true)}
          />
        ) : null}
      </div>

      {confirmingCancel ? (
        <div className="flex flex-col gap-2 rounded-sm border border-danger-bg bg-danger-bg/40 p-3">
          <p className="text-xs font-semibold text-ink">{CANCEL_CONFIRM.title}</p>
          <p className="text-xs text-ink-2">{CANCEL_CONFIRM.body}</p>
          <div className="flex flex-wrap gap-1">
            <Button
              size="small"
              variant="danger"
              disabled={pending}
              onClick={() => {
                setConfirmingCancel(false)
                run(cancelAppointmentAction)
              }}
            >
              {CANCEL_CONFIRM.confirm}
            </Button>
            <Button size="small" variant="ghost" disabled={pending} onClick={() => setConfirmingCancel(false)}>
              {CANCEL_CONFIRM.dismiss}
            </Button>
          </div>
        </div>
      ) : null}

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