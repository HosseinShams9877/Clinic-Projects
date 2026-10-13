/**
 * The staff list and the membership write path — DoDs 5, 6 and 7.
 *
 * ## Why the three guards run in this order
 *
 * `lib/book.ts` established the order for a booking and it is the order here:
 *
 * 1. `requirePermission(ctx, 'manage_users')` — a permission check that reads no row.
 * 2. `assertNotSelfEdit` — the identity guard, immutable rule 9.
 * 3. `assertOverridesAllowed` — the manager-column lock, DoD 6.
 * 4. `assertTenantKeepsRecoveryManager` — the tenant invariant, §2.3's third check.
 */

import { Permission, Role, isMember } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { isValidMobile, normalizeMobile } from '@/core/localization'
import {
  DomainError,
  NotFoundError,
  ValidationError,
  type AppErrorOptions,
} from '@/core/types'
import {
  assertNotSelfEdit,
  assertOverridesAllowed,
  assertTenantKeepsRecoveryManager,
  requirePermission,
  tenantHasRecoveryManager,
} from '@/modules/roles-permissions'
import { EMPTY_PERMISSION_OVERRIDES, parsePermissionOverrides } from '@/core/tenant'
import type { PermissionOverrides } from '@/core/tenant'
import { hashPassword } from '@/modules/auth'
import type { UserId } from '@/core/types'

import type { StaffMessageKey } from '../catalog'
import {
  AuditAction,
  AuditEntity,
  recordAudit,
  type AuditDetail,
  type PermissionDiff,
} from './audit'

/** The shortest password the reset form accepts. */
const MIN_PASSWORD_LENGTH = 8

/** The columns the staff page renders. */
const STAFF_SELECT = {
  id: true,
  userId: true,
  role: true,
  clinicId: true,
  isActive: true,
  overrides: true,
  user: { select: { id: true, mobile: true, firstName: true, lastName: true, isActive: true } },
} as const

/** One staff row, as the page renders it. */
export interface StaffRow {
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly clinicId: string | null
  readonly isActive: boolean
  readonly overrides: PermissionOverrides
  readonly unknownOverrides: readonly string[]
  readonly user: {
    readonly id: string
    readonly mobile: string
    readonly firstName: string
    readonly lastName: string
    readonly isActive: boolean
  }
}

/**
 * «فهرست کارکنان» — the tenant's staff, managers first.
 */
export async function listStaff(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly StaffRow[]> {
  requireStaff(args.ctx)

  const rows = await args.tx.membership.findMany({
    where: { tenantId: args.ctx.tenantId },
    orderBy: [{ role: 'asc' }, { user: { firstName: 'asc' } }],
    select: STAFF_SELECT,
  })

  return rows.map(asStaffRow)
}

/**
 * «دعوت کاربر» — the one create, which makes a person and their membership together.
 */
export async function inviteStaff(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly mobile: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly role: string
  readonly clinicId?: string
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  const mobile = normalizeMobile(args.mobile)
  if (!isValidMobile(mobile)) {
    throw staffValidationError(
      `The value ${JSON.stringify(args.mobile)} is not a valid mobile number.`,
      'staff.mobileInvalid',
      {},
    )
  }
  if (!isMember(Role, args.role)) {
    throw staffValidationError(
      `The value ${JSON.stringify(args.role)} is not one of the three roles.`,
      'staff.roleInvalid',
      {},
    )
  }
  if (args.password.length === 0) {
    throw staffValidationError('A staff member needs a password to log in with.', 'staff.passwordRequired', {})
  }

  const existing = await args.tx.user.findUnique({
    where: { tenantId_mobile: { tenantId: args.ctx.tenantId, mobile } },
    select: { id: true },
  })
  if (existing !== null) {
    throw new DomainError(`User ${mobile} is already on this tenant's staff list.`, {
      messageKey: 'staff.mobileTaken' satisfies StaffMessageKey,
      detail: { tenantId: args.ctx.tenantId },
    })
  }

  const firstName = args.firstName.trim()
  const lastName = args.lastName.trim()
  if (firstName === '') {
    throw staffValidationError('A staff member needs a name.', 'staff.nameRequired', {})
  }

  const user = await args.tx.user.create({
    data: {
      tenantId: args.ctx.tenantId,
      mobile,
      firstName,
      lastName,
      passwordHash: await hashPassword(args.password),
      memberships: {
        create: {
          tenantId: args.ctx.tenantId,
          role: args.role,
          clinicId: args.clinicId ?? null,
        },
      },
    },
    select: { id: true },
  })

  const membership = await args.tx.membership.findFirstOrThrow({
    where: { tenantId: args.ctx.tenantId, userId: user.id },
    select: STAFF_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.StaffInvited,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: {
      membershipId: membership.id,
      subjectUserId: user.id,
      role: args.role,
      mobile,
      name: `${firstName} ${lastName}`,
    },
  })

  return asStaffRow(membership)
}

/**
 * «ویرایش دسترسی‌ها» — the permission matrix's own write (DoD 5, DoD 6, DoD 7).
 */
export async function updateMembershipPermissions(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
  readonly granted: readonly string[]
  readonly revoked: readonly string[]
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)
  assertNotSelfEdit(args.ctx, membership.userId as UserId)

  const before = membership.overrides
  const after = validateOverrides(args.granted, args.revoked)

  assertOverridesAllowed(membership.role as Role, after)

  assertTenantKeepsRecoveryManager(
    await snapshotsAfter(args.tx, args.ctx, args.membershipId, membership.role, after),
  )

  const updated = await args.tx.membership.update({
    where: { id: membership.id },
    data: { overrides: serializeOverrides(after) },
    select: STAFF_SELECT,
  })

  const diff: PermissionDiff = {
    role: membership.role,
    granted: { before: before.granted, after: after.granted },
    revoked: { before: before.revoked, after: after.revoked },
  }

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.MembershipPermissionChanged,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: {
      membershipId: membership.id,
      subjectUserId: membership.userId,
      permissions: diff,
    } satisfies AuditDetail,
  })

  return asStaffRow(updated)
}

