/**
 * The admin panel's notifications page — the bell's «همه اعلان‌ها» destination.
 *
 * The manager's own feed (`loadStaffFeed`): leave approvals and the day's
 * cancellations, kept off the follow-up cartable per قاعده دوم. Read/hidden state is
 * the signed-in manager's own.
 */

import type { Metadata } from 'next'

import { NOTIFICATIONS_PAGE } from '@/app/_shell/catalog'
import { loadStaffFeed } from '@/app/_shell/notifications'
import { NotificationsView } from '@/app/_shell/NotificationsView'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: NOTIFICATIONS_PAGE.title }

export default async function AdminNotificationsPage() {
  const session = await requireStaffPanel('admin')
  const feed = await loadStaffFeed('admin', session.permissions, session.tenantId)
  return <NotificationsView panel="admin" items={feed.entries} />
}
