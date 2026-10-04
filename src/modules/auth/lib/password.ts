/**
 * Staff passwords — `09-security.md` §10.
 *
 * > Staff login | Mobile or username + password. Passwords hashed with a
 * > memory-hard algorithm (Argon2id); never reversible; never logged.
 *
 * ## Why the comparison is constant-time
 *
 * A `===` on two hashes is not timing-safe, and while the hash of a wrong
 * password is not the password, the timing of the comparison is still a signal
 * about how much of the two strings matched. `timingSafeEqual` removes it. This is
 * the one place in the product where a comparison is done on a secret-adjacent
 * value, so it is the one place the helper is used.
 *
 * ## The parameters
 *
 * `@node-rs/argon2`'s defaults are the library's recommended ones (19456 KiB,
 * parallelism 2, iterations 3 — the same numbers the `argon2` CLI ships). They
 * are not tuned here and the document does not name values, because a parameter
 * that left this file would have to be stored beside every hash to stay
 * reproducible, and a hash that cannot be reproduced is a hash that cannot be
 * verified.
 *
 * ## What is deliberately not here
 *
 * Verification that the password is *good*. §10 states the storage rule; the
 * strength policy is a `staff`-module concern, because the manager who sets a
 * password is the person the rule is written for, and a login module that refused
 * a weak password would be refusing the wrong person at the wrong moment.
 *
 * The hash function itself is not exported. The seed writes password hashes and
 * the `staff` module writes them, and both reach for `hashPassword` — but a module
 * that imports this file to *verify* a password cannot accidentally get a
 * hashing function that makes a wrong thing right, because `verifyPassword` is the
 * only name it sees.
 */

import { timingSafeEqual } from 'node:crypto'

/** A hash produced by `hashPassword`, as the `User.passwordHash` column stores it. */
export type PasswordHash = string

/**
 * Hashes a password with Argon2id.
 *
 * Exported for the seed and for `staff`'s write path, which are the two places a
 * password comes from a person. Those are not in this module because a login
 * module that could also create a password would be a module with a write path a
 * login attempt could reach.
 */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const { hash } = await import('@node-rs/argon2')
  return hash(password)
}

/**
 * Verifies a password against a stored hash.
 *
 * `false`, never an error, for a hash the library cannot parse: a malformed row is
 * not a password the user can correct from a login screen, and throwing would put
 * a 500 on a database row a developer hand-edited.
 */
export async function verifyPassword(password: string, hash: PasswordHash): Promise<boolean> {
  try {
    const { verify } = await import('@node-rs/argon2')
    return await verify(hash, password)
  } catch {
    return false
  }
}

/**
 * The memory-safe comparison for the hash of a one-time code (§10: "Only a hash
 * of the code is stored").
 *
 * The same timing argument as a password, on the same kind of value. Exported
 * because the OTP check lives in a different file and the two must not drift into
 * two different comparisons.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
