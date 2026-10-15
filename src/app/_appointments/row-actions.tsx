'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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

type ActionPanel = 'reception' | 'doctor' | 'admin'

export interface RowEditContext {
  readonly doctorId: string
  readonly doctorName: string
  readonly serviceId: string | null
  readonly localDate: string
  readonly localTime: string
  readonly isSlotBlock: boolean
  readonly services: readonly ServiceOption[]
  readonly doctorOptions: readonly DoctorOption[]
  readonly servicesByDoctorId?: Readonly<Record<string, readonly string[]>>
}

export interface RowActionsProps {
  readonly appointmentId: string
  readonly status: string
  readonly panel: ActionPanel
  readonly charged?: bigint
  readonly alreadyPaid?: bigint
  readonly isSlotBlock?: boolean
  readonly edit?: RowEditContext
}

export function RowActions({
  appointmentId,
  status,
  panel,
  charged,
  alreadyPaid,
  isSlotBlock = false,
  edit,
}: RowActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  function run(
    action: (panel: ActionPanel, id: string) => Promise<ActionResult>,
    label: string,
  ) {
    startTransition(async () => {
      console.log(`[RowActions] running ${label} for ${appointmentId} (status=${status})`)
      const outcome = await action(panel, appointmentId)
      console.log(`[RowActions] ${label} outcome:`, outcome)
      if (outcome.ok) {
        setMessage(null)
        router.refresh()
        return
      }
      setMessage(outcome.message)
    })
  }

  const canArriveAsBooking =
    !isSlotBlock && canTransition(status as AppointmentStatus, AppointmentStatus.Arrived)
  const canCompleteAsBooking = !isSlotBlock && status === AppointmentStatus.Arrived
  const canNoShow =
    !isSlotBlock && canTransition(status as AppointmentStatus, AppointmentStatus.NoShow)
  const canCancel = canTransition(status as AppointmentStatus, AppointmentStatus.Cancelled)
  const canCloseBlock =
    isSlotBlock && canTransition(status as AppointmentStatus, AppointmentStatus.Completed)
  const canEdit =
    edit !== undefined &&
    !edit.isSlotBlock &&
    edit.serviceId !== null &&
    (canArriveAsBooking || canCancel)

  if (
    !canArriveAsBooking &&
    !canCompleteAsBooking &&
    !canNoShow &&
    !canCancel &&
    !canEdit &&
    !canCloseBlock
  ) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {canArriveAsBooking ? (
          <Button
            size="small"
            variant="neutral"
            leadingIcon="confirm"
            loading={pending}
            onClick={() => run(markArrivedAction, 'markArrivedAction')}
          >
            {APPOINTMENTS_PAGE.controls.arrived}
          </Button>
        ) : null}
        {canCloseBlock ? (
          <ResultDialog
            panel={panel}
            appointmentId={appointmentId}
            charged={charged ?? 0n}
            alreadyPaid={alreadyPaid ?? 0n}
            triggerLabel={APPOINTMENTS_PAGE.controls.arrived}
          />
        ) : null}
        {canCompleteAsBooking ? (
          <ResultDialog
            panel={panel}
            appointmentId={appointmentId}
            charged={charged ?? 0n}
            alreadyPaid={alreadyPaid ?? 0n}
          />
        ) : null}
        {canNoShow ? (
          <ActionButton
            label={APPOINTMENTS_PAGE.controls.noShow}
            icon="blocked"
            disabled={pending}
            onClick={() => run(markNoShowAction, 'markNoShowAction')}
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
              doctorName: edit.doctorName,
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
                run(cancelAppointmentAction, 'cancelAppointmentAction')
              }}
            >
              {CANCEL_CONFIRM.confirm}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmingCancel(false)}
            >
              {CANCEL_CONFIRM.dismiss}
            </Button>
          </div>
        </div>
      ) : null}

      {message === null ? null : (
        <p className="flex items-center gap-1 text-xs text-danger" role="alert" aria-live="polite">
          <Icon name="error" size="compact" />
          {message}
        </p>
      )}
    </div>
  )
}

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