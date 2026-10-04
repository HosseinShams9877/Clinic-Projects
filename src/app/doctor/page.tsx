/**
 * The doctor panel's home — `02-architecture.md` §7's «برنامه من」 and §9's
 * `doctor/dashboard.html`.
 *
 * The doctor's home is the doctor's own schedule, which is what makes it a different
 * surface from the manager's dashboard and why §7 gives the two panels different
 * home names. The `dashboard` module that renders it is Phase 2; Phase 1 shows the
 * home's name and scope and the three links the doctor's default holds. See
 * `_shell/PanelShell.tsx` for the argument about what a Phase 1 home is.
 */

import type { Metadata } from 'next'

import { PanelHome } from '@/app/_shell/PanelShell'
import { PANEL_HOMES } from '@/app/catalog'

export const metadata: Metadata = { title: PANEL_HOMES.doctor }

export default function DoctorHomePage() {
  return <PanelHome panel="doctor" />
}