/**
 * «تغییر نقش» — the role column's own write.
 */
export async function changeMembershipRole(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
  readonly role: string
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  if (!isMember(Role, args.role)) {
    throw staffValidationError(
      `The value ${JSON.stringify(args.role)} is not one of the three roles.`,
      'staff.roleInvalid',
      {},
    )
  }

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)
  assertNotSelfEdit(args.ctx, membership.userId as UserId)

  const after = EMPTY_PERMISSION_OVERRIDES
  assertTenantKeepsRecoveryManager(
    await snapshotsAfter(args.tx, args.ctx, args.membershipId, args.role, after),
  )

  const updated = await args.tx.membership.update({
    where: { id: membership.id },
    data: { role: args.role, overrides: null },
    select: STAFF_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.MembershipRoleChanged,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: {
      membershipId: membership.id,
      subjectUserId: membership.userId,
      role: { before: membership.role, after: args.role },
      permissions: {
        role: membership.role,
        granted: { before: membership.overrides.granted, after: [] },
        revoked: { before: membership.overrides.revoked, after: [] },
      },
    } satisfies AuditDetail,
  })

  return asStaffRow(updated)
}

/**
 * «فعال کردن» — the membership's own switch.
 */
export async function activateMembership(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)
  const updated = await args.tx.membership.update({
    where: { id: membership.id },
    data: { isActive: true },
    select: STAFF_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.MembershipActivated,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: { membershipId: membership.id, subjectUserId: membership.userId } satisfies AuditDetail,
  })

  return asStaffRow(updated)
}

/**
 * «غیرفعال کردن» — a deactivated membership keeps its row and its overrides.
 */
export async function deactivateMembership(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)

  const after = await snapshotsAfter(
    args.tx,
    args.ctx,
    args.membershipId,
    membership.role,
    membership.overrides,
    false,
  )
  if (!tenantHasRecoveryManager(after)) {
    throw new DomainError('Deactivating this membership would leave the tenant with no manager.', {
      messageKey: 'staff.lastManager' satisfies StaffMessageKey,
      detail: { membershipId: membership.id, subjectUserId: membership.userId },
    })
  }

  const updated = await args.tx.membership.update({
    where: { id: membership.id },
    data: { isActive: false },
    select: STAFF_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.MembershipDeactivated,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: { membershipId: membership.id, subjectUserId: membership.userId } satisfies AuditDetail,
  })

  return asStaffRow(updated)
}

/**
 * «ویرایش کارمند» — the membership's own name, as the manager panel writes it.
 *
 * The mobile is the person's identity (`user_tenant_mobile_key`), so this write
 * does not take one: a changed mobile is a different person, and a second row for
 * the same number is a write the database refuses. The two names are display
 * fields and are the only thing this surface edits.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws NotFoundError — the membership is outside the caller's tenant.
 * @throws ValidationError — the first name is empty.
 */
export async function updateStaffProfile(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
  readonly firstName: string
  readonly lastName: string
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)
  const firstName = args.firstName.trim()
  const lastName = args.lastName.trim()
  if (firstName === '') {
    throw staffValidationError('A staff member needs a name.', 'staff.nameRequired', {})
  }

  await args.tx.user.update({
    where: { id: membership.userId },
    data: { firstName, lastName },
  })

  const updated = await args.tx.membership.findFirstOrThrow({
    where: { id: membership.id, tenantId: args.ctx.tenantId },
    select: STAFF_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.MembershipUpdated,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: {
      membershipId: membership.id,
      subjectUserId: membership.userId,
      name: { firstName, lastName },
    } satisfies AuditDetail,
  })

  return asStaffRow(updated)
}

