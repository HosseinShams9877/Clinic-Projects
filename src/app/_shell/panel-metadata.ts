/**
 * The tab title a panel's pages carry — «<page> — <clinic>».
 *
 * Each panel layout's `generateMetadata` calls this so a page's own title (set in its
 * `metadata`) is suffixed with the clinic's stored name through Next's title template,
 * and a page that names no title of its own falls back to «<clinic> — <panel>». The
 * clinic name is the settings module's `readIdentity`, read under the resolved session.
 *
 * A pre-session request (no cookie yet, mid-redirect) must not 500 the metadata pass,
 * so a resolution failure falls back to the static panel name — the shell itself does
 * the real redirect.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { readIdentity } from '@/modules/settings'

import { PANEL_NAMES } from '@/app/catalog'
import type { Panel } from './navigation'
import { resolveCustomerPanel, resolveStaffPanel } from './session'

/** The clinic/panel title metadata for a panel's layout. */
export async function panelTitle(panel: Panel): Promise<Metadata> {
  const panelName = PANEL_NAMES[panel]
  try {
    const session =
      panel === 'account'
        ? await resolveCustomerPanel()
        : await resolveStaffPanel(panel)
    const identity = await runInTenantScope(session.permissions, prisma(), (tx) =>
      readIdentity(tx, session.tenantId),
    )
    const clinic = identity.clinicName.trim() || identity.tenantName.trim() || panelName
    return {
      title: { template: `%s — ${clinic}`, default: `${clinic} — ${panelName}` },
    }
  } catch {
    // No usable session yet (the shell will redirect); name the panel, don't throw.
    return { title: panelName }
  }
}
