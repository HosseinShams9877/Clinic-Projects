/**
 * The staff list and the membership write path — DoDs 5, 6 and 7.
 *
 * ## Why the three guards run in this order
 *
 * `lib/book.ts` established the order for a booking and it is the order here:
 *
 * 1. `requirePermission(ctx, 'manage_users')` — a permission check that reads no row.
 *    A secretary probing ids learns nothing from the response.
 * 2. `assertNotSelfEdit` — the identity guard, immutable rule 9. Refused with a 403,
 *    because the caller *is* authorised and the refusal is about who is asking.
 * 3. `assertOverridesAllowed` — the manager-column lock, DoD 6. Refused with a domain
 *    error, because the caller is authorised and the shape of the tenant's staff is
 *    what the rule is about.
 * 4. `assertTenantKeepsRecoveryManager` — the tenant invariant, §2.3's third check,
 *    over the rows the transaction is about to commit.
 *
 * The last two both run inside the transaction, which is §2.3's own requirement: "A
 * database-level invariant check inside the same transaction refuses to commit a
 * tenant whose last active `MANAGER` would lose `manage_users` or
 * `manage_clinic_settings`."
 *
 * ## Why the audit row is written after the write and in the same transaction
 *
 * DoD 7 wants actor, target and the before/after set on every permission change, and
 * the row has to be part of the commit: a change that rolls back leaves no audit row,
 * so the trail can never show a permission the database does not have. Written after
 * the membership write because the `after` it records is the row that was written, and
 * reading the row back is how the audit stays honest about what it claims.
 *
 * ## Why `mobile` is the person's identity and not an editable field
 *
 * `user_tenant_mobile_key` makes the mobile the staff member, so a second row for the
 * same number is a write the database refuses and a changed number is a different
 * person. The update path does not take a mobile for the same reason `customers`'s
 * profile update does not (`lib/profile.ts`): the key is not a display field.
 *
 * ## Why the effect is already "on the next request" (DoD 5)
 *
 * A permission change takes effect server-side on the next request because the request
 * resolves its context from the membership row (`core/db/context.ts` →
 * `parsePermissionOverrides`), and this function is the one writer of that row. There
 * is no in-memory permission cache to invalidate and no session copy to patch: the
 * session holds a token and the token resolves to a membership, so the change is
 * visible the next time the cookie is read. The DoD is held by the resolution path and
 * this function, and not by a cache-bust this file has to remember to call.
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
  /** The membership id — the permission matrix's row keys on this. */
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly clinicId: string | null
  readonly isActive: boolean
  readonly overrides: PermissionOverrides
  /** Slugs in the stored row that are no longer permissions, for the operator. */
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
 *
 * The page renders one row per membership, and a person with two memberships in two
 * clinics of the tenant is two rows, because the role is a fact about the relationship
 * and not about the person (`03-data-model.md` §6).
 *
 * @throws PermissionError — the caller holds no `manage_users`.
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
 *
 * The mobile is the person (`user_tenant_mobile_key`), so a number the list already
 * holds is the existing membership and not a new one; the caller renders
 * `staff.mobileTaken` and links to the row. The role is one of the three the constants
 * close, and anything else is refused, because a fourth role is a permission set the
 * matrix does not have.
 *
 * `passwordHash` is hashed through `auth`'s `hashPassword` — the one writer outside
 * the login, and the reason the barrel exports it. An empty password is refused: a
 * staff row a person cannot log in with is a row the audit trail names and the
 * clinic's front desk cannot use.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws ValidationError — the mobile is not a mobile, the role is not one of the
 *   three, or no password was given.
 * @throws DomainError, as `staff.mobileTaken` — the mobile is already on the list.
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
 *
 * Takes the whole override set and not a delta, because the matrix is a grid of
 * checkboxes and the caller already holds the whole row; a delta would force the page
 * to track what was checked before it loaded. The set is validated, the two locks are
 * asserted, the tenant invariant is checked over the rows that are about to commit,
 * the row is written, and the audit row is written with the before/after (DoD 7).
 *
 * A `MANAGER` membership's revocations are refused before the write, which is DoD 6:
 * the change is refused server-side, by the module that owns the rule, and the attempt
 * is recorded as an audit row by the caller — the refusal and the record are two
 * facts, and the first does not imply the second was not tried.
 *
 * @throws PermissionError — the caller holds no `manage_users`, or the caller is the
 *   subject (immutable rule 9).
 * @throws NotFoundError — the membership is outside the caller's tenant.
 * @throws DomainError, as `permission.managerColumnLocked` — the subject is a manager
 *   and the change would remove a permission (DoD 6).
 * @throws DomainError, as `permission.lastManager` — the change would leave the tenant
 *   with no manager who can administer it.
 */
