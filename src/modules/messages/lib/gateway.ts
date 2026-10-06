/**
 * The gateway adapter — the one place the clinic's messaging provider is reached.
 *
 * `02-architecture.md` §6 names the gateway and leaves the provider open: a clinic on
 * SMS, a clinic on WhatsApp, and a clinic whose provider changes are three tenants of
 * one build. The interface is the seam, and the module installs the default so that a
 * tenant with no provider configured still has a working ledger — every send is
 * recorded, and the provider is what the row's `providerMessageId` is about.
 *
 * ## Why the default logs instead of throwing
 *
 * A development tenant has no provider, and a dispatch that could not send would be a
 * dispatch that wrote no rows — which is a ledger that proves nothing on the day the
 * clinic installs one. The default adapter delivers the message to the log and
 * answers `SENT` with the id the log line carries, so the ledger is exercised end to
 * end by the only tenant that runs without a provider. A production install replaces
 * it before the worker starts, and the ledger's rows name that provider instead.
 *
 * ## Why the holder is module-level and not a parameter
 *
 * The worker installs the adapter once at boot and the dispatch then runs for a
 * tenant at a time; threading the adapter through every call would be passing a
 * deployment fact through the module's whole surface to reach the one function that
 * uses it. The holder is set before the worker accepts a job, and a test that needs a
 * fake sets one and restores it after.
 */

import { randomUUID } from 'node:crypto'

import type { GatewayMessage, GatewayResult, MessageGateway } from '../types'

/**
 * The shipped adapter: delivers to the log and answers as sent.
 *
 * Named for what it does rather than what it is not, because a tenant reading its own
 * ledger on a development install should see a name that says where the message went.
 */
export const consoleGateway: MessageGateway = {
  name: 'console',
  async send(message: GatewayMessage): Promise<GatewayResult> {
    const providerMessageId = randomUUID()
    console.info(
      `[messages] sent tenant=${message.tenantId} channel=${message.channel} ` +
        `customer=${message.customerId} id=${providerMessageId}`,
    )
    return { status: 'SENT', providerMessageId, error: null }
  },
}

/**
 * The adapter sends currently go through, replaceable with `setMessageGateway`.
 *
 * Held in a `let` rather than read from a provider map keyed by channel because the
 * product ships one provider per tenant and the map would be a lookup whose keys are
 * a set of two — a lookup over two values is a branch, and a branch is what the
 * adapter exists to keep out of the dispatcher.
 */
let gateway: MessageGateway = consoleGateway

/** The adapter a send goes through. */
export function currentGateway(): MessageGateway {
  return gateway
}

/** Installs the adapter, before the worker accepts a job. */
export function setMessageGateway(next: MessageGateway): void {
  gateway = next
}
