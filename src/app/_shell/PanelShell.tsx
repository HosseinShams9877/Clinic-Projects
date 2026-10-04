/**
 * The panel shell — the frame the four panels' pages render inside.
 *
 * `docs/roadmap/progress.md` names Phase 1's second box "The four panel shells, nav
 * from the permission set". What a shell does:
 *
 * 1. **It resolves the person.** `requireStaffPanel()` / `requireCustomerPanel()`
 *    read the session cookie and resolve the membership, and they redirect when
 *    there is no session to resolve. This is `02-architecture.md` §11's resolution,
 *    done by the layout because the middleware that section assigns it to is Phase
 *    2 — see `session.ts` for the whole argument.
 * 2. **It builds the navigation from the permission set.** `staffNavigation()`
 *    keeps the entries `can()` grants, so a doctor's sidebar holds the doctor's
 *    pages and a doctor granted `view_debts` sees the one page §2.1 calls optional.
 * 3. **It renders the frame** — §26's sidebar, §28's topbar, §43's one breakpoint —
 *    and the panel's own home page inside it.
 *
 * ## What a shell deliberately does not do
 *
 * It runs no business logic (`02-architecture.md` §6: `src/app/` is routing and
 * composition). It does not read a module's tables, does not compute a total, does
 * not decide a status. The home page it frames is the panel's name, its scope and
 * the list of the pages in it — all of which the shell already knows — and nothing
 * else, because the `dashboard` module that owns a panel's home is not built.
 *
 * ## The topbar's chip, and the name it does not show
 *
 * §28's user chip is an avatar, a name and a role. The role is here: it is a fact
 * about the membership the shell resolved, and `ROLE_LABELS` renders it. The **name
 * is not**, because a name is a read of the `staff` module's own table, and that
 * module is not built. Rendering a name would mean `src/app/` doing a database read
 * §6 forbids it, or inventing a module to do it; rendering a placeholder would be a
 * fake. The chip carries the role, which is real, and the person's name arrives
 * with the `staff` module in Phase 2 — one chip change, in this file, because no
 * component spells a role label.
 */

import type { ReactNode } from 'react'

import { ROLE_LABELS } from '@/core/localization'

import { PANEL_HOMES, PANEL_NAMES, PANEL_SCOPE } from '@/app/catalog'

import { PanelChrome } from './PanelChrome'
import type { Panel } from './navigation'
import { customerNavigation, staffNavigation } from './navigation'
import {
  requireCustomerPanel,
  requireStaffPanel,
  type PanelSession,
} from './session'

export interface PanelShellProps {
  readonly panel: Panel
  readonly children: ReactNode
}

/**
 * The shell of the three staff panels and the customer panel.
 *
 * The panel discriminates which resolution to run: the three staff panels resolve a
 * membership and a role, the customer panel resolves a customer and holds no role
 * (`09-security.md` §7). Both paths end in the same chrome, because the frame is
 * one design system and only its chip differs.
 *
 * Each path resolves *before* it renders, which is what makes the shell the guard:
 * a route segment under the panel cannot reach a page without a session the panel
 * accepts. A page that needs the resolved facts re-resolves them itself — the same
 * one indexed read — because the layout and the page are two renders and the
 * resolution is not serializable across the boundary.
 */
export async function PanelShell({ panel, children }: PanelShellProps) {
  return panel === 'account' ? (
    <CustomerPanelShell>{children}</CustomerPanelShell>
  ) : (
    <StaffPanelShell panel={panel}>{children}</StaffPanelShell>
  )
}

/**
 * The staff shell, separated so the resolution it needs does not run for the
 * customer panel — which has no membership to resolve and no `requireStaffPanel`
 * redirect to take.
 */
async function StaffPanelShell({ panel, children }: PanelShellProps) {
  const session: PanelSession = await requireStaffPanel(panel)

  return (
    <PanelChrome
      panel={panel}
      panelName={PANEL_NAMES[panel]}
      roleLabel={ROLE_LABELS[session.role]}
      nav={staffNavigation(panel, session.permissions)}
    >
      {children}
    </PanelChrome>
  )
}

/**
 * The customer shell. The customer panel has no role and no permission set, so
 * nothing the staff shell resolves applies — but the *guard* does, and that is the
 * resolution's other half: a session that resolves no customer is sent to
 * `/account/login` rather than into a panel with no one in it.
 *
 * `customerId` is resolved and unused here. It is not passed down because a page
 * under this panel that needs it re-resolves it from the same cookie, and a shell
 * handing a page an id would be a second place the id comes from — `09-security.md`
 * §7 is explicit that the panel's `customerId` arrives from the session and from
 * nowhere else.
 */
async function CustomerPanelShell({ children }: Omit<PanelShellProps, 'panel'>) {
  await requireCustomerPanel()

  return (
    <PanelChrome
      panel="account"
      panelName={PANEL_NAMES.account}
      roleLabel={null}
      nav={customerNavigation()}
    >
      {children}
    </PanelChrome>
  )
}

/**
 * The panel's home: the home's name and the one-sentence scope.
 *
 * This is what Phase 1 renders in place of the dashboard the panel will have. It is
 * deliberately not a mock of one: there is no chart with numbers on it, no list of
 * today's appointments, no count that would have to come from a module that does
 * not exist. What it shows is what the shell *does* know — the home's name from
 * `02-architecture.md` §7 and its scope restated from §9's inventory — and Phase 2
 * replaces it with the `dashboard` module's own home, which is the surface §7 names
 * these pages after.
 *
 * The panel's pages are not re-listed here: the sidebar beside this already lists
 * them, and a second list would be a second place the inventory is read from.
 */
export function PanelHome({ panel }: { readonly panel: Panel }) {
  return (
    <div>
      <h1>{PANEL_HOMES[panel]}</h1>
      <p>{PANEL_SCOPE[panel]}</p>
    </div>
  )
}