export async function updateMembershipPermissions(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly membershipId: string
  /** The whole granted set. Permissions not in it that the default grants are unaffected. */
  readonly granted: readonly string[]
  /** The whole revoked set. A non-empty one on a manager is refused (DoD 6). */
  readonly revoked: readonly string[]
}): Promise<StaffRow> {
  requireStaff(args.ctx)

  const membership = await loadMembership(args.tx, args.ctx, args.membershipId)
  assertNotSelfEdit(args.ctx, membership.userId as UserId)

  const before = membership.overrides
  const after = validateOverrides(args.granted, args.revoked)

  // DoD 6 — the manager column is locked, and the lock is asserted before the write.
  assertOverridesAllowed(membership.role as Role, after)

  // §2.3's third check, over the rows this transaction is about to commit.
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
 * «تغییر نقش» — the role column's own write, which the matrix renders as one of three.
 *
 * A role change replaces the overrides with nothing, because the overrides were
 * adjustments to a set the role no longer holds: a secretary's extra permission means
 * nothing on a doctor's default, and keeping the row's `revoked` list would silently
 * subtract from the new default. The before/after of both the role and the cleared
 * overrides is audited, so the trail shows what was lost.
 *
 * @throws PermissionError — the caller holds no `manage_users`, or the caller is the
 *   subject.
 * @throws NotFoundError — the membership is outside the caller's tenant.
 * @throws ValidationError — the role is not one of the three.
 * @throws DomainError, as `permission.lastManager` — the change would leave the tenant
 *   with no manager who can administer it.
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
 * «فعال کردن» — the membership's own switch, separate from the role and the
 * permissions because it is the one a desk uses most.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws NotFoundError — the membership is outside the caller's tenant.
 * @throws DomainError, as `staff.lastManager` — the caller is the tenant's last active
 *   manager and the tenant would be left with no one who can administer it.
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
 * «غیرفعال کردن» — a deactivated membership keeps its row and its overrides
 * (`04-roles-permissions.md`), because the audit trail still names the person and the
 * appointments still record them.
 *
 * The last active manager is refused: `tenantHasRecoveryManager` counts **active**
 * managers, so deactivating the last one is the change §2.3 prevents, and the refusal
 * is this module's own `staff.lastManager` rather than the matrix's because the
 * surface is the staff page and not the permission grid.
 *
 * @throws PermissionError — the caller holds no `manage_users`.
 * @throws NotFoundError — the membership is outside the caller's tenant.
 * @throws DomainError, as `staff.lastManager` — the tenant would be left with no
 *   manager who can administer it.
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

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** `manage_users` — the permission the matrix gives a manager for this surface. */
function requireStaff(ctx: TenantContext): void {
  requirePermission(ctx, 'manage_users')
}

/**
 * The tenant's memberships as the permission rules see them, with `membershipId`
 * replaced by the change the caller is about to commit.
 *
 * The replacement is what makes §2.3's check a check on the *result*: reading the rows
 * and then writing would race the write the check is about, so the change is applied
 * in the array the assertion reads. `overrides: null` on the stored row is the
 * ordinary "never edited" case, and parses to the empty set.
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
    // A slug that is not one of the sixteen is dropped rather than stored, for the same
    // reason `core/tenant/lib/overrides.ts` drops one on read: a permission that no
    // longer exists is nothing to grant, and storing it would be a row the next release
    // reads back as `unknown`.
    if (isMember(Permission, slug)) grantedSet.add(slug)
  }
  for (const slug of revoked) {
    if (isMember(Permission, slug)) {
      // A permission in both lists is a checkbox grid that sent a contradiction; the
      // revoked list loses, because withholding is the safe direction.
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
 * The overrides as the column stores them — a JSON string, on both engines
 * (`03-data-model.md` §5).
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
 *
 * @throws NotFoundError — the row is outside the caller's tenant, which is
 *   `09-security.md` §6.3's 404-not-403 rule.
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

/** A `ValidationError` carrying a catalog key, built once for the four raises. */
function staffValidationError(
  message: string,
  key: StaffMessageKey,
  params: AppErrorOptions['messageParams'],
): never {
  throw new ValidationError(message, { messageKey: key, messageParams: params })
}
