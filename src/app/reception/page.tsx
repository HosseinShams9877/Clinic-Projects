/**
 * The reception panel's home — `02-architecture.md` §7's «میز کار امروز」 and §9's
 * `reception/desk.html`.
 *
 * The reception desk's home is today's work rather than a clinic-wide overview, which
 * is why §7 names it for the desk and not the dashboard. The `dashboard` module that
 * renders it is Phase 2; Phase 1 shows the home's name and scope and the five links
 * the secretary's default holds. See `_shell/PanelShell.tsx` for the argument about
 * what a Phase 1 home is.
 */

import type { Metadata } from 'next'

import { PanelHome } from '@/app/_shell/PanelShell'
import { PANEL_HOMES } from '@/app/catalog'

export const metadata: Metadata = { title: PANEL_HOMES.reception }

export default function ReceptionHomePage() {
  return <PanelHome panel="reception" />
}
