/**
 * The per-principal read/hidden state behind the notifications bell and page.
 *
 * A notification is derived (the bell's own reads), so its "read" is not a column on
 * the source row but a `NotificationRead` row keyed by a stable `notificationKey`
 * (`<kind>:<entityId>`) and the principal who read it. This module is the one place
 * that table is read and written, so the bell's unread count, the page's read styling
 * and the delete all agree on what "read" and "hidden" mean.
 *
 * The principal is a staff `userId` or a customer `customerId`; `principalKind` keeps
 * the two apart so a secretary's read is never a customer's. Everything is tenant
 * scoped — the caller opens the scope, the reads and writes carry `tenantId`.
 */

import type { TransactionClient } from '@/core/db/scope'
import { realClock } from '@/core/lib/clock'

/** Which kind of principal a read belongs to — the two panels' two id types. */
export type PrincipalKind = 'staff' | 'customer'

/** The principal a notification's state is keyed to. */
export interface NotificationPrincipal {
  readonly tenantId: string
  readonly kind: PrincipalKind
  readonly id: string
}

/** One principal's state for a set of keys: which are read, which are hidden. */
export interface NotificationState {
  readonly read: ReadonlySet<string>
  readonly hidden: ReadonlySet<string>
}

/**
 * The read/hidden state for this principal, across every key they hold a row for.
 *
 * One query, not one per key: the page and the bell both ask "of these candidates,
 * which are read or hidden", and the answer is the principal's own small set of rows.
 */
export async function loadNotificationState(
  tx: TransactionClient,
  principal: NotificationPrincipal,
): Promise<NotificationState> {
  const rows = await tx.notificationRead.findMany({
    where: { tenantId: principal.tenantId, principalKind: principal.kind, principalId: principal.id },
    select: { notificationKey: true, readAt: true, hiddenAt: true },
  })
  const read = new Set<string>()
  const hidden = new Set<string>()
  for (const row of rows) {
    if (row.readAt !== null) read.add(row.notificationKey)
    if (row.hiddenAt !== null) hidden.add(row.notificationKey)
  }
  return { read, hidden }
}

/** Marks one key read for this principal, idempotently. */
export async function markNotificationRead(
  tx: TransactionClient,
  principal: NotificationPrincipal,
  key: string,
): Promise<void> {
  await upsertState(tx, principal, key, { readAt: realClock() })
}

/** Marks every given key read for this principal in one pass. */
export async function markNotificationsRead(
  tx: TransactionClient,
  principal: NotificationPrincipal,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) await markNotificationRead(tx, principal, key)
}

/** Hides one key for this principal — the per-user delete, also counted as read. */
export async function hideNotification(
  tx: TransactionClient,
  principal: NotificationPrincipal,
  key: string,
): Promise<void> {
  const now = realClock()
  await upsertState(tx, principal, key, { readAt: now, hiddenAt: now })
}

/**
 * The upsert the three writers share.
 *
 * `NotificationRead` is unique on (tenantId, principalId, notificationKey), so a second
 * mark is an update of the same row rather than a duplicate. `readAt` is only ever set
 * forward — a row that was already read keeps its first instant unless the caller also
 * hides it, which stamps both.
 */
async function upsertState(
  tx: TransactionClient,
  principal: NotificationPrincipal,
  key: string,
  patch: { readonly readAt?: Date; readonly hiddenAt?: Date },
): Promise<void> {
  const existing = await tx.notificationRead.findFirst({
    where: {
      tenantId: principal.tenantId,
      principalKind: principal.kind,
      principalId: principal.id,
      notificationKey: key,
    },
    select: { id: true },
  })
  if (existing === null) {
    await tx.notificationRead.create({
      data: {
        tenantId: principal.tenantId,
        principalKind: principal.kind,
        principalId: principal.id,
        notificationKey: key,
        readAt: patch.readAt ?? null,
        hiddenAt: patch.hiddenAt ?? null,
      },
    })
    return
  }
  await tx.notificationRead.update({
    where: { id: existing.id },
    data: { readAt: patch.readAt, hiddenAt: patch.hiddenAt },
  })
}
