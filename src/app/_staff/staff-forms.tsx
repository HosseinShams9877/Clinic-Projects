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
import { formatPhone, toPersianDigits, weekdayName } from '@/core/localization'
import { PERMISSION_LABELS, ROLE_LABELS } from '@/core/localization'
import { Permission, Role } from '@/core/constants'
import {
  activateMembershipAction,
  approveLeaveRequestAction,
  changeMembershipRoleAction,
  deactivateMembershipAction,
  inviteStaffAction,
  rejectLeaveRequestAction,
  resetStaffPasswordAction,
  setDoctorShiftRangesAction,
  updateMembershipPermissionsAction,updateStaffProfileAction,type ActionResult,type InviteInput,type PermissionsInput,type StaffPasswordInput,type StaffProfileInput,
} from './actions'
const ROLE_OPTIONS = Object.values(Role).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))
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
export interface StaffRowActionsProps {
  readonly membership: {
    readonly id: string
    readonly role: string
    readonly isActive: boolean
    readonly user: {
      readonly mobile: string
      readonly firstName: string
      readonly lastName: string
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
function EditStaffModal({
  membership,
  onClose,
  onDone,
}: {
  readonly membership: StaffRowActionsProps['membership']
  readonly onClose: () => void
  readonly onDone: (outcome: ActionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input: StaffProfileInput = {
      membershipId: membership.id,
      firstName: asFormString(form, 'firstName'),
      lastName: asFormString(form, 'lastName'),
    }
    startTransition(async () => onDone(await updateStaffProfileAction(input)))
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {STAFF_PAGE.edit.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={STAFF_PAGE.edit.cancel}
            onClick={onClose}
          />
        </header>

        <p className="px-6 pt-6 text-sm text-ink-2">{STAFF_PAGE.edit.lead}</p>

        <form id={EDIT_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={STAFF_PAGE.edit.firstName} required className="flex-1">
              <TextInput name="firstName" defaultValue={membership.user.firstName} />
            </Field>
            <Field label={STAFF_PAGE.edit.lastName} className="flex-1">
              <TextInput name="lastName" defaultValue={membership.user.lastName} />
            </Field>
          </div>

          <Field label={STAFF_PAGE.columns.mobile}>
            <TextInput
              name="mobile"
              value={formatPhone(membership.user.mobile)}
              readOnly
              aria-readonly="true"
              dir="ltr"
            />
          </Field>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {STAFF_PAGE.edit.cancel}
          </Button>
          <Button type="submit" form={EDIT_FORM_ID} variant="primary" loading={pending}>
            {STAFF_PAGE.edit.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

const EDIT_FORM_ID = 'edit-staff-form'

/* ── The «تغییر رمز عبور» modal ────────────────────────────────────────────── */

function ChangePasswordModal({
  membership,
  onClose,
  onDone,
}: {
  readonly membership: StaffRowActionsProps['membership']
  readonly onClose: () => void
  readonly onDone: (outcome: ActionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const titleId = useId()
  const [localError, setLocalError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = asFormString(form, 'password')
    const confirm = asFormString(form, 'confirmPassword')
    if (password.length < 8) {
      setLocalError(STAFF_PAGE.password.tooShort)
      return
    }
    if (password !== confirm) {
      setLocalError(STAFF_PAGE.password.mismatch)
      return
    }
    setLocalError(null)
    const input: StaffPasswordInput = {
      membershipId: membership.id,
      password,
    }
    startTransition(async () => onDone(await resetStaffPasswordAction(input)))
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {`${STAFF_PAGE.password.title} — ${membership.user.firstName} ${membership.user.lastName}`}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={STAFF_PAGE.password.cancel}
            onClick={onClose}
          />
        </header>

        <p className="px-6 pt-6 text-sm text-ink-2">{STAFF_PAGE.password.lead}</p>

        <form id={PASSWORD_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <Field label={STAFF_PAGE.password.newPassword} required>
            <TextInput name="password" type="password" autoComplete="new-password" dir="ltr" />
          </Field>
          <Field label={STAFF_PAGE.password.confirmPassword} required>
            <TextInput name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" />
          </Field>
          {localError === null ? null : (
            <p className="text-sm text-danger" role="alert">
              {localError}
            </p>
          )}
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {STAFF_PAGE.password.cancel}
          </Button>
          <Button type="submit" form={PASSWORD_FORM_ID} variant="primary" loading={pending}>
            {STAFF_PAGE.password.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

const PASSWORD_FORM_ID = 'change-staff-password-form'

/* ── The «ساعت کاری» modal ─────────────────────────────────────────────────── */

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

interface DayState {
  readonly weekday: number
  readonly active: boolean
  readonly startTime: string
  readonly endTime: string
}

interface RangeState {
  readonly id: string
  readonly weekday: number
  readonly startTime: string
  readonly endTime: string
  readonly slotMinutes: string
}

/**
 * «ساعت کاری پزشک» — the doctor's weekly hours.
 *
 * The default `DoctorWorkingHours` set is the seven rows the top of the form holds.
 * Below them, the doctor's own shift ranges (the override), one or more per weekday,
 * each with its own slot length. A doctor with no ranges keeps the default; a doctor
 * with ranges replaces the default for that weekday entirely.
 */
function WorkingHoursModal({
  doctorId,
  doctorName,
  initial,
  initialRanges,
  onClose,
  onDone,
}: {
  readonly doctorId: string
  readonly doctorName: string
  readonly initial: readonly { readonly weekday: number; readonly startTime: string; readonly endTime: string }[]
  readonly initialRanges: readonly {
    readonly weekday: number
    readonly startTime: string
    readonly endTime: string
    readonly slotMinutes: number
  }[]
  readonly onClose: () => void
  readonly onDone: (outcome: ActionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const titleId = useId()
  const [days, setDays] = useState<readonly DayState[]>(() => initialDays(initial))
  const [ranges, setRanges] = useState<readonly RangeState[]>(() => initialRangesFrom(initialRanges))

  function patch(weekday: number, change: Partial<DayState>) {
    setDays((prev) => prev.map((day) => (day.weekday === weekday ? { ...day, ...change } : day)))
  }

  function patchRange(id: string, change: Partial<RangeState>) {
    setRanges((prev) => prev.map((range) => (range.id === id ? { ...range, ...change } : range)))
  }

  function addRange(weekday: number) {
    setRanges((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        weekday,
        startTime: '09:00',
        endTime: '17:00',
        slotMinutes: '30',
      },
    ])
  }

  function removeRange(id: string) {
    setRanges((prev) => prev.filter((range) => range.id !== id))
  }

  function submit() {
    const dayRows = days
      .filter((day) => day.active)
      .map((day) => ({ weekday: day.weekday, startTime: day.startTime, endTime: day.endTime }))
    const rangeRows = ranges.map((range) => ({
      weekday: range.weekday,
      startTime: range.startTime,
      endTime: range.endTime,
      slotMinutes: Number.parseInt(range.slotMinutes, 10) || 30,
    }))
    startTransition(async () =>
      onDone(await setDoctorShiftRangesAction({ doctorId, days: dayRows, ranges: rangeRows })),
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {`${ADMIN_STAFF.workingHours.title} — ${doctorName}`}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={ADMIN_STAFF.workingHours.close} onClick={onClose} />
        </header>

        <p className="px-6 pt-6 text-sm text-ink-2">{ADMIN_STAFF.workingHours.lead}</p>

        <div className="flex flex-col gap-2 p-6">
          <h3 className="text-sm font-bold text-ink">{ADMIN_STAFF.workingHours.defaultTitle}</h3>
          {days.map((state) => (
            <div key={state.weekday} className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
              <label className="flex min-w-[96px] items-center gap-2">
                <input
                  type="checkbox"
                  checked={state.active}
                  onChange={(event) => patch(state.weekday, { active: event.currentTarget.checked })}
                  className="size-4 rounded-xs border border-line-2 accent-brand"
                />
                <span className="text-sm font-semibold text-ink">{weekdayLabel(state.weekday)}</span>
              </label>
              <span className="flex items-center gap-1 text-xs text-ink-3">
                {ADMIN_STAFF.workingHours.from}
                <input
                  type="time"
                  value={state.startTime}
                  disabled={!state.active}
                  onChange={(event) => patch(state.weekday, { startTime: event.currentTarget.value })}
                  className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums disabled:bg-surface-sunken"
                />
                {ADMIN_STAFF.workingHours.to}
                <input
                  type="time"
                  value={state.endTime}
                  disabled={!state.active}
                  onChange={(event) => patch(state.weekday, { endTime: event.currentTarget.value })}
                  className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums disabled:bg-surface-sunken"
                />
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-line p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">{ADMIN_STAFF.workingHours.rangesTitle}</h3>
            <span className="text-xs text-ink-3">{ADMIN_STAFF.workingHours.rangesHint}</span>
          </div>

          {ranges.length === 0 ? (
            <p className="rounded-sm border border-dashed border-line-2 px-3 py-4 text-center text-xs text-ink-3">
              {ADMIN_STAFF.workingHours.rangesEmpty}
            </p>
          ) : (
            ranges.map((range) => (
              <div key={range.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
                <select
                  value={range.weekday}
                  onChange={(event) => patchRange(range.id, { weekday: Number.parseInt(event.currentTarget.value, 10) })}
                  className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-sm text-ink"
                >
                  {WEEKDAYS.map((weekday) => (
                    <option key={weekday} value={weekday}>
                      {weekdayLabel(weekday)}
                    </option>
                  ))}
                </select>
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  {ADMIN_STAFF.workingHours.from}
                  <input
                    type="time"
                    value={range.startTime}
                    onChange={(event) => patchRange(range.id, { startTime: event.currentTarget.value })}
                    className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums"
                  />
                  {ADMIN_STAFF.workingHours.to}
                  <input
                    type="time"
                    value={range.endTime}
                    onChange={(event) => patchRange(range.id, { endTime: event.currentTarget.value })}
                    className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums"
                  />
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  {ADMIN_STAFF.workingHours.slotMinutesLabel}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={range.slotMinutes}
                    onChange={(event) => patchRange(range.id, { slotMinutes: event.currentTarget.value })}
                    className="w-16 rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums"
                  />
                </span>
                <Button
                  size="small"
                  variant="ghost"
                  leadingIcon="close"
                  onClick={() => removeRange(range.id)}
                  aria-label={ADMIN_STAFF.workingHours.removeRange}
                >
                  {ADMIN_STAFF.workingHours.removeRange}
                </Button>
              </div>
            ))
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((weekday) => (
              <Button
                key={weekday}
                size="small"
                variant="neutral"
                onClick={() => addRange(weekday)}
              >
                {`${ADMIN_STAFF.workingHours.addRange} — ${weekdayLabel(weekday)}`}
              </Button>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {ADMIN_STAFF.workingHours.cancel}
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            {ADMIN_STAFF.workingHours.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

function weekdayLabel(weekday: number): string {
  const names = [0, 1, 2, 3, 4, 5, 6].map((index) => weekdayName(index as Parameters<typeof weekdayName>[0]))
  return names[weekday] ?? ''
}

function initialDays(
  initial: readonly { readonly weekday: number; readonly startTime: string; readonly endTime: string }[],
): readonly DayState[] {
  const byDay = new Map(initial.map((row) => [row.weekday, row]))
  return WEEKDAYS.map((weekday) => {
    const row = byDay.get(weekday)
    return row === undefined
      ? { weekday, active: false, startTime: '09:00', endTime: '17:00' }
      : { weekday, active: true, startTime: row.startTime, endTime: row.endTime }
  })
}

function initialRangesFrom(
  initial: readonly {
    readonly weekday: number
    readonly startTime: string
    readonly endTime: string
    readonly slotMinutes: number
  }[],
): readonly RangeState[] {
  return initial.map((row) => ({
    id: crypto.randomUUID(),
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    slotMinutes: String(row.slotMinutes),
  }))
}
function PermissionModal({
  membership,
  grid,
  role,
  onRoleChange,
  onClose,
  onDone,
}: {
  readonly membership: StaffRowActionsProps['membership']
  readonly grid: StaffRowActionsProps['grid']
  readonly role: string | null
  readonly onRoleChange: (role: string) => void
  readonly onClose: () => void
  readonly onDone: (outcome: ActionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const [held, setHeld] = useState<ReadonlySet<Permission>>(
    () => new Set(grid.filter((cell) => cell.held).map((cell) => cell.permission)),
  )
  const titleId = useId()
  const locked = grid.some((cell) => cell.locked)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const granted: Permission[] = []
    const revoked: Permission[] = []
    for (const cell of grid) {
      if (held.has(cell.permission)) granted.push(cell.permission)
      else revoked.push(cell.permission)
    }
    const input: PermissionsInput = { granted, revoked }
    startTransition(async () => onDone(await updateMembershipPermissionsAction(membership.id, input)))
  }
  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {`${membership.user.firstName} ${membership.user.lastName}`}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={STAFF_PAGE.invite.cancel}
            onClick={onClose}
          />
        </header>

        <div className="flex flex-col gap-3 p-6">
          <p className="text-sm font-semibold text-ink">
            {`${STAFF_PAGE.invite.role}: ${role === null ? '' : ROLE_LABELS[role as Role]}`}
          </p>
          <p className="text-sm text-ink-2">{STAFF_PAGE.matrix.note}</p>

          <Field label={STAFF_PAGE.invite.role}>
            <Combobox
              value={role}
              onChange={onRoleChange}
              options={ROLE_OPTIONS}
              placeholder={STAFF_PAGE.invite.role}
              emptyMessage={STAFF_PAGE.invite.role}
            />
          </Field>

          {role !== null && role !== membership.role ? (
            <ApplyRoleRow
              disabled={pending}
              onApply={() =>
                startTransition(async () =>
                  onDone(await changeMembershipRoleAction(membership.id, role)),
                )
              }
            />
          ) : null}

          <p className="text-sm text-ink-2">{STAFF_PAGE.matrix.lead}</p>
          <p className="text-xs text-ink-3">{STAFF_PAGE.matrix.hint}</p>
        </div>

        {locked ? (
          <div className="flex flex-col gap-3 px-6 pb-6">
            {grid.map((cell) => (
              <LockedRow key={cell.permission} label={PERMISSION_LABELS[cell.permission]} />
            ))}
          </div>
        ) : (
          <form id={PERMISSIONS_FORM_ID} className="flex flex-col gap-2 px-6 pb-6" onSubmit={submit}>
            <p className="text-xs font-semibold text-ink-2">
              {toPersianDigits(held.size)} {STAFF_PAGE.matrix.countOf}{' '}
              {toPersianDigits(STAFF_PAGE.matrix.countTotal)}
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{STAFF_PAGE.matrix.title}</legend>
              {grid.map((cell) => (
                <PermissionRow
                  key={cell.permission}
                  label={PERMISSION_LABELS[cell.permission]}
                  checked={held.has(cell.permission)}
                  onChange={(next) => {
                    setHeld((prev) => {
                      const nextSet = new Set(prev)
                      if (next) nextSet.add(cell.permission)
                      else nextSet.delete(cell.permission)
                      return nextSet
                    })
                  }}
                />
              ))}
            </fieldset>
          </form>
        )}
        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {STAFF_PAGE.invite.cancel}
          </Button>
          {locked ? null : (
            <Button type="submit" form={PERMISSIONS_FORM_ID} variant="primary" loading={pending}>
              {STAFF_PAGE.matrix.save}
            </Button>
          )}
        </footer>
      </div>
    </Overlay>
  )
}
const PERMISSIONS_FORM_ID = 'membership-permissions-form'
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

function PermissionRow({
  label,
  checked,
  onChange,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-4 rounded-xs border border-line-2 accent-brand"
      />
      <span className="text-sm font-semibold text-ink">{label}</span>
    </label>
  )
}
function LockedRow({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="inline-flex rounded-pill bg-neutral-bg px-2 py-1 text-xs font-semibold text-ink-3">
        {STAFF_PAGE.matrix.managerLocked}
      </span>
    </div>
  )
}

function ApplyRoleRow({ disabled, onApply }: { readonly disabled: boolean; readonly onApply: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="small" variant="neutral" disabled={disabled} onClick={onApply}>
        {STAFF_PAGE.membership.applyRole}
      </Button>
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