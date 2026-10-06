/**
 * Consent as a hard filter — Phase 6's third deliverable and `03-data-model.md` §7.6:
 *
 * > `MessageSend` requires a consent record for the channel, or
 * > `status = SUPPRESSED` with a reason.
 *
 * "No consent, no send" is not a default the dispatcher may override and not a
 * warning a person dismisses. It is a read that precedes every send, and its answer
 * is either a delivered message or a ledger row recording why there is none —
 * because a suppressed send that left no row is a decision the clinic cannot audit
 * and a customer cannot revoke.
 *
 * ## Why the row is the authority and not the flag
 *
 * `Customer.consentSms` is a convenience for the profile screen, but the row is the
 * evidence: `ConsentRecord` carries the timestamp and the source that justify the
 * send (`03` §6), and immutable rule 5 says customer consent outranks the clinic —
 * so a withdrawn consent is a row with `granted = false`, not a deleted row. Reading
 * the **latest** row for the channel answers the question the evidence sequence
 * answers: the last thing the customer decided.
 *
 * The two are written together by the customers module's `recordConsent`, so a tenant
 * in normal operation has them agreeing. The read that can disagree is the one this
 * module trusts, and it is the evidence.
 *
 * ## Why a customer in another tenant has no consent
 *
 * The `where` clause carries `tenantId` and `customerId` both, so a consent row from
 * another clinic is not evidence for this one. The caller opened a tenant-scoped
 * transaction, so the predicate is belt-and-braces rather than the only line of
 * defence — `02-architecture.md` §11's argument about why Layer 1 and Layer 2 are
 * both kept applies here at the read.
 */

import type { Channel } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

/**
 * The columns the latest-consent read needs, named once so a schema change touches
 * one select.
 */
const CONSENT_SELECT = {
  id: true,
  granted: true,
  revokedAt: true,
  grantedAt: true,
} as const

/**
 * Whether the customer may be reached on `channel`.
 *
 * The latest evidence row decides: no row at all is no consent, a row with
 * `granted = true` and no revocation is consent, and anything else — a revocation, a
 * `granted = false` row — is its opposite. Ordered by `grantedAt` descending so a
 * later decision always wins an earlier one, and `take: 1` so the read is one row.
 */
export async function hasChannelConsent(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
  channel: Channel,
): Promise<boolean> {
  const row = await tx.consentRecord.findFirst({
    where: { tenantId, customerId, channel },
    orderBy: { grantedAt: 'desc' },
    take: 1,
    select: CONSENT_SELECT,
  })
  if (row === null) return false
  return row.granted && row.revokedAt === null
}
