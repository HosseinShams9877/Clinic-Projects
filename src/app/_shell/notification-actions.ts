/**
 * The notifications' Server Actions — mark one read, mark all read, hide one.
 *
 * Each resolves the principal from the session (a staff membership or a customer),
 * writes through `notification-state.ts`, and revalidates the panel's own surfaces so
 * the bell's badge and the page agree on the next render. The principal is never a
 * parameter — a caller cannot mark another person's notification read.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import type { TenantContext } from '@/core/tenant'

import type { Panel } from './navigation'
import { resolveCustomerPanel, resolveStaffPanel } from './session'
import {
  hideNotification,
  markNotificationsRead,
  type NotificationPrincipal,
} from './notification-state'
import { loadCustomerFeed, loadStaffFeed } from './notifications'

/** The principal and scope the three actions share, resolved from the session. */
async function resolvePrincipal(panel: Panel): Promise<{
  readonly principal: NotificationPrincipal
  readonly permissions: Parameters<typeof runInTenantScope>[0]
  readonly tenantId: string
}> {
  if (panel === 'account') {
    const session = await resolveCustomerPanel()
    return {
      principal: { tenantId: session.tenantId, kind: 'customer', id: session.customerId },
      permissions: session.permissions,
      tenantId: session.tenantId,
    }
  }
  const session = await resolveStaffPanel(panel)
  return {
    principal: { tenantId: session.tenantId, kind: 'staff', id: session.permissions.userId },
    permissions: session.permissions,
    tenantId: session.tenantId,
  }
}

/** The surfaces a notification change touches — the panel's page and its home. */
function revalidatePanel(panel: Panel): void {
  revalidatePath(`/${panel}`)
  revalidatePath(`/${panel}/notifications`)
}

/** Marks one notification read for the signed-in principal. */
export async function markNotificationReadAction(panel: Panel, key: string): Promise<void> {
  const { principal, permissions } = await resolvePrincipal(panel)
  await runInTenantScope(permissions, prisma(), (tx) => markNotificationsRead(tx, principal, [key]))
  revalidatePanel(panel)
}

/** Marks every currently-visible notification read for the signed-in principal. */
export async function markAllNotificationsReadAction(panel: Panel): Promise<void> {
  const { principal, permissions, tenantId } = await resolvePrincipal(panel)
  const feed =
    panel === 'account'
      ? await loadCustomerFeed(permissions, tenantId, principal.id)
      : await loadStaffFeed(panel, permissions as TenantContext, tenantId)
  await runInTenantScope(permissions, prisma(), (tx) =>
    markNotificationsRead(
      tx,
      principal,
      feed.entries.map((entry) => entry.key),
    ),
  )
  revalidatePanel(panel)
}

/** Hides one notification for the signed-in principal — the per-user delete. */
export async function hideNotificationAction(panel: Panel, key: string): Promise<void> {
  const { principal, permissions } = await resolvePrincipal(panel)
  await runInTenantScope(permissions, prisma(), (tx) => hideNotification(tx, principal, key))
  revalidatePanel(panel)
}
