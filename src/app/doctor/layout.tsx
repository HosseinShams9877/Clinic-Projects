/**
 * The doctor panel's shell — `02-architecture.md` §9's `doctor/`.
 *
 * The door a `DOCTOR` membership opens, and the narrowest of the three: §2.1 gives
 * the doctor three permissions by default — `view_own_schedule`,
 * `view_own_customer_records`, `view_own_cycles` — so `staffNavigation('doctor')`
 * renders three of the panel's four pages for the default role, and the fourth only
 * where a manager granted it:
 *
 * - `doctor/debts.html` is §2.1's "optional, manager-granted" page. Its entry is
 *   gated on `view_debts`, which the doctor default does not hold, so the link
 *   appears for a doctor it was granted to and is absent for one it was not — the
 *   navigation reflecting the override rather than the role title.
 *
 * What is not here: any of the panel's four pages. `doctor/page.tsx` is the panel's
 * home and Phase 1's only route in it; the other three arrive with `customers`,
 * `cycles` and `debts`.
 */

import type { Metadata } from 'next'

import { PanelShell } from '@/app/_shell/PanelShell'
import { PANEL_NAMES } from '@/app/catalog'

/** The tab title a page under this panel carries when it does not name its own. */
export const metadata: Metadata = { title: PANEL_NAMES.doctor }

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="doctor">{children}</PanelShell>
}
