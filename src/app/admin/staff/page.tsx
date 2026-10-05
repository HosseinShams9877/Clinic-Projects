/**
 * The staff page — `02-architecture.md` §9's `admin/staff.html`.
 *
 * The manager panel's own people surface, in three tables: the staff list with each
 * membership's role and status, the audit trail of every access change, and the
 * doctors' leave requests. It is the one page in the product that holds
 * `manage_users`, and the two modules it composes are the two that own what it renders
 * — `staff` for the rows and `roles-permissions` for the matrix's own rules.
 *
 * ## Why the page renders the 16×3 matrix as a read (DoD 5, DoD 6)
 *
 * `04-roles-permissions.md` §2's matrix is a table of three columns and sixteen rows,
 * and the manager column is «همیشه» on every one of them. The page renders it as the
 * reference it is — the three columns are the role defaults, which no surface edits,
 * and the manager column's badge is the lock's first enforcement. What the page *edits*
 * is a membership's own overrides, in the modal the row opens (`04-roles-permissions.md`
 * §2.2), because the overrides are stored per membership and not per role.
 *
 * ## Why the audit trail is on the same page as the matrix (DoD 7)
 *
 * A permission change and the record of it are one surface's two halves: the manager
 * who changes a permission sees the row that records it without leaving the page, and
 * the row carries the actor, the target and the before/after set. The trail is the
 * twenty newest, because a trail is a list and not a page, and the older rows are the
 * operator's report and not the manager's.
 *
 * ## Why the leave table is here and not on a doctor's own page
 *
 * §6 puts the leave on the staff page and gives it three states: a doctor requests, a
 * manager approves or rejects. The approval is the manager's, so the table is here; a
 * doctor's own request surface is a later phase, and the two halves of the state
 * machine are one table in one module either way.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { LeaveRequestStatus, PERMISSIONS, Role, isMember } from '@/core/constants'
import {
  PERMISSION_LABELS,
  ROLE_LABELS,
  dateToLocalDate,
  formatDate,
  type LocalDate,
} from '@/core/localization'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { STAFF_PAGE } from '@/app/catalog'
import {
  loadStaffPage,
  permissionGrid,
  type StaffPageData,
} from '@/app/_staff/page-data'
import {
  LeaveRowActions,
  NewStaffDialog,
  StaffRowActions,
} from '@/app/_staff/staff-forms'
import { requireStaffPanel } from '@/app/_shell/session'
import { ROLE_DEFAULTS } from '@/modules/roles-permissions'
import { LEAVE_STATUS_LABELS } from '@/modules/staff'

export const metadata: Metadata = { title: STAFF_PAGE.title }

/** The three tables, read in one transaction. */
export default async function StaffPage() {
  const session = await requireStaffPanel('admin')

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadStaffPage({ tx, ctx: session.permissions }),
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 panel:flex-row panel:items-end panel:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-ink">{STAFF_PAGE.title}</h1>
          <p className="text-sm text-ink-2">{STAFF_PAGE.lead}</p>
        </div>
        <NewStaffDialog />
      </div>

      <RoleMatrix />

      <StaffList data={data} />

      <LeaveTable data={data} />

      <AuditTrail data={data} />
    </div>
  )
}

/* ── The 16×3 matrix, as the reference table the page renders it as ────────── */

/**
 * The three role defaults over the sixteen permissions, as the spec's own matrix
 * renders them (`04-roles-permissions.md` §2).
 *
 * The manager column is the locked badge on all sixteen, the doctor and secretary
 * columns are the tick the default grants. Nothing here is a control, because the
 * defaults are the matrix's reference and the edits are a membership's own modal.
 */
