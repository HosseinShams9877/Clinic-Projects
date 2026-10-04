/**
 * The manager panel's home — `02-architecture.md` §7's «داشبورد من」 and §9's
 * `admin/dashboard.html`.
 *
 * Phase 1 renders the panel's frame and this home; the `dashboard` module that owns
 * the surface is Phase 2, so the page shows the home's name and its scope and
 * nothing it would have to invent. See `_shell/PanelShell.tsx` for the argument
 * about what a Phase 1 home is and is not.
 */

import type { Metadata } from 'next'

import { PanelHome } from '@/app/_shell/PanelShell'
import { PANEL_HOMES } from '@/app/catalog'

export const metadata: Metadata = { title: PANEL_HOMES.admin }

export default function AdminHomePage() {
  return <PanelHome panel="admin" />
}
