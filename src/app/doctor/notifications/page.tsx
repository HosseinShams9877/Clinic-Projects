/**
 * The doctor panel's notifications page — the bell's «همه اعلان‌ها» destination.
 *
 * The doctor's own feed (`loadStaffFeed`): their own unrecorded results and their own
 * due cycles. Read/hidden state is the signed-in doctor's own.
 */

import type { Metadata } from 'next'

import { NOTIFICATIONS_PAGE } from '@/app/_shell/catalog'
import { loadStaffFeed } from '@/app/_shell/notifications'
import { NotificationsView } from '@/app/_shell/NotificationsView'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: NOTIFICATIONS_PAGE.title }

export default async function DoctorNotificationsPage() {
  const session = await requireStaffPanel('doctor')
  const feed = await loadStaffFeed('doctor', session.permissions, session.tenantId)
  return <NotificationsView panel="doctor" items={feed.entries} />
}
