/**
 * One-time codes for customers — `09-security.md` §10.
 *
 * > Customer login | Mobile + one-time code. Codes are short-lived (minutes),
 * > single-use, and rate-limited per mobile and per IP.
 * > OTP storage | Only a hash of the code is stored, with an expiry and an
 * > attempt counter.
 *
 * ## What the design is for
 *
 * `issueOtp` **writes a row for every mobile, known or unknown**. §10 requires
 * that "login responses do not reveal whether a mobile number exists", which
 * means the observable behaviour of an unknown mobile and a known one is identical
 * — the same row, the same acceptance, the same response. The difference is in the
 * text message, which the customer never sees. This is why the challenge row is
 * the unit of rate limiting rather than the customer: an unknown mobile has no
 * customer to attach a limit to, and a design that looked the customer up first
 * would have to either disclose the miss or skip the row and lose the limit.
 *
 * ## The code
 *
 * Six digits, generated with `randomInt` over the whole range — not a truncated
 * `randomUUID`, not a modulus. Six digits is what the form renders and what §10's
 * "short" means at the length the Persian digit conversion displays; the entropy
 * is the attempt counter's job, and 10⁶ with a three-attempt budget is the
 * combination the security model assumes.
 *
 * `randomInt` is used rather than `Math.random()` because `Math.random()` is not
 * cryptographically seeded, and a code that is predictable from the PRNG state is
 * a code that is not a one-time code at all.
 *
 * ## What is deliberately not here
 *
 * **The text message.** §10's rate limits are this module's; the transport is
 * `messages`, per `02-architecture.md` §7's split between "when and to whom" and
 * "what text and transport". `issueOtp` returns the challenge and the caller hands
 * the code to the gateway, which means a test never needs a gateway to prove the
 * code was checked correctly.
 *
 * **Revealing whether the code matched by its failure.** The wrong-code and
 * no-such-challenge cases raise the same key, for the same reason the two halves
 * of a password login do.
 */

import { createHash, randomInt } from 'node:crypto'

/** The code a customer types. Six digits, displayed as Persian digits on the form. */
export const CODE_LENGTH = 6
export const CODE_RADIX = 10

/**
 * The lifetime §10's "minutes" names.
 *
 * Five minutes, not a minute, because the text message's own latency is not under
 * the product's control; a shorter window would expire a code that was issued and
 * texted and simply not delivered yet.
 */
export const CODE_TTL_MS = 5 * 60 * 1000

/** §10's attempt counter, exhausted. Three is the budget the entropy assumes. */
export const MAX_CODE_ATTEMPTS = 3

/**
 * §10's rate limits, per mobile and per IP.
 *
 * One challenge per mobile per minute, and five per IP per minute — a shared
 * device or a small office is not locked out by a handful of legitimate requests,
 * but a script enumerating mobiles is. The window is a minute rather than a
 * sliding interval because the check counts rows written in that wall-clock
 * minute, and a sliding interval would need a row for every request to have
 * anything to slide over.
 */
export const RATE_LIMIT = {
  perMobilePerMinute: 1,
  perIpPerMinute: 5,
} as const

/**
 * The id of a challenge a login may not present — the sentinel for a mobile the
 * tenant does not know.
 *
 * §10's enumeration rule means the function that issues a challenge cannot return
 * nothing: the caller would branch on it and the branch would be the leak. So the
 * unknown-mobile path returns a real `OtpChallenge` whose `id` is this constant,
 * and the login looks the challenge up the same way either way. The login fails for
 * it with the same key as a wrong code, because there is no code to be right about.
 */
export const UNKNOWN_CHALLENGE_ID = 'otp-challenge-unknown'

/**
 * Generates a six-digit code.
 *
 * Exported for the test that proves the shape of a code is fixed, and used by no
 * other caller — the caller that needed a code would be a caller that had a reason
 * to know one.
 */
export function generateCode(): string {
  const max = CODE_RADIX ** CODE_LENGTH
  return randomInt(max).toString(CODE_RADIX).padStart(CODE_LENGTH, '0')
}

/**
 * The SHA-256 hex of a code, as the `OtpChallenge.codeHash` column stores it.
 *
 * The same reasoning as the session token in `core/db/context.ts`: a database
 * disclosure hands over hashes, and a hash of a six-digit code is not the code —
 * and `hashToken` is reused for exactly that reason rather than reimplemented with
 * a second salt scheme to keep consistent.
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}
