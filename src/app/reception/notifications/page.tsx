/**
 * The reception panel's notifications page — the bell's «همه اعلان‌ها» destination.
 *
 * The same role-aware feed the bell reads (`loadStaffFeed`), rendered in full with the
 * mark-all and per-row delete the page adds. The read/hidden state is the signed-in
 * secretary's own.
 */

import type { Metadata } from 'next'

import { NOTIFICATIONS_PAGE } from '@/app/_shell/catalog'
import { loadStaffFeed } from '@/app/_shell/notifications'
import { NotificationsView } from '@/app/_shell/NotificationsView'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: NOTIFICATIONS_PAGE.title }

export default async function ReceptionNotificationsPage() {
  const session = await requireStaffPanel('reception')
  const feed = await loadStaffFeed('reception', session.permissions, session.tenantId)
  return <NotificationsView panel="reception" items={feed.entries} />
}
