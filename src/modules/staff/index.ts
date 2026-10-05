/**
 * The `staff` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — `@/modules/*​/*`
 * is a banned specifier — so a file that is not listed below does not exist as far as
 * the rest of the repository is concerned.
 *
 * ## What is deliberately not here
 *
 * A delete. A deactivated membership keeps its row, its role and its overrides
 * (`04-roles-permissions.md`), because the audit trail still names the person, the
 * appointments they recorded still record them, and a rule that ignored the status
 * would count a disabled manager as cover for a tenant that has none. The staff page's
 * switch is `isActive`, and `deactivateMembership` is the one writer of it.
 *
 * `hashPassword` is imported from `auth` and is *not* re-exported. The auth barrel's
 * own header names this module as the second of the two writers of a password hash;
 * re-exporting it here would give a third caller a way to choose its own storage rule,
 * and the one place the Argon2id parameters live is the one place the verification
 * reads them back.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because
 * the caller opened the scope; the models are the storage, not the surface.
 */

export type {
  AuditDetail,
  AuditDiff,
  AuditRow,
  LeaveRow,
  PermissionDiff,
  StaffMessageKey,
  StaffRow,
} from './types'
export type { StaffModule } from './types'

export { LEAVE_STATUS_LABELS, MESSAGES } from './catalog'

export { AuditAction, AuditEntity, recordAudit, recentAudit } from './lib/audit'

export {
  activateMembership,
  changeMembershipRole,
  deactivateMembership,
  inviteStaff,
  listStaff,
  updateMembershipPermissions,
} from './lib/memberships'

export {
  approveLeaveRequest,
  listLeaveRequests,
  rejectLeaveRequest,
  requestLeave,
} from './lib/leave'
