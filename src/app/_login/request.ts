/**
 * The two facts the request carries that a login needs and cannot read for itself.
 *
 * `09-security.md` §10 rate-limits the one-time code **per mobile and per IP**, and
 * §10's session row keeps the address and the user agent for the audit trail. Both
 * are request facts — `headers()` — and both are passed *into* the `auth` module
 * rather than read by it, because a module that reached for `headers()` would be a
 * module that could not be called from a test or a worker.
 *
 * The address is the first `x-forwarded-for` hop, or `x-real-ip`, or an empty string.
 * An empty string is not a lie about the address: it is the honest value when no
 * proxy named one, and the rate limiter treats it as one bucket rather than as
 * "unlimited". A production deployment behind a trusted proxy is what makes the
 * header meaningful, and trusting a client-supplied one is the classic spoof, so the
 * header is read exactly once and never parsed for a subnet.
 */

import { headers } from 'next/headers'

/** The requesting address, for §10's per-IP rate limit and the session's audit row. */
export async function clientIp(): Promise<string> {
  const headerList = await headers()
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded !== null) {
    const first = forwarded.split(',')[0].trim()
    if (first !== '') return first
  }
  return headerList.get('x-real-ip') ?? ''
}

/** The client's user agent, kept on the session row for the audit trail. */
export async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')
}
