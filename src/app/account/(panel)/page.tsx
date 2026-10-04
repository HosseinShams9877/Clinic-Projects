/**
 * The customer panel's home — `02-architecture.md` §7's customer dashboard and §9's
 * `account/dashboard.html`.
 *
 * §7 names the customer's home with the transliterated word the Persian a clinic
 * reads for a dashboard uses, and that is the one home name of the four not phrased
 * possessively — the customer's dashboard is not «داشبورد من」 because a customer
 * has one dashboard and no colleagues to distinguish it from. The `dashboard` module
 * that renders it is Phase 2; Phase 1 shows the home's name and scope. See
 * `_shell/PanelShell.tsx` for the argument about what a Phase 1 home is.
 */

import type { Metadata } from 'next'

import { PanelHome } from '@/app/_shell/PanelShell'
import { PANEL_HOMES } from '@/app/catalog'

export const metadata: Metadata = { title: PANEL_HOMES.account }

export default function AccountHomePage() {
  return <PanelHome panel="account" />
}
