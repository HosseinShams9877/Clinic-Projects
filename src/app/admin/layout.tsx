/**
 * The manager panel's shell — `02-architecture.md` §9's `admin/`.
 *
 * The door a `MANAGER` membership opens. `requireStaffPanel('admin')` resolves the
 * session and sends any other role to its own panel, so the eleven pages under this
 * layout are reached by the one role §2.1 gives the full sixteen-permission column
 * to — and the navigation `staffNavigation()` builds here is the manager's column
 * filtered by `can()`, which for the manager is every entry `navigation.ts` holds.
 *
 * What is not here: any of the panel's eleven pages. `admin/page.tsx` is the panel's
 * home and Phase 1's only route in it; the other ten arrive with their modules, and
 * each one's module enforces its own permission again when it lands.
 */

import type { Metadata } from 'next'

import { PanelShell } from '@/app/_shell/PanelShell'
import { PANEL_NAMES } from '@/app/catalog'

/** The tab title a page under this panel carries when it does not name its own. */
export const metadata: Metadata = { title: PANEL_NAMES.admin }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="admin">{children}</PanelShell>
}
