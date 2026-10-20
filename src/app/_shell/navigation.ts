/**
 * The navigation model of the four panel shells.
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
  readonly label: string
  readonly href?: string
  readonly icon: IconName
  readonly permission?: Permission
  readonly badge?: number
  readonly children?: readonly NavItem[]
}

const PANEL_PAGES: Readonly<Record<Panel, readonly NavItem[]>> = {
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
    // 👈 منوی حسابداری ادمین
    {
      label: 'حسابداری',
      icon: 'invoice',
      children: [
        {
          label: NAV_LABELS.debts,
          href: '/admin/debts',
          icon: 'debt',
          permission: Permission.ViewDebts,
        },
        {
          label: NAV_LABELS.installments,
          href: '/admin/installments',
          icon: 'payment',
          permission: Permission.ViewDebts,
        },
        {
          label: NAV_LABELS.financialReports,
          href: '/admin/financial-reports',
          icon: 'reports',
          permission: Permission.ViewDebts,
        },
      ]
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
    // 👈 منوی حسابداری دکتر (با هر ۳ زیرمنو)
    {
      label: 'حسابداری',
      icon: 'invoice',
      children: [
        {
          label: NAV_LABELS.debts,
          href: '/doctor/debts',
          icon: 'debt',
          permission: Permission.ViewDebts,
        },
        {
          label: NAV_LABELS.installments,
          href: '/doctor/installments',
          icon: 'payment',
          permission: Permission.ViewDebts,
        },
        {
          label: NAV_LABELS.financialReports,
          href: '/doctor/financial-reports',
          icon: 'reports',
          permission: Permission.ViewDebts,
        }
      ]
    },
  ],

  reception: [
    {
      label: NAV_LABELS.desk,
      href: '/reception/desk',
      icon: 'home',
    },
    {
      label: NAV_LABELS.appointments,
      href: '/reception/appointments',
      icon: 'appointment',
      permission: Permission.ManageAppointments,
    },
    // 👈 منوی حسابداری منشی (با هر ۳ زیرمنو، دقیقاً مثل ادمین)
    {
      label: 'حسابداری',
      icon: 'invoice',
      children: [
        {
          label: NAV_LABELS.debts,
          href: '/reception/debts',
          icon: 'debt',
          permission: Permission.ViewDebts,
        },
        {
          label: NAV_LABELS.installments,
          href: '/reception/installments',
          icon: 'payment',
          permission: Permission.ViewDebts,
        },
        {
          label: NAV_LABELS.financialReports,
          href: '/reception/financial-reports',
          icon: 'reports',
          permission: Permission.ViewDebts,
        }
      ]
    },
    {
      label: NAV_LABELS.cycles,
      href: '/reception/cycles',
      icon: 'treatment',
      permission: Permission.ActOnCycles,
    },
    {
      label: NAV_LABELS.campaigns,
      href: '/reception/campaigns',
      icon: 'notification',
      permission: Permission.ManageCampaigns,
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

  account: [
    { label: PANEL_HOMES.account, href: '/account', icon: 'dashboard' },
    { label: NAV_LABELS.accountAppointments, href: '/account/appointments', icon: 'appointment' },
    { label: NAV_LABELS.accountCare, href: '/account/care', icon: 'treatment' },
    { label: NAV_LABELS.accountPayments, href: '/account/payments', icon: 'payment' },
    { label: NAV_LABELS.accountProfile, href: '/account/profile', icon: 'customer' },
  ],
}

export const ROLE_PANEL: Readonly<Record<Role, Panel>> = {
  MANAGER: 'admin',
  DOCTOR: 'doctor',
  SECRETARY: 'reception',
}

export function staffNavigation(panel: Panel, ctx: TenantContext): readonly NavItem[] {
  return PANEL_PAGES[panel]
    .map((item) => {
      if (item.children) {
        const allowedChildren = item.children.filter((child) => child.permission === undefined || can(ctx, child.permission))
        if (allowedChildren.length === 0) return null
        return { ...item, children: allowedChildren }
      }
      return item.permission === undefined || can(ctx, item.permission) ? item : null
    })
    .filter((item): item is NavItem => item !== null)
}

export function customerNavigation(): readonly NavItem[] {
  return PANEL_PAGES.account
}

export function panelPath(panel: Panel): string {
  const home = PANEL_PAGES[panel][0]
  if (home === undefined || home.href === undefined) {
    throw new Error(`The panel ${panel} has no home in the navigation table.`)
  }
  return home.href
}