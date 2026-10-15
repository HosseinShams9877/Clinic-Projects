'use client'

import { useId, useState, useTransition } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

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
  changeMembershipRoleAction,
  resetStaffPasswordAction,
  setDoctorShiftRangesAction,
  updateMembershipPermissionsAction,
  updateStaffProfileAction,
  uploadStaffAvatarAction,
  type ActionResult,
  type PermissionsInput,
  type StaffAvatarInput,
  type StaffPasswordInput,
  type StaffProfileInput,
  type UploadResult,
} from './actions'

const ROLE_OPTIONS = Object.values(Role).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))

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
  readonly children: React.ReactNode
  readonly onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="inline-size-full" onClick={(e) => e.stopPropagation()} role="presentation">
        {children}
      </div>
    </div>
  )
}

function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.value : ''
}

/* ── EditStaffModal ────────────────────────────────────────────────────────── */

export function EditStaffModal({
  membership,
  onClose,
  onDone,
}: {
  readonly membership: {
    readonly id: string
    readonly user: { readonly mobile: string; readonly firstName: string; readonly lastName: string }
  }
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
          <h2 id={titleId} className="text-lg font-bold text-ink">{STAFF_PAGE.edit.title}</h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={STAFF_PAGE.edit.cancel} onClick={onClose} />
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
            <TextInput name="mobile" value={formatPhone(membership.user.mobile)} readOnly aria-readonly="true" dir="ltr" />
          </Field>
        </form>
        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>{STAFF_PAGE.edit.cancel}</Button>
          <Button type="submit" form={EDIT_FORM_ID} variant="primary" loading={pending}>{STAFF_PAGE.edit.save}</Button>
        </footer>
      </div>
    </Overlay>
  )
}
const EDIT_FORM_ID = 'edit-staff-form'

/* ── ChangePasswordModal ───────────────────────────────────────────────────── */

