/**
 * The navigation model of the four panel shells.
 *
 * `docs/roadmap/progress.md` names Phase 1's second box "The four panel shells, nav
 * from the permission set". This file is what makes the nav that: one table holds a
 * panel's pages, each page carries the permission that owns it, and the shell keeps
 * the entries `can()` grants. A doctor's sidebar therefore never shows a manager's
 * links, and the one page a doctor may hold but is not granted by default —
 * `doctor/debts.html`, which `04-roles-permissions.md` §2.1 calls "optional,
 * manager-granted" — appears for a doctor it was granted to and for no one else.
 *
 * ## Why the table is routes and permissions, and the copy is not here
 *
 * The source of truth for which pages belong to which panel is `02-architecture.md`
 * §9's inventory, which is expressed in routes (`admin/debts.html`) and never in
 * Persian. This table mirrors it in the same terms — `href` and `permission` — and
 * pulls the label from `src/app/catalog.ts`, so the inventory stays readable from
 * one place. A page that appeared here without a route in §9 would be a page the
 * inventory does not hold, and a route §9 names that no shell links to would be a
 * route the platform built and never offered.
 *
 * ## Which permission gates which page
 *
 * `04-roles-permissions.md` §3.4 maps each permission to the one module that
 * enforces it, and a page whose module enforces a permission is gated by it: the
 * `debts` page is not reachable without `view_debts`. Two entries deliberately carry
 * **no** permission, and the reason differs for each:
 *
 * - **A panel's home** is gated by being in the panel, not by a capability. The
 *   homes are the four role-scoped dashboards of `02-architecture.md` §7, and the
 *   panel's own layout already resolved the role that belongs in it.
 * - **`admin/reports`** has no permission in the 16-permission matrix at all.
 *   §3.4's table names `reports` as a module but no row of §4.2's matrix owns it, so
 *   there is no `can()` to ask. The manager column is the only one the panel admits
 *   (the layout routes any other role to its own panel), which is the honest gate;
 *   a permission invented here to fill the gap would be a 17th permission the
 *   specification does not have.
 *
 * ## What the customer panel is gated by instead
 *
 * Nothing on this table. `09-security.md` §7 gives the customer panel no role and no
 * permission primitive — every query is scoped to the `customerId` the session
 * resolved, in addition to the tenant — so the customer's five destinations are
 * shown unconditionally. The gate is that the session resolved a customer at all,
 * which the panel's layout enforces.
 *
 * ## What is not here
 *
 * The detail pages. `admin/customer.html` is reached from `admin/customers.html` and
 * is not a destination in its own right, so it is not a nav entry; §9 counts the
 * manager panel's 11 pages and this table shows 10 links.
 */

import type { IconName } from '@/core/components/icons'
import { Permission, type Role } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'

import { NAV_LABELS, PANEL_HOMES } from '@/app/catalog'

import { can } from '@/modules/roles-permissions'

/** The four panels of `02-architecture.md` §9, keyed as their routes are. */
export type Panel = 'admin' | 'doctor' | 'reception' | 'account'

/**
 * One destination in a panel's navigation.
 */
export interface NavItem {
  /** The Persian label, from `src/app/catalog.ts`. */
  readonly label: string
  /** The route, as `02-architecture.md` §9 names it (without the `.html`). */
  readonly href: string
  /** The registered icon (`08-ui-design-system.md` §42). */
  readonly icon: IconName
  /**
   * The permission that owns the page, or `undefined` for the two reasons above.
   * The shell asks `can()` rather than the role, so an override widens or narrows
   * the navigation the same way it widens or narrows the page.
   */
  readonly permission?: Permission
}

/**
 * The panels' pages, keyed as `02-architecture.md` §9 groups them.
 *
 * `satisfies` rather than a type annotation so the `href` values stay literal — a
 * `typedRoutes` mismatch would be caught here, and the keys stay the `Panel` union.
 */
