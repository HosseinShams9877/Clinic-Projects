/**
 * The customer panel's shell — `02-architecture.md` §9's `account/`.
 *
 * The door a customer session opens, and the one panel that has no role: §7 of
 * `09-security.md` gives the customer panel no permission primitive at all, because
 * a customer's scope is their own `customerId` and not a capability. The navigation
 * is therefore unconditional — `customerNavigation()` shows the panel's five
 * destinations — and the gate is that the session resolved a customer, which
 * `CustomerPanelShell` enforces.
 *
 * ## Why this layout is in a route group
 *
 * `/account/login` is a page *of* this panel and must not carry its shell: a person
 * on the login page has no session, and the shell would send them to the login page
 * they are already on. The `(panel)` group keeps the shell on `/account` and its
 * five destinations while `src/app/account/login/page.tsx` renders outside it, and
 * the two share a URL prefix and nothing else.
 *
 * What is not here: the panel's six surfaces. `(panel)/page.tsx` is the panel's home
 * and Phase 1's only route in it; `appointments`, `services`, `payments` and
 * `customers` bring the other four, and the sixth — the way out — is the topbar's
 * sign-out.
 */

import type { Metadata } from 'next'

import { PanelShell } from '@/app/_shell/PanelShell'
import { PANEL_NAMES } from '@/app/catalog'

/** The tab title a page under this panel carries when it does not name its own. */
export const metadata: Metadata = { title: PANEL_NAMES.account }

export default function AccountPanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="account">{children}</PanelShell>
}