export function ChangePasswordModal({
  membership,
  onClose,
  onDone,
}: {
  readonly membership: { readonly id: string; readonly user: { readonly firstName: string; readonly lastName: string } }
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
    if (password.length < 8) { setLocalError(STAFF_PAGE.password.tooShort); return }
    if (password !== confirm) { setLocalError(STAFF_PAGE.password.mismatch); return }
    setLocalError(null)
    const input: StaffPasswordInput = { membershipId: membership.id, password }
    startTransition(async () => onDone(await resetStaffPasswordAction(input)))
  }

  return (
    <Overlay onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg">
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {`${STAFF_PAGE.password.title} — ${membership.user.firstName} ${membership.user.lastName}`}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={STAFF_PAGE.password.cancel} onClick={onClose} />
        </header>
        <p className="px-6 pt-6 text-sm text-ink-2">{STAFF_PAGE.password.lead}</p>
        <form id={PASSWORD_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <Field label={STAFF_PAGE.password.newPassword} required>
            <TextInput name="password" type="password" autoComplete="new-password" dir="ltr" />
          </Field>
          <Field label={STAFF_PAGE.password.confirmPassword} required>
            <TextInput name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" />
          </Field>
          {localError === null ? null : <p className="text-sm text-danger" role="alert">{localError}</p>}
        </form>
        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>{STAFF_PAGE.password.cancel}</Button>
          <Button type="submit" form={PASSWORD_FORM_ID} variant="primary" loading={pending}>{STAFF_PAGE.password.save}</Button>
        </footer>
      </div>
    </Overlay>
  )
}
const PASSWORD_FORM_ID = 'change-staff-password-form'

/* ── StaffAvatarModal ──────────────────────────────────────────────────────── */

export function StaffAvatarModal({
  membership,
  onClose,
  onDone,
}: {
  readonly membership: {
    readonly id: string
    readonly user: {
      readonly firstName: string
      readonly lastName: string
      readonly avatarUrl: string | null
      readonly avatarBackend: string | null
      readonly avatarKey: string | null
    }
  }
  readonly onClose: () => void
  readonly onDone: (outcome: { readonly ok: true } | { readonly ok: false; readonly message: string }) => void
}) {
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(membership.user.avatarUrl)
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const titleId = useId()

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    setChosen(file)
    setAnswer(null)
    if (file !== null) setPreview(URL.createObjectURL(file))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (chosen === null) { setAnswer({ ok: false, message: STAFF_PAGE.avatar.noFile }); return }
    startTransition(async () => {
      const bytes = new Uint8Array(await chosen.arrayBuffer())
      const input: StaffAvatarInput = {
        filename: chosen.name,
        contentType: chosen.type,
        bytes,
        previousKey: membership.user.avatarKey ?? undefined,
        previousBackend:
          membership.user.avatarBackend === 'vercel-blob' || membership.user.avatarBackend === 'public'
            ? membership.user.avatarBackend
            : undefined,
      }
      const outcome: UploadResult = await uploadStaffAvatarAction(membership.id, input)
      if (outcome.ok) { onDone({ ok: true }); return }
      setAnswer({ ok: false, message: outcome.message })
    })
  }

  return (
    <Overlay onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg">
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {`${STAFF_PAGE.avatar.title} — ${membership.user.firstName} ${membership.user.lastName}`}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={STAFF_PAGE.avatar.cancel} onClick={onClose} />
        </header>
        <p className="px-6 pt-6 text-sm text-ink-2">{STAFF_PAGE.avatar.lead}</p>
        <form id={AVATAR_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <div className="flex items-center justify-center rounded-lg border border-dashed border-line-2 bg-surface-2 p-4">
            {preview === null ? (
              <span className="flex items-center gap-2 text-sm text-ink-3">
                <Icon name="image" size="compact" />
                {STAFF_PAGE.avatar.empty}
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={membership.user.firstName} className="max-h-56 rounded-md object-contain" />
            )}
          </div>
          <Field label={STAFF_PAGE.avatar.field}>
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={onPick}
              className="block inline-size-full cursor-pointer rounded-md border border-line-2 bg-surface px-3 py-2 text-sm text-ink file:me-3 file:rounded-xs file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </Field>
          <FormAnswer answer={answer} />
        </form>
        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>{STAFF_PAGE.avatar.cancel}</Button>
          <Button type="submit" form={AVATAR_FORM_ID} variant="primary" loading={pending} disabled={chosen === null}>
            {STAFF_PAGE.avatar.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}
const AVATAR_FORM_ID = 'staff-avatar-form'

/* ── PermissionModal ───────────────────────────────────────────────────────── */

export function PermissionModal({
  membership,
  grid,
  role,
  onRoleChange,
  onClose,
  onDone,
}: {
  readonly membership: { readonly id: string; readonly role: string; readonly user: { readonly firstName: string; readonly lastName: string } }
  readonly grid: readonly { readonly permission: Permission; readonly held: boolean; readonly locked: boolean }[]
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
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-lg">
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {`${membership.user.firstName} ${membership.user.lastName}`}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={STAFF_PAGE.invite.cancel} onClick={onClose} />
        </header>
        <div className="flex flex-col gap-3 p-6">
          <p className="text-sm font-semibold text-ink">
            {`${STAFF_PAGE.invite.role}: ${role === null ? '' : ROLE_LABELS[role as Role]}`}
          </p>
          <p className="text-sm text-ink-2">{STAFF_PAGE.matrix.note}</p>
          <Field label={STAFF_PAGE.invite.role}>
            <Combobox value={role} onChange={onRoleChange} options={ROLE_OPTIONS} placeholder={STAFF_PAGE.invite.role} emptyMessage={STAFF_PAGE.invite.role} />
          </Field>
          {role !== null && role !== membership.role ? (
            <div className="flex items-center gap-2">
              <Button size="small" variant="neutral" disabled={pending} onClick={() => startTransition(async () => onDone(await changeMembershipRoleAction(membership.id, role)))}>
                {STAFF_PAGE.membership.applyRole}
              </Button>
            </div>
          ) : null}
          <p className="text-sm text-ink-2">{STAFF_PAGE.matrix.lead}</p>
          <p className="text-xs text-ink-3">{STAFF_PAGE.matrix.hint}</p>
        </div>

        {locked ? (
          <div className="flex flex-col gap-3 px-6 pb-6">
            {grid.map((cell) => (
              <div key={cell.permission} className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
                <span className="text-sm font-semibold text-ink">{PERMISSION_LABELS[cell.permission]}</span>
                <span className="inline-flex rounded-pill bg-neutral-bg px-2 py-1 text-xs font-semibold text-ink-3">
                  {STAFF_PAGE.matrix.managerLocked}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <form id={PERMISSIONS_FORM_ID} className="flex flex-col gap-2 px-6 pb-6" onSubmit={submit}>
            <p className="text-xs font-semibold text-ink-2">
              {toPersianDigits(held.size)} {STAFF_PAGE.matrix.countOf} {toPersianDigits(STAFF_PAGE.matrix.countTotal)}
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{STAFF_PAGE.matrix.title}</legend>
              {grid.map((cell) => (
                <label key={cell.permission} className="flex items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={held.has(cell.permission)}
                    onChange={(event) => {
                      setHeld((prev) => {
                        const nextSet = new Set(prev)
                        if (event.currentTarget.checked) nextSet.add(cell.permission)
                        else nextSet.delete(cell.permission)
                        return nextSet
                      })
                    }}
                    className="size-4 rounded-xs border border-line-2 accent-brand"
                  />
                  <span className="text-sm font-semibold text-ink">{PERMISSION_LABELS[cell.permission]}</span>
                </label>
              ))}
            </fieldset>
          </form>
        )}
        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>{STAFF_PAGE.invite.cancel}</Button>
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

/* ── WorkingHoursModal ─────────────────────────────────────────────────────── */

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

export function WorkingHoursModal({
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
  readonly initialRanges: readonly { readonly weekday: number; readonly startTime: string; readonly endTime: string; readonly slotMinutes: number }[]
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
      { id: crypto.randomUUID(), weekday, startTime: '09:00', endTime: '17:00', slotMinutes: '30' },
    ])
  }

  function removeRange(id: string) {
    setRanges((prev) => prev.filter((range) => range.id !== id))
  }

  function submit() {
    const dayRows = days.filter((d) => d.active).map((d) => ({ weekday: d.weekday, startTime: d.startTime, endTime: d.endTime }))
    const rangeRows = ranges.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      slotMinutes: Number.parseInt(r.slotMinutes, 10) || 30,
    }))
    startTransition(async () => onDone(await setDoctorShiftRangesAction({ doctorId, days: dayRows, ranges: rangeRows })))
  }

  return (
    <Overlay onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-2xl">
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
                <input type="checkbox" checked={state.active} onChange={(e) => patch(state.weekday, { active: e.currentTarget.checked })} className="size-4 rounded-xs border border-line-2 accent-brand" />
                <span className="text-sm font-semibold text-ink">{weekdayLabel(state.weekday)}</span>
              </label>
              <span className="flex items-center gap-1 text-xs text-ink-3">
                {ADMIN_STAFF.workingHours.from}
                <input type="time" value={state.startTime} disabled={!state.active} onChange={(e) => patch(state.weekday, { startTime: e.currentTarget.value })} className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums disabled:bg-surface-sunken" />
                {ADMIN_STAFF.workingHours.to}
                <input type="time" value={state.endTime} disabled={!state.active} onChange={(e) => patch(state.weekday, { endTime: e.currentTarget.value })} className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums disabled:bg-surface-sunken" />
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
            <p className="rounded-sm border border-dashed border-line-2 px-3 py-4 text-center text-xs text-ink-3">{ADMIN_STAFF.workingHours.rangesEmpty}</p>
          ) : (
            ranges.map((range) => (
              <div key={range.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
                <select value={range.weekday} onChange={(e) => patchRange(range.id, { weekday: Number.parseInt(e.currentTarget.value, 10) })} className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-sm text-ink">
                  {WEEKDAYS.map((w) => <option key={w} value={w}>{weekdayLabel(w)}</option>)}
                </select>
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  <input type="time" value={range.startTime} onChange={(e) => patchRange(range.id, { startTime: e.currentTarget.value })} className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums" />
                  <input type="time" value={range.endTime} onChange={(e) => patchRange(range.id, { endTime: e.currentTarget.value })} className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums" />
                </span>
                <input type="number" inputMode="numeric" value={range.slotMinutes} onChange={(e) => patchRange(range.id, { slotMinutes: e.currentTarget.value })} className="w-16 rounded-xs border border-line-2 bg-surface px-2 py-1 text-ink tabular-nums" />
                <Button size="small" variant="ghost" leadingIcon="close" onClick={() => removeRange(range.id)} aria-label={ADMIN_STAFF.workingHours.removeRange}>
                  {ADMIN_STAFF.workingHours.removeRange}
                </Button>
              </div>
            ))
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => (
              <Button key={w} size="small" variant="neutral" onClick={() => addRange(w)}>
                {`${ADMIN_STAFF.workingHours.addRange} — ${weekdayLabel(w)}`}
              </Button>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>{ADMIN_STAFF.workingHours.cancel}</Button>
          <Button variant="primary" loading={pending} onClick={submit}>{ADMIN_STAFF.workingHours.save}</Button>
        </footer>
      </div>
    </Overlay>
  )
}

function weekdayLabel(weekday: number): string {
  const names = [0, 1, 2, 3, 4, 5, 6].map((i) => weekdayName(i as Parameters<typeof weekdayName>[0]))
  return names[weekday] ?? ''
}

function initialDays(initial: readonly { readonly weekday: number; readonly startTime: string; readonly endTime: string }[]): readonly DayState[] {
  const byDay = new Map(initial.map((row) => [row.weekday, row]))
  return WEEKDAYS.map((weekday) => {
    const row = byDay.get(weekday)
    return row === undefined
      ? { weekday, active: false, startTime: '09:00', endTime: '17:00' }
      : { weekday, active: true, startTime: row.startTime, endTime: row.endTime }
  })
}

function initialRangesFrom(initial: readonly { readonly weekday: number; readonly startTime: string; readonly endTime: string; readonly slotMinutes: number }[]): readonly RangeState[] {
  return initial.map((row) => ({
    id: crypto.randomUUID(),
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    slotMinutes: String(row.slotMinutes),
  }))
}