const PANEL_PAGES: Readonly<Record<Panel, readonly NavItem[]>> = {
  /* §9's manager panel — 11 pages, 10 links, `customer.html` reached from
     `customers.html`. */
  admin: [
    { label: PANEL_HOMES.admin, href: '/admin', icon: 'dashboard' },
    {
      label: NAV_LABELS.appointments,
      href: '/admin/appointments',
      icon: 'appointment',
      permission: Permission.ViewAllSchedules,
    },
    {
      label: NAV_LABELS.customers,
      href: '/admin/customers',
      icon: 'customers',
      permission: Permission.ViewAllCustomers,
    },
    {
      label: NAV_LABELS.debts,
      href: '/admin/debts',
      icon: 'debt',
      permission: Permission.ViewDebts,
    },
    {
      label: NAV_LABELS.cycles,
      href: '/admin/cycles',
      icon: 'treatment',
      permission: Permission.ActOnCycles,
    },
    {
      label: NAV_LABELS.campaigns,
      href: '/admin/campaigns',
      icon: 'notification',
      permission: Permission.ManageCampaigns,
    },
    {
      label: NAV_LABELS.services,
      href: '/admin/services',
      icon: 'services',
      permission: Permission.ManageServices,
    },
    {
      label: NAV_LABELS.staff,
      href: '/admin/staff',
      icon: 'staff',
      permission: Permission.ManageUsers,
    },
    {
      // No permission in the matrix — see the header. The panel's own role gate is
      // what keeps this to the manager, and that is the honest gate.
      label: NAV_LABELS.reports,
      href: '/admin/reports',
      icon: 'reports',
    },
    {
      label: NAV_LABELS.settings,
      href: '/admin/settings',
      icon: 'settings',
      permission: Permission.ManageClinicSettings,
    },
  ],

  /* §9's doctor panel — 4 pages. The debts link is the optional one: `view_debts`
     is not in the doctor's default (§2.1: 1, 5, 10), so it shows only where a
     manager granted it, and a doctor's sidebar reflects the override. */
  doctor: [
    { label: PANEL_HOMES.doctor, href: '/doctor', icon: 'calendar' },
    {
      label: NAV_LABELS.customers,
      href: '/doctor/customers',
      icon: 'customers',
      permission: Permission.ViewOwnCustomerRecords,
    },
    {
      label: NAV_LABELS.cycles,
      href: '/doctor/cycles',
      icon: 'treatment',
      permission: Permission.ViewOwnCycles,
    },
    {
      label: NAV_LABELS.debts,
      href: '/doctor/debts',
      icon: 'debt',
      permission: Permission.ViewDebts,
    },
  ],

  /* §9's reception panel — 6 pages. The secretary's default is §2.1's 1–12, so
     everything below shows for the default role; the entries are still gated, so a
     revoked override removes the link and the page it leads to together.

     The desk is the panel's own home and the one page that needs no permission of its
     own: it composes the queues the permissions below gate, and a section a role
     cannot act on is a section the page does not render rather than one it refuses. */
  reception: [
    {
      label: NAV_LABELS.desk,
      href: '/reception/desk',
      icon: 'home',
    },
    { label: PANEL_HOMES.reception, href: '/reception', icon: 'appointment' },
    {
      label: NAV_LABELS.appointments,
      href: '/reception/appointments',
      icon: 'appointment',
      permission: Permission.ManageAppointments,
    },
    {
      label: NAV_LABELS.cycles,
      href: '/reception/cycles',
      icon: 'treatment',
      permission: Permission.ActOnCycles,
    },
    {
      label: NAV_LABELS.debts,
      href: '/reception/debts',
      icon: 'debt',
      permission: Permission.ViewDebts,
    },
    {
      label: NAV_LABELS.leads,
      href: '/reception/leads',
      icon: 'message',
      permission: Permission.ManageLeads,
    },
    {
      label: NAV_LABELS.customers,
      href: '/reception/customers',
      icon: 'customers',
      permission: Permission.ViewAllCustomers,
    },
  ],

  /* §9's customer panel — 6 surfaces: the login page plus the five destinations
     below. The login is a route in this panel and is not navigation, so it is not on
     this table; the sixth surface a signed-in customer sees is the sign-out in the
     topbar. */
  account: [
    { label: PANEL_HOMES.account, href: '/account', icon: 'dashboard' },
    { label: NAV_LABELS.accountAppointments, href: '/account/appointments', icon: 'appointment' },
    { label: NAV_LABELS.accountCare, href: '/account/care', icon: 'treatment' },
    { label: NAV_LABELS.accountPayments, href: '/account/payments', icon: 'payment' },
    { label: NAV_LABELS.accountProfile, href: '/account/profile', icon: 'customer' },
  ],
}

/**
 * The panel a role belongs in.
 *
 * `02-architecture.md` §9's four panels map one-to-one onto the three roles of
 * `04-roles-permissions.md` §1 plus the customer. This is what a shell uses to send
 * a signed-in person to the panel that is theirs when they arrive at one that is
 * not: a doctor who opens `/admin` is a doctor with the wrong door, not a forbidden
 * user, and the honest response is to point them at their own.
 */
export const ROLE_PANEL: Readonly<Record<Role, Panel>> = {
  MANAGER: 'admin',
  DOCTOR: 'doctor',
  SECRETARY: 'reception',
}

/**
 * The navigation a staff member sees in a panel: the panel's pages, minus the ones
 * the resolved permission set does not hold.
 *
 * Takes the **server-resolved** context — the one `02-architecture.md` §11
 * guarantees, built by the panel's layout from the session and never from the
 * request — so a link a person sees is a link the server will let them open.
 */
export function staffNavigation(panel: Panel, ctx: TenantContext): readonly NavItem[] {
  return PANEL_PAGES[panel].filter((item) => item.permission === undefined || can(ctx, item.permission))
}

/**
 * The customer panel's navigation, which is every destination the panel holds.
 *
 * `09-security.md` §7 gives the customer no permission primitive, so there is
 * nothing to filter against; the function exists so the shell calls one thing and
 * the reason the customer panel is unconditional is here rather than at the call
 * site.
 */
export function customerNavigation(): readonly NavItem[] {
  return PANEL_PAGES.account
}

/**
 * The route a panel's home lives at.
 *
 * Derived from the table above rather than written a second time, so a panel's home
 * route and the first link in its navigation are one fact and cannot drift apart —
 * a redirect that sent a person somewhere the sidebar does not point would be a
 * door the panel itself does not admit. The entry page and the two logins use this
 * to send a signed-in person to their own panel rather than ask them which one they
 * want.
 *
 * Each panel's home is the table's first entry, and the table puts it first for this
 * reason; the guard is for the shape, not for any panel the product has.
 */
export function panelPath(panel: Panel): string {
  const home = PANEL_PAGES[panel][0]
  if (home === undefined) {
    throw new Error(`The panel ${panel} has no home in the navigation table.`)
  }
  return home.href
}
