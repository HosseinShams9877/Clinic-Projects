/**
 * The customer panel's notifications page — the bell's «همه اعلان‌ها» destination.
 *
 * The customer's own feed (`loadCustomerFeed`): their upcoming appointments, their
 * balance, and care instructions after a session. Read/hidden state is the signed-in
 * customer's own.
 */

import type { Metadata } from 'next'

import { NOTIFICATIONS_PAGE } from '@/app/_shell/catalog'
import { loadCustomerFeed } from '@/app/_shell/notifications'
import { NotificationsView } from '@/app/_shell/NotificationsView'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: NOTIFICATIONS_PAGE.title }

export default async function AccountNotificationsPage() {
  const session = await requireCustomerPanel()
  const feed = await loadCustomerFeed(session.permissions, session.tenantId, session.customerId)
  return <NotificationsView panel="account" items={feed.entries} />
}