function RoleMatrix() {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-bold text-ink">{STAFF_PAGE.matrix.title}</h2>
      <p className="text-sm text-ink-2">{STAFF_PAGE.matrix.lead}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{STAFF_PAGE.matrix.title}</caption>
          <thead>
            <tr className="border-b border-line text-ink-3">
              <Th>{STAFF_PAGE.columns.permissions}</Th>
              {Object.values(Role).map((role) => (
                <Th key={role} className="text-center">
                  {ROLE_LABELS[role]}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_LABELS_MATRIX.map((row) => (
              <tr key={row.permission} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 font-semibold text-ink">{row.label}</td>
                {row.manager ? (
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex rounded-pill bg-neutral-bg px-2 py-1 text-xs font-semibold text-ink-3">
                      {STAFF_PAGE.matrix.managerLocked}
                    </span>
                  </td>
                ) : (
                  <td className="px-3 py-2 text-center text-ink-3">—</td>
                )}
                <td className="px-3 py-2 text-center">{row.doctor ? <Tick /> : <Dash />}</td>
                <td className="px-3 py-2 text-center">{row.secretary ? <Tick /> : <Dash />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3">{STAFF_PAGE.matrix.hint}</p>
    </section>
  )
}

/** The two non-manager defaults, read from the module that owns them. */
const DOCTOR_DEFAULTS = new Set(ROLE_DEFAULTS[Role.Doctor])
const SECRETARY_DEFAULTS = new Set(ROLE_DEFAULTS[Role.Secretary])

/**
 * The matrix's own sixteen rows, derived from the role defaults the module owns.
 *
 * The defaults are read from `ROLE_DEFAULTS` through the module's barrel, so the table
 * the manager reads and the `can()` the server reads are the same source; the page
 * never restates which permission a role holds.
 */
const PERMISSION_LABELS_MATRIX: readonly {
  readonly permission: string
  readonly label: string
  readonly manager: boolean
  readonly doctor: boolean
  readonly secretary: boolean
}[] = PERMISSIONS.map((permission) => ({
  permission,
  label: PERMISSION_LABELS[permission],
  manager: true,
  doctor: DOCTOR_DEFAULTS.has(permission),
  secretary: SECRETARY_DEFAULTS.has(permission),
}))

/* ── The staff list ───────────────────────────────────────────────────────── */

/** The tenant's memberships, as the page's own table renders them. */
function StaffList({ data }: { readonly data: StaffPageData }) {
  if (data.staff.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        {STAFF_PAGE.empty}
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-ink">{STAFF_PAGE.columns.name}</h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{STAFF_PAGE.title}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-ink-3">
              <Th>{STAFF_PAGE.columns.name}</Th>
              <Th>{STAFF_PAGE.columns.mobile}</Th>
              <Th>{STAFF_PAGE.columns.role}</Th>
              <Th>{STAFF_PAGE.columns.status}</Th>
              <Th>{STAFF_PAGE.columns.actions}</Th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((row) => (
              <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                <td className="px-4 py-3 font-semibold text-ink">{staffName(row)}</td>
                <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
                  {row.user.mobile}
                </td>
                <td className="px-4 py-3 text-ink-2">{roleLabel(row.role)}</td>
                <td className="px-4 py-3">
                  <ActiveBadge active={row.isActive} />
                </td>
                <td className="px-4 py-3">
                  <StaffRowActions membership={row} grid={permissionGrid(row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ── The leave table ──────────────────────────────────────────────────────── */

/** The doctors' leave requests, as the page's own second table renders them. */
function LeaveTable({ data }: { readonly data: StaffPageData }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-ink">{STAFF_PAGE.membership.leaveTitle}</h2>
      {data.leaveRequests.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {STAFF_PAGE.membership.leaveEmpty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{STAFF_PAGE.membership.leaveTitle}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3">
                <Th>{STAFF_PAGE.columns.name}</Th>
                <Th>{STAFF_PAGE.membership.leaveFrom}</Th>
                <Th>{STAFF_PAGE.membership.leaveTo}</Th>
                <Th>{STAFF_PAGE.membership.leaveStatus}</Th>
                <Th>{STAFF_PAGE.membership.leaveApprover}</Th>
                <Th>{STAFF_PAGE.columns.actions}</Th>
              </tr>
            </thead>
            <tbody>
              {data.leaveRequests.map((row) => (
                <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ink">{row.doctorName ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums">
                    {formatDate(dateToLocalDate(row.startDate) as LocalDate, 'short')}
                  </td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums">
                    {formatDate(dateToLocalDate(row.endDate) as LocalDate, 'short')}
                  </td>
                  <td className="px-4 py-3">
                    <LeaveStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-2">{row.approverName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <LeaveRowActions leaveRequestId={row.id} status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}


/* ── The audit trail ──────────────────────────────────────────────────────── */

/** The twenty newest access changes, as the page's own third table renders them. */
function AuditTrail({ data }: { readonly data: StaffPageData }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-ink">{STAFF_PAGE.audit.title}</h2>
      {data.audit.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {STAFF_PAGE.audit.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{STAFF_PAGE.audit.title}</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3">
                <Th>{STAFF_PAGE.audit.at}</Th>
                <Th>{STAFF_PAGE.audit.actor}</Th>
                <Th>{STAFF_PAGE.audit.action}</Th>
                <Th>{STAFF_PAGE.audit.detail}</Th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((row) => (
                <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-3 text-ink-2 tabular-nums">
                    {formatDate(dateToLocalDate(row.at) as LocalDate, 'long')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{row.actorName ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
                    {row.action}
                  </td>
                  <td className="px-4 py-3 text-ink-2" dir="ltr">
                    <AuditDetail detail={row.detail} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * One audit row's detail, as the compact JSON the operator reads.
 *
 * The column holds the before/after sets (DoD 7) and the trail is an operator's
 * surface, so the detail renders as the JSON it is rather than as a sentence the page
 * would have to keep in step with every action key.
 */
function AuditDetail({ detail }: { readonly detail: unknown }) {
  if (detail === null || detail === undefined) return <span className="text-ink-3">—</span>
  return <code className="text-xs text-ink-2">{JSON.stringify(detail)}</code>
}

/* ── The page's own small pieces ───────────────────────────────────────────── */

/** One membership's two states, as the badge the status column renders. */
function ActiveBadge({ active }: { readonly active: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        active ? 'bg-ok-bg text-ok' : 'bg-neutral-bg text-ink-3',
      )}
    >
      {active ? STAFF_PAGE.membership.active : STAFF_PAGE.membership.inactive}
    </span>
  )
}

/** One leave state, as the badge the leave table renders. */
function LeaveStatusBadge({ status }: { readonly status: string }) {
  if (!isMember(LeaveRequestStatus, status)) return <span className="text-ink-3">—</span>
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        status === LeaveRequestStatus.Approved
          ? 'bg-ok-bg text-ok'
          : status === LeaveRequestStatus.Rejected
            ? 'bg-neutral-bg text-ink-3'
            : 'bg-surface-sunken text-ink-2',
      )}
    >
      {LEAVE_STATUS_LABELS[status]}
    </span>
  )
}

/** The tick a default the matrix grants renders as. */
function Tick() {
  return <Icon name="confirm" size="compact" className="text-ok" />
}

/** The dash a default the matrix does not grant renders as. */
function Dash() {
  return <span className="text-ink-3">—</span>
}

/** One staff member's full name, joined the way the product writes it. */
function staffName(row: {
  readonly user: { readonly firstName: string; readonly lastName: string }
}): string {
  return [row.user.firstName, row.user.lastName].filter(Boolean).join(' ')
}

/** One role, or the code when the row holds one the constants do not. */
function roleLabel(role: string): string {
  return isMember(Role, role) ? ROLE_LABELS[role] : role
}

/** One column header, with the alignment the design system's tables keep. */
function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}
