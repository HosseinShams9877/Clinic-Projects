/**
 * The staff page's seven writers, as the manager panel renders them.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import { realClock } from '@/core/lib/clock'
import { isAppError } from '@/core/types'
import { Permission, isMember } from '@/core/constants'
import {
  activateMembership,
  approveLeaveRequest,
  changeMembershipRole,
  deactivateMembership,
  inviteStaff,
  rejectLeaveRequest,
  updateMembershipPermissions,
  recordAudit,
  AuditAction,
  AuditEntity,
} from '@/modules/staff'
import type { AuditDetail } from '@/modules/staff'
import { setDoctorWorkingHours, setDoctorShiftRanges } from '@/modules/appointments'

import { moduleFailureMessage } from '@/app/_shared/module-failure'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

/** The staff page's own panel, which the manager column holds. */
const STAFF_PANEL: Panel = 'admin'

/** The answer every form reads: a done, or a sentence about why it was not done. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The invite form's fields, as the form holds them. */
export interface InviteInput {
  readonly mobile: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly role: string
}

/** The permission modal's checkbox grid, as the two lists the column stores. */
export interface PermissionsInput {
  readonly granted: readonly string[]
  readonly revoked: readonly string[]
}

/** One action's own scope: the transaction and the caller's own context. */
interface ScopeArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}

/** The sentinel a block returns when it has nothing but a success to report. */
const SUCCESS = { succeeded: true } as const

/* ── The seven writes ──────────────────────────────────────────────────────── */

export async function inviteStaffAction(input: InviteInput): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    inviteStaff({
      tx,
      ctx,
      mobile: input.mobile,
      firstName: input.firstName,
      lastName: input.lastName,
      password: input.password,
      role: input.role,
    }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

export async function updateMembershipPermissionsAction(
  membershipId: string,
  input: PermissionsInput,
): Promise<ActionResult> {
  const session = await resolveStaffPanel(STAFF_PANEL)
  const [granted, revoked] = asPermissions(input)

  const result = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    try {
      await updateMembershipPermissions({
        tx,
        ctx: session.permissions,
        membershipId,
        granted,
        revoked,
      })
      return SUCCESS
    } catch (error: unknown) {
      if (isManagerColumnRefusal(error)) {
        await recordAudit({
          tx,
          ctx: session.permissions,
          action: AuditAction.MembershipPermissionRefused,
          entity: AuditEntity.Membership,
          entityId: membershipId,
          detail: {
            membershipId,
            attempted: { granted, revoked },
            refused: true,
          } satisfies AuditDetail,
        })
      }
      return { ok: false as const, message: moduleFailureMessage(error) }
    }
  })

  if ('succeeded' in result) {
    revalidateStaff()
    return { ok: true }
  }
  return result
}

export async function changeMembershipRoleAction(
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    changeMembershipRole({ tx, ctx, membershipId, role }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

export async function activateMembershipAction(membershipId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    activateMembership({ tx, ctx, membershipId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

export async function deactivateMembershipAction(membershipId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    deactivateMembership({ tx, ctx, membershipId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

export async function approveLeaveRequestAction(leaveRequestId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    approveLeaveRequest({ tx, ctx, leaveRequestId, now: realClock() }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

export async function rejectLeaveRequestAction(leaveRequestId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    rejectLeaveRequest({ tx, ctx, leaveRequestId, now: realClock() }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/** One weekday's window the «ساعت کاری» form submits, with the doctor's own ranges. */
export interface WorkingHoursInput {
  readonly doctorId: string
  readonly days: readonly {
    readonly weekday: number
    readonly startTime: string
    readonly endTime: string
  }[]
  readonly ranges: readonly {
    readonly weekday: number
    readonly startTime: string
    readonly endTime: string
    readonly slotMinutes: number
  }[]
}

/**
 * «ساعت کاری» — replaces a doctor's weekly working hours AND their shift ranges.
 *
 * The write is the appointments module's, because that module owns the
 * `DoctorWorkingHours` and `DoctorShiftRange` tables; the staff page composes it
 * here. Both writes run in the same transaction so a form that saved one and not
 * the other is not a state the module can reach.
 */
export async function setDoctorShiftRangesAction(input: WorkingHoursInput): Promise<ActionResult> {
  const result = await inTenantScope(async ({ tx, ctx }) => {
    await setDoctorWorkingHours({ tx, ctx, doctorId: input.doctorId, rows: input.days })
    await setDoctorShiftRanges({ tx, ctx, doctorId: input.doctorId, rows: input.ranges })
    return SUCCESS
  })
  if (!('succeeded' in result)) return result
  revalidateStaff()
  revalidatePath('/admin/appointments')
  revalidatePath('/reception/appointments')
  revalidatePath('/doctor')
  return { ok: true }
}

/* ── The scope every action runs in ────────────────────────────────────────── */

async function inTenantScope<T>(
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(STAFF_PANEL)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions }),
  ).catch((error: unknown) => ({ ok: false as const, message: moduleFailureMessage(error) }))
}

/** The staff page and the two surfaces a membership change reaches. */
function revalidateStaff(): void {
  revalidatePath('/admin/staff')
  revalidatePath('/reception/appointments')
}

function asPermissions(input: PermissionsInput): [readonly string[], readonly string[]] {
  const granted = input.granted.filter((slug) => isMember(Permission, slug))
  const revoked = input.revoked.filter((slug) => isMember(Permission, slug))
  return [granted, revoked]
}

function isManagerColumnRefusal(error: unknown): boolean {
  return isAppError(error) && error.messageKey === 'permission.managerColumnLocked'
}