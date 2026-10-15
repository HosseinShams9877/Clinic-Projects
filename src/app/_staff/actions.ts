/**
 * The staff page's writers, as the manager panel renders them.
 *
 * ## Why the avatar lives on `User` and not on `Membership`
 *
 * A picture of a person is a fact about the person, not about their relationship
 * to a tenant: a visiting doctor who works at two tenants is one person with one
 * face, and a `Membership`-owned picture would make them two. The role and the
 * clinic scope are membership facts and stay on `Membership`; the avatar is a
 * user fact and lives here.
 *
 * ## Why the avatar write is separate from `updateStaffProfileAction`
 *
 * The profile write is two strings; the avatar write is bytes. Folding them would
 * make every display-name change carry the image's own body, and would put the
 * storage module's validation behind a parse that has nothing to do with it. The
 * two are separate because they are separate facts, and the profile modal calls
 * one when it changed one and the other when it changed the other.
 *
 * ## Why the previous file is removed after the write, not before
 *
 * The new file is written first, the user row is updated second, and the previous
 * file is removed third — the same order the services catalogue uses and for the
 * same reason: a removal that ran first would leave the staff member with no
 * picture at all if the write then failed.
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
  resetStaffPassword,
  updateMembershipPermissions,
  updateStaffProfile,
  recordAudit,
  AuditAction,
  AuditEntity,
} from '@/modules/staff'
import type { AuditDetail } from '@/modules/staff'
import { setDoctorWorkingHours, setDoctorShiftRanges } from '@/modules/appointments'
import { removeFile, storeFile, type StoredFile } from '@/modules/storage'

import { moduleFailureMessage } from '@/app/_shared/module-failure'
import { STAFF_PAGE } from '@/app/catalog'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

/** The staff page's own panel, which the manager column holds. */
const STAFF_PANEL: Panel = 'admin'

/** The answer every form reads: a done, or a sentence about why it was not done. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The answer an avatar upload reads, richer because the form shows the stored URL. */
export type UploadResult =
  | { readonly ok: true; readonly url: string; readonly backend: 'vercel-blob' | 'public'; readonly key: string }
  | { readonly ok: false; readonly message: string }

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

/** The edit form's fields, as the modal holds them. */
export interface StaffProfileInput {
  readonly membershipId: string
  readonly firstName: string
  readonly lastName: string
}

/** The reset form's fields, as the modal holds them. */
export interface StaffPasswordInput {
  readonly membershipId: string
  readonly password: string
}

/** The fields the avatar form sends, as the form holds them. */
export interface StaffAvatarInput {
  readonly filename: string
  readonly contentType: string
  readonly bytes: Uint8Array
  /**
   * The key of the avatar the form is replacing, if any. Present because a
   * replacement leaves the previous file behind unless its key is named, and the
   * form is the one place that knows what the previous value was.
   */
  readonly previousKey?: string
  readonly previousBackend?: 'vercel-blob' | 'public'
}

/** One action's own scope: the transaction and the caller's own context. */
interface ScopeArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}

/** The sentinel a block returns when it has nothing but a success to report. */
const SUCCESS = { succeeded: true } as const

/** The sentinel a block returns when the row it meant to write was not there. */
const FAILED = { succeeded: false } as const

/* ── The writes ────────────────────────────────────────────────────────────── */

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

/**
 * «ویرایش کارمند» — the manager's own write for a membership's display name.
 *
 * The write is the staff module's; this action is the panel's own thin wrapper, which
 * is the pattern every other writer on this page keeps. The mobile is not a field: it
 * is the person's identity (`user_tenant_mobile_key`), and a changed number is a
 * different person.
 */
export async function updateStaffProfileAction(
  input: StaffProfileInput,
): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    updateStaffProfile({
      tx,
      ctx,
      membershipId: input.membershipId,
      firstName: input.firstName,
      lastName: input.lastName,
    }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateStaff()
  return { ok: true }
}

/**
 * «تغییر رمز عبور» — the manager's own reset for a staff member who forgot theirs.
 *
 * The plaintext never leaves this call: the module hashes it through `auth`'s
 * `hashPassword` and writes only the hash. The audit row the module records names the
 * actor and the subject, not the password.
 */
export async function resetStaffPasswordAction(
  input: StaffPasswordInput,
): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    resetStaffPassword({
      tx,
      ctx,
      membershipId: input.membershipId,
      password: input.password,
    }).then(() => SUCCESS),
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

/* ── The avatar write ──────────────────────────────────────────────────────── */

/**
 * «عکس پزشک» — stores one avatar and records its URL on the user's row.
 *
 * ## Why the scope is resolved here and not passed in
 *
 * The `userId` the storage path is built from is the membership's own user, and a
 * caller that could pass a `userId` would be a caller that could write into
 * another tenant's user folder. The membership is resolved by the panel, and the
 * user row is found through it — the same resolution every other action on this
 * page takes.
 *
 * ## Why the write goes through `updateMany`
 *
 * The user row is matched on both its id and the caller's own tenant, so a
 * membership whose user is somehow not in this tenant writes nothing rather than
 * updating a stranger's row. A `count` of zero is then the "not found" answer the
 * form reads.
 */
export async function uploadStaffAvatarAction(
  membershipId: string,
  input: StaffAvatarInput,
): Promise<UploadResult> {
  const session = await resolveStaffPanel(STAFF_PANEL).catch(() => null)
  if (session === null) {
    return { ok: false, message: STAFF_PAGE.errors.sessionExpired }
  }

  // The membership is the owner the caller names; the user its row points at is
  // the owner the avatar belongs to. Both are read inside the scope so a
  // membership from another tenant cannot be resolved at all.
  const target = await runInTenantScope(session.permissions, prisma(), (tx) =>
    tx.membership.findFirst({
      where: { id: membershipId, tenantId: session.permissions.tenantId },
      select: { userId: true },
    }),
  ).catch(() => null)

  if (target === null) {
    return { ok: false, message: STAFF_PAGE.errors.staffNotFound }
  }

  let stored: StoredFile
  try {
    stored = await storeFile({
      scope: {
        tenantId: session.permissions.tenantId,
        clinicId: session.permissions.clinicId,
        userId: session.permissions.userId,
      },
      kind: 'staff',
      ownerId: target.userId,
      filename: input.filename,
      contentType: input.contentType,
      bytes: input.bytes,
    })
  } catch (error) {
    return { ok: false, message: moduleFailureMessage(error) }
  }

  const result = await inTenantScope(({ tx, ctx }) =>
    tx.user
      .updateMany({
        where: { id: target.userId, tenantId: ctx.tenantId },
        data: { avatarUrl: stored.url, avatarBackend: stored.backend, avatarKey: stored.key },
      })
      .then((written) => (written.count === 1 ? SUCCESS : FAILED)),
  )
  if (!('succeeded' in result)) {
    await removeFile({ key: stored.key, backend: stored.backend })
    return { ok: false, message: STAFF_PAGE.errors.staffNotFound }
  }

  if (input.previousKey !== undefined && input.previousBackend !== undefined) {
    await removeFile({ key: input.previousKey, backend: input.previousBackend })
  }

  revalidateStaff()
  return { ok: true, url: stored.url, backend: stored.backend, key: stored.key }
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