/**
 * «تغییر رمز عبور» — the manager's own reset for a staff member who forgot theirs.
 *
 * The hash is written through `auth`'s `hashPassword`, which is the one writer
 * outside the login. The plaintext never touches the database and is never logged;
 * the audit row records that the password was changed and by whom, not what it was.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws NotFoundError — the membership is outside the caller's tenant.
 * @throws ValidationError — the password is shorter than the minimum.
 */
export async function resetStaffPassword(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
  readonly password: string
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  if (args.password.length < MIN_PASSWORD_LENGTH) {
    throw staffValidationError(
      `The password is shorter than ${MIN_PASSWORD_LENGTH} characters.`,
      'staff.passwordTooShort',
      { min: String(MIN_PASSWORD_LENGTH) },
    )
  }

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)

  await args.tx.user.update({
    where: { id: membership.userId },
    data: { passwordHash: await hashPassword(args.password) },
  })

  const updated = await args.tx.membership.findFirstOrThrow({
    where: { id: membership.id, tenantId: args.ctx.tenantId },
    select: STAFF_SELECT,
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.MembershipPasswordReset,
    entity: AuditEntity.Membership,
    entityId: membership.id,
    detail: {
      membershipId: membership.id,
      subjectUserId: membership.userId,
    } satisfies AuditDetail,
  })

  return asStaffRow(updated)
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** `manage_users` — the permission the matrix gives a manager for this surface. */
function requireStaff(ctx: TenantContext): void {
  requirePermission(ctx, 'manage_users')
}

/**
 * The tenant's memberships as the permission rules see them, with `membershipId`
 * replaced by the change the caller is about to commit.
 */
async function snapshotsAfter(
  tx: TransactionClient,
  ctx: TenantContext,
  membershipId: string,
  role: string,
  overrides: PermissionOverrides,
  active = true,
): Promise<readonly { readonly role: Role; readonly overrides: PermissionOverrides; readonly active: boolean }[]> {
  const rows = await tx.membership.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, role: true, overrides: true, isActive: true },
  })

  return rows.map((row) =>
    row.id === membershipId
      ? { role: role as Role, overrides, active }
      : {
          role: row.role as Role,
          overrides: parsePermissionOverrides(row.overrides).overrides,
          active: row.isActive,
        },
  )
}

/** The override set the caller sent, as the two closed arrays the column stores. */
function validateOverrides(
  granted: readonly string[],
  revoked: readonly string[],
): PermissionOverrides {
  const grantedSet = new Set<Permission>()
  const revokedSet = new Set<Permission>()
  for (const slug of granted) {
    if (isMember(Permission, slug)) grantedSet.add(slug)
  }
  for (const slug of revoked) {
    if (isMember(Permission, slug)) {
      grantedSet.delete(slug)
      revokedSet.add(slug)
    }
  }
  return {
    granted: [...grantedSet],
    revoked: [...revokedSet],
  }
}

/**
 * The overrides as the column stores them — a JSON string, on both engines.
 */
function serializeOverrides(overrides: PermissionOverrides): string {
  return JSON.stringify({ granted: overrides.granted, revoked: overrides.revoked })
}

/** One row as the staff page's own shape. */
function asStaffRow(row: StaffSelectRow): StaffRow {
  const parsed = parsePermissionOverrides(row.overrides)
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    clinicId: row.clinicId,
    isActive: row.isActive,
    overrides: parsed.overrides,
    unknownOverrides: parsed.unknown,
    user: {
      id: row.user.id,
      mobile: row.user.mobile,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      isActive: row.user.isActive,
    },
  }
}

/** The shape Prisma hands back from `STAFF_SELECT`. */
type StaffSelectRow = {
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly clinicId: string | null
  readonly isActive: boolean
  readonly overrides: string | null
  readonly user: {
    readonly id: string
    readonly mobile: string
    readonly firstName: string
    readonly lastName: string
    readonly isActive: boolean
  }
}

/**
 * Loads one membership as the caller's tenant sees it, with its overrides parsed.
 */
async function loadMembership(
  tx: TransactionClient,
  ctx: TenantContext,
  membershipId: string,
): Promise<{
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly overrides: PermissionOverrides
}> {
  const row = await tx.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenantId },
    select: { id: true, userId: true, role: true, overrides: true },
  })
  if (row === null) {
    throw new NotFoundError(`Membership ${membershipId} was not found in this tenant.`, {
      messageKey: 'staff.notFound' satisfies StaffMessageKey,
      detail: { membershipId },
    })
  }
  return { ...row, overrides: parsePermissionOverrides(row.overrides).overrides }
}

/** A `ValidationError` carrying a catalog key, built once for the raises. */
function staffValidationError(
  message: string,
  key: StaffMessageKey,
  params: AppErrorOptions['messageParams'],
): never {
  throw new ValidationError(message, { messageKey: key, messageParams: params })
}