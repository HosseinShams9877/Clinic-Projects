/**
 * The reception panel's shell — `02-architecture.md` §9's `reception/`.
 *
 * The door a `SECRETARY` membership opens. §2.1 gives the secretary permissions
 * 1–12, which is everything the matrix holds except the four the manager column
 * locks (`manage_campaigns`, `manage_services`, `manage_clinic_settings`,
 * `manage_users`) — so `staffNavigation('reception')` renders the panel's six pages
 * for the default role, and the manager's locked four are what the reception panel
 * does not contain rather than what it contains and hides.
 *
 * What is not here: any of the panel's six pages. `reception/page.tsx` is the
 * panel's home and Phase 1's only route in it; the other five arrive with
 * `dashboard`, `appointments`, `cycles`, `debts` and `customers`.
 */

import type { Metadata } from 'next'

import { PanelShell } from '@/app/_shell/PanelShell'
import { PANEL_NAMES } from '@/app/catalog'

/** The tab title a page under this panel carries when it does not name its own. */
export const metadata: Metadata = { title: PANEL_NAMES.reception }

export default function ReceptionLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="reception">{children}</PanelShell>
}
