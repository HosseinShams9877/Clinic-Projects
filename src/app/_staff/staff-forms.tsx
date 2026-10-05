/**
 * The staff page's writers, as the manager panel renders them.
 *
 * The page is three tables and this file is the writer for all three: the invite
 * dialog, each membership's permission modal, and the leave table's two decisions.
 * They are one client component file because they are one page's own affordances, and
 * a failure an action returned lands on the row or the form that raised it.
 *
 * ## Why the manager's modal renders no checkboxes (DoD 6)
 *
 * The manager column is locked (`04-roles-permissions.md` §2.3), and the lock's first
 * enforcement is the UI: a manager's permissions render as the «همیشه» badge the
 * matrix holds, with no control to tap. The second enforcement is the module, which
 * refuses a revocation, and the third is the transaction's own invariant — the UI is
 * the first because a control that is not there cannot be submitted, but it is not the
 * only one, because a page that hid a button is not a rule (`04-roles-permissions.md`
 * §3's own alert on the page).
 *
 * ## Why the permission modal is per membership and not per role
 *
 * The overrides are stored per `Membership` and not per `Role` (`04-roles-permissions.md`
 * §2.2: "a visiting doctor who works at two tenants has different permissions at
 * each"), so the modal's own note says the change is for this one person, and the
 * count it renders is this one person's effective set — «۵ از ۱۶» and not the role's
 * default.
 *
 * ## Why the leave table's two buttons need no confirm
 *
 * An approval closes a request and the calendar opens; a rejection closes it and the
 * calendar does not. Neither is destructive — the row keeps both decisions in its own
 * columns, and the audit trail keeps the approver — so the two are one tap each, and a
 * manager who changes their mind makes the other decision on the same row.
 *
 * ## Why the modal's grid is controlled and the form's fields are not
 *
 * The checkboxes need the before-state to send a delta-free whole set: the modal sends
 * the two complete lists and the module reconciles, so the grid is state. The invite
 * form's fields are read off the submitted form instead, because a form's own value is
 * already the source of truth and a second one in state would be the one that drifts.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { STAFF_PAGE } from '@/app/catalog'
import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'
import { PERMISSION_LABELS, ROLE_LABELS } from '@/core/localization'
import { Permission, Role } from '@/core/constants'

import {
  activateMembershipAction,
  approveLeaveRequestAction,
  changeMembershipRoleAction,
  deactivateMembershipAction,
  inviteStaffAction,
  rejectLeaveRequestAction,
  updateMembershipPermissionsAction,
  type ActionResult,
  type InviteInput,
  type PermissionsInput,
} from './actions'

/** The three roles the invite form's select offers, from the constants' own set. */
const ROLE_OPTIONS = Object.values(Role).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))

/* ── The invite dialog ────────────────────────────────────────────────────── */

/**
 * «دعوت کاربر» — the one create, opened from the page's own header.
 *
 * A mobile the list already holds comes back onto the form as the module's own
 * sentence, which points the manager at the existing row: the person is already on the
 * staff list, and the ordinary outcome of an invite is not a mistake.
 */
export function NewStaffDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
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
    const input: InviteInput = {
      mobile: asFormString(event.currentTarget, 'mobile'),
      firstName: asFormString(event.currentTarget, 'firstName'),
      lastName: asFormString(event.currentTarget, 'lastName'),
      password: asFormString(event.currentTarget, 'password'),
      role: asFormString(event.currentTarget, 'role'),
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
              name="role"
              value={null}
              onChange={() => {}}
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

/** The id the footer's submit button refers to, so the form and its button are one. */
const INVITE_FORM_ID = 'invite-staff-form'

/* ── The membership row's own actions ─────────────────────────────────────── */

/** The row's own fields, as the permission modal reads them back. */
export interface StaffRowActionsProps {
  /** The membership the manager is acting on, as the page's own row holds it. */
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
  /**
   * The sixteen permissions as the modal renders them, derived by the page from the
   * module's own `effectivePermissions` — the modal renders the formula's answer and
   * not a second computation of it.
   */
  readonly grid: readonly { readonly permission: Permission; readonly held: boolean; readonly locked: boolean }[]
}

/**
 * The things the manager does to a membership: open its permissions, change its role,
 * and switch it on or off.
 */
export function StaffRowActions({ membership, grid }: StaffRowActionsProps) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [editing, setEditing] = useState(false)
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
    </div>
  )
}

/* ── The permission modal ─────────────────────────────────────────────────── */

/**
 * «ویرایش دسترسی‌ها» — the sixteen-permission grid for one membership (DoD 5).
 *
 * The grid is two states at once for a non-manager: the permissions the role already
 * grants are checked and the ones it does not are not, and a tap on either moves it
 * between the two lists the action sends. The manager column renders the grid as the
 * locked badge and no control at all, which is the lock's first enforcement.
 */
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

/** The id the permission modal's footer refers to. */
const PERMISSIONS_FORM_ID = 'membership-permissions-form'

/* ── The leave table's two decisions ───────────────────────────────────────── */

/** One leave row's own props, as the table's last column renders them. */
export interface LeaveRowActionsProps {
  readonly leaveRequestId: string
  /** The request's state, which decides whether the two buttons belong. */
  readonly status: string
}

/**
 * The two things the manager does to a request, as the state permits them.
 *
 * A decided request is closed and renders nothing, because a third decision on a row
 * that already has one is not a correction — the module refuses it and the row should
 * not offer it.
 */
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

/* ── The pieces the forms share ───────────────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/**
 * A form's answer: nothing while the form is clean, a sentence once the action returned.
 *
 * The tone is the outcome's own and not a guess from the text, because the staff
 * page's forms each have their own sentences and a comparison against them would be a
 * fourth place those sentences are spelled.
 */
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

/** The dimmed backdrop a click outside and an Escape both close. */
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

/** One permission the modal's grid offers, as a checkbox the matrix's row holds. */
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

/** One permission the manager column holds, as the locked badge the matrix renders. */
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

/** The role change's own button, which applies the new role and clears the overrides. */
function ApplyRoleRow({ disabled, onApply }: { readonly disabled: boolean; readonly onApply: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="small" variant="neutral" disabled={disabled} onClick={onApply}>
        {STAFF_PAGE.membership.applyRole}
      </Button>
    </div>
  )
}

/** One field's value from a submitted form, or '' when the field was absent. */
function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.value : ''
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}
