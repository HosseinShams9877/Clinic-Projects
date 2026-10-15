'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { STAFF_PAGE } from '@/app/catalog'
import { ADMIN_STAFF } from '@/app/admin/catalog'
import { cx } from '@/core/lib'
import { ROLE_LABELS } from '@/core/localization'
import { Permission, Role } from '@/core/constants'

import {
  activateMembershipAction,
  approveLeaveRequestAction,
  deactivateMembershipAction,
  inviteStaffAction,
  rejectLeaveRequestAction,
  type ActionResult,
  type InviteInput,
} from './actions'

import {
  ChangePasswordModal,
  EditStaffModal,
  PermissionModal,
  StaffAvatarModal,
  WorkingHoursModal,
} from './_staff-modals'

const ROLE_OPTIONS = Object.values(Role).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))

/* ── The pieces the six dialogs share ──────────────────────────────────────── */

type FormAnswer = { readonly ok: boolean; readonly message: string }

function FormAnswer({ answer }: { readonly answer: FormAnswer | null }) {
  if (answer === null) return null
  return (
    <p
      className={cx('flex items-center gap-1 text-sm', answer.ok ? 'text-ok' : 'text-danger')}
      role="alert"
      aria-live="polite"
    >
      <Icon name={answer.ok ? 'confirm' : 'error'} size="compact" />
      {answer.message}
    </p>
  )
}

function Overlay({
  children,
  onClose,
}: {
  readonly children: ReactNode
  readonly onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="inline-size-full" onClick={stopPropagation} role="presentation">
        {children}
      </div>
    </div>
  )
}

function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.value : ''
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}

/* ── NewStaffDialog ────────────────────────────────────────────────────────── */

export function NewStaffDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [role, setRole] = useState<string>('')
  const titleId = useId()

  if (!open) {
    return (
      <Button variant="primary" leadingIcon="customer" onClick={() => setOpen(true)}>
        {STAFF_PAGE.invite.title}
      </Button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (role === '') {
      setAnswer({ ok: false, message: STAFF_PAGE.invite.role })
      return
    }
    const input: InviteInput = {
      mobile: asFormString(event.currentTarget, 'mobile'),
      firstName: asFormString(event.currentTarget, 'firstName'),
      lastName: asFormString(event.currentTarget, 'lastName'),
      password: asFormString(event.currentTarget, 'password'),
      role,
    }
    startTransition(async () => {
      const outcome: ActionResult = await inviteStaffAction(input)
      if (outcome.ok) {
        setOpen(false)
        return
      }
      setAnswer(outcome)
    })
  }

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {STAFF_PAGE.invite.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={STAFF_PAGE.invite.cancel}
            onClick={() => setOpen(false)}
          />
        </header>
        <p className="px-6 pt-6 text-sm text-ink-2">{STAFF_PAGE.invite.lead}</p>

        <form id={INVITE_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={STAFF_PAGE.invite.firstName} required className="flex-1">
              <TextInput name="firstName" />
            </Field>
            <Field label={STAFF_PAGE.invite.lastName} className="flex-1">
              <TextInput name="lastName" />
            </Field>
          </div>

          <Field label={STAFF_PAGE.invite.mobile} required>
            <TextInput name="mobile" type="tel" inputMode="tel" dir="ltr" />
          </Field>

          <Field label={STAFF_PAGE.invite.password} required>
            <TextInput name="password" type="password" autoComplete="new-password" dir="ltr" />
          </Field>

          <Field label={STAFF_PAGE.invite.role} required>
            <Combobox
              value={role === '' ? null : role}
              onChange={setRole}
              options={ROLE_OPTIONS}
              placeholder={STAFF_PAGE.invite.role}
              emptyMessage={STAFF_PAGE.invite.role}
            />
          </Field>

          <FormAnswer answer={answer} />
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {STAFF_PAGE.invite.cancel}
          </Button>
          <Button type="submit" form={INVITE_FORM_ID} variant="primary" loading={pending}>
            {STAFF_PAGE.invite.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

const INVITE_FORM_ID = 'invite-staff-form'

/* ── StaffRowActions ───────────────────────────────────────────────────────── */

export interface StaffRowActionsProps {
  readonly membership: {
    readonly id: string
    readonly role: string
    readonly isActive: boolean
    readonly user: {
      readonly mobile: string
      readonly firstName: string
      readonly lastName: string
      readonly avatarUrl: string | null
      readonly avatarBackend: string | null
      readonly avatarKey: string | null
    }
  }
  readonly grid: readonly { readonly permission: Permission; readonly held: boolean; readonly locked: boolean }[]
  readonly workingHours?: {
    readonly doctorId: string
    readonly rows: readonly { readonly weekday: number; readonly startTime: string; readonly endTime: string }[]
  }
  readonly shiftRanges?: {
    readonly doctorId: string
    readonly rows: readonly {
      readonly weekday: number
      readonly startTime: string
      readonly endTime: string
      readonly slotMinutes: number
    }[]
  }
}

export function StaffRowActions({ membership, grid, workingHours, shiftRanges }: StaffRowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [editing, setEditing] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [picturing, setPicturing] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [role, setRole] = useState<string | null>(membership.role)

  function run(action: () => Promise<ActionResult>, onOk: () => void) {
    startTransition(async () => {
      const outcome = await action()
      if (outcome.ok) {
        onOk()
        return
      }
      setAnswer(outcome)
    })
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="neutral"
          leadingIcon="settings"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setEditing(true)
          }}
        >
          {STAFF_PAGE.columns.permissions}
        </Button>
        <Button
          size="small"
          variant="neutral"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setEditingProfile(true)
          }}
        >
          {STAFF_PAGE.edit.trigger}
        </Button>
        <Button
          size="small"
          variant="neutral"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setChangingPassword(true)
          }}
        >
          {STAFF_PAGE.password.trigger}
        </Button>
        <Button
          size="small"
          variant="neutral"
          leadingIcon="image"
          disabled={pending}
          onClick={() => {
            setAnswer(null)
            setPicturing(true)
          }}
        >
          {STAFF_PAGE.avatar.trigger}
        </Button>
        {workingHours !== undefined ? (
          <Button
            size="small"
            variant="neutral"
            leadingIcon="clock"
            disabled={pending}
            onClick={() => setHoursOpen(true)}
          >
            {ADMIN_STAFF.workingHours.trigger}
          </Button>
        ) : null}
        {membership.isActive ? (
          <Button
            size="small"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => deactivateMembershipAction(membership.id), () => {})}
          >
            {STAFF_PAGE.membership.deactivate}
          </Button>
        ) : (
          <Button
            size="small"
            variant="primary"
            loading={pending}
            onClick={() => run(() => activateMembershipAction(membership.id), () => {})}
          >
            {STAFF_PAGE.membership.activate}
          </Button>
        )}
      </div>

      <FormAnswer answer={answer} />

      {editing ? (
        <PermissionModal
          membership={membership}
          grid={grid}
          role={role}
          onRoleChange={setRole}
          onClose={() => setEditing(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setEditing(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}

      {editingProfile ? (
        <EditStaffModal
          membership={membership}
          onClose={() => setEditingProfile(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setEditingProfile(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}

      {changingPassword ? (
        <ChangePasswordModal
          membership={membership}
          onClose={() => setChangingPassword(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setChangingPassword(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}

      {picturing ? (
        <StaffAvatarModal
          membership={membership}
          onClose={() => setPicturing(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setPicturing(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}

      {hoursOpen && workingHours !== undefined ? (
        <WorkingHoursModal
          doctorId={workingHours.doctorId}
          doctorName={`${membership.user.firstName} ${membership.user.lastName}`}
          initial={workingHours.rows}
          initialRanges={shiftRanges?.rows ?? []}
          onClose={() => setHoursOpen(false)}
          onDone={(outcome) => {
            if (outcome.ok) {
              setHoursOpen(false)
              return
            }
            setAnswer(outcome)
          }}
        />
      ) : null}
    </div>
  )
}

/* ── LeaveRowActions ───────────────────────────────────────────────────────── */

export interface LeaveRowActionsProps {
  readonly leaveRequestId: string
  readonly status: string
}

export function LeaveRowActions({ leaveRequestId, status }: LeaveRowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)

  if (status !== 'PENDING') return null

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) setAnswer(outcome)
    })
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="primary"
          loading={pending}
          onClick={() => run(() => approveLeaveRequestAction(leaveRequestId))}
        >
          {STAFF_PAGE.membership.approve}
        </Button>
        <Button
          size="small"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => rejectLeaveRequestAction(leaveRequestId))}
        >
          {STAFF_PAGE.membership.reject}
        </Button>
      </div>
      <FormAnswer answer={answer} />
    </div>
  )
}

/* ── Re-exports ────────────────────────────────────────────────────────────── */

export { ChangePasswordModal, EditStaffModal, PermissionModal, StaffAvatarModal, WorkingHoursModal }