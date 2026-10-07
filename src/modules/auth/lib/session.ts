/**
 * Sessions — `09-security.md` §10.
 *
 * > Session | httpOnly, `Secure`, `SameSite=Lax` cookie; signed with
 * > `NEXTAUTH_SECRET`.
 * > Session fixation | The session identifier is rotated on successful login.
 * > Session lifetime | Absolute expiry plus idle expiry; server-side revocation
 * > works immediately.
 * > Logout | Server-side session invalidation, not just cookie clearing.
 *
 * ## Why the token is random and the column holds a hash
 *
 * The cookie carries a token the server generated with `randomUUID`; the column
 * holds `hashToken(token)`. A read of `sessions` therefore yields no credential —
 * the same property the one-time code has, for the same reason. The token is
 * unguessable in the sense that matters here (128 bits of entropy from the CSPRNG)
 * and the hash is the thing an attacker with a database dump does not have.
 *
 * ## Why the token is not the session id
 *
 * The row's `id` is the session's identity and the token is its proof. Rotating
 * the token on login is §10's fixation rule, and rotating it means writing a new
 * row and revoking the old — `rotatedAt` records the handover so a replayed old
 * token is visible in the audit trail rather than merely refused. If the token were
 * the id, rotation would be an `UPDATE` on the row the cookie still names, and a
 * client holding the old cookie would be indistinguishable from one holding the new.
 *
 * ## Why there is no idle-expiry column
 *
 * §10 names an absolute expiry and an idle expiry. The absolute expiry is
 * `expiresAt`, which the resolution compares against an injected clock. The idle
 * expiry is the same check against a *renewed* value on the request path, and the
 * renewal is a write of the row's own `expiresAt` — so it needs no column of its
 * own, and the schema does not carry a second date that could drift from the first.
 *
 * ## What is deliberately not here
 *
 * **The cookie.** Setting `httpOnly`/`Secure`/`SameSite=Lax` is a boundary
 * concern: this module hands a token to the caller and the route handler writes
 * the cookie, because a library function that touched the response object would be
 * a library function that could not be called from the worker, a Server Action and
 * a Route Handler with the same signature.
 *
 * **`customerId`.** The staff session and the customer session are the same row.
 * Whether the row belongs to a staff member or a customer is decided by which
 * relation the login resolved — a `User` for staff, a `Customer` for the panel —
 * and §7's customer panel takes its `customerId` from that resolution, never from
 * the request. A column on `Session` that the request could influence would be the
 * column §7 says cannot exist.
 */

import { randomUUID } from 'node:crypto'

import { asTenantId, type CustomerId, type TenantId, type UserId } from '@/core/types'

import { hashToken } from '@/core/db/context'

import type { PrismaClient } from '@/generated/prisma/client'

/** The name of the cookie the boundary sets (`installation.md` §4 documents it). */
export const SESSION_COOKIE = 'clinic-session'

/**
 * The absolute lifetime §10 names, applied at login.
 *
 * The ceiling a renewal cannot slide past: a session may be refreshed on the request
 * path for as long as the person keeps using it, but not past the day it was opened.
 * It is also the cookie's own `maxAge`, so the cookie does not outlive the row.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * §10's idle expiry — how long a session may sit unused before the next request on it
 * is refused.
 *
 * Shorter than the absolute lifetime on purpose: the two are different rules answering
 * different risks. The absolute lifetime bounds a token that leaked, and the idle
 * expiry bounds a session a person walked away from with the panel open — a clinic
 * workstation left signed in is §17's stated, accepted risk, and the idle window is
 * the product's half of controlling it. A fresh row carries this as its `expiresAt`,
 * and `renewSession` slides it forward on use.
 */
export const SESSION_IDLE_MS = 30 * 60 * 1000

/**
 * How much idle life has to be left before a renewal writes the row.
 *
 * Renewing on every request would be a write per page view for no gain; renewing only
 * when the remaining idle life has fallen below half the window keeps a person using
 * the panel continuously from ever being asked to sign in again, while still touching
 * the row at most twice per idle window.
 */
export const SESSION_RENEW_AT_MS = SESSION_IDLE_MS / 2

/**
 * A session row the boundary can set a cookie for.
 *
 * The token is handed to the caller and never stored; the row is what the server
 * keeps. The two are returned together for the same reason `newSessionToken()`
 * returns a pair — a caller that had the row without the token would be a caller
 * holding a hash it intended to set as a cookie.
 */
export interface OpenedSession {
  /** The cookie's value. Not stored anywhere. */
  readonly token: string
  /** The row's id, which is the session's identity rather than its proof. */
  readonly sessionId: string
  readonly tenantId: TenantId
  readonly expiresAt: Date
}

/**
 * Opens a session row for a principal a login just accepted.
 *
 * Exactly one of `userId` and `customerId` is set: a staff login resolves a
 * `User`, a customer login resolves a `Customer`, and the row's own columns make
 * the two mutually exclusive at rest.
 *
 * ## Rotation
 *
 * §10: "The session identifier is rotated on successful login." Rotation here is
 * a new row plus the revocation of every earlier row the principal holds, rather
 * than an `UPDATE` of the row the cookie still names — the comment at the top of
 * this file explains why the token is not the id. `rotatedAt` on the revoked rows
 * records the handover, so a replayed old token is visible in the audit trail
 * rather than merely refused.
 *
 * Takes an unscoped client, as the logins do: a session is opened before the
 * tenant scope exists, and the scope is what this row is about to establish.
 */
export async function openSession(args: {
  readonly client: PrismaClient
  readonly tenantId: TenantId
  readonly userId?: UserId
  readonly customerId?: CustomerId
  readonly now: Date
  /** The requesting address and user agent, kept on the row for the audit trail. */
  readonly ip: string
  readonly userAgent: string | null
}): Promise<OpenedSession> {
  const { client, tenantId, now, ip, userAgent } = args
  const { token, tokenHash } = newSessionToken()
  const expiresAt = sessionExpiresAt(now)

  // The principal whose earlier rows are being rotated away. Exactly one of the
  // two is set; the guard is the caller's, and the schema's columns are the
  // machine's.
  const ownerId = args.userId ?? args.customerId

  await client.session.updateMany({
    where: { OR: [{ userId: ownerId }, { customerId: ownerId }], revokedAt: null },
    data: { revokedAt: now, rotatedAt: now },
  })

  const session = await client.session.create({
    data: {
      tenantId,
      userId: args.userId ?? null,
      customerId: args.customerId ?? null,
      tokenHash,
      expiresAt,
      ip,
      userAgent,
    },
    select: { id: true },
  })

  return Object.freeze({
    token,
    sessionId: session.id,
    tenantId: asTenantId(tenantId),
    expiresAt,
  })
}

/**
 * Invalidates a session server-side and returns whether there was one.
 *
 * §10's logout rule: the row is revoked rather than the cookie cleared, so a
 * token a client still holds is dead on the next request. The boolean lets the
 * boundary distinguish "you were signed out" from "you were not signed in".
 *
 * Revoking an already-revoked row is not an error — it is a second logout button
 * press, and the row keeps the first `revokedAt` so the audit trail does not
 * move. `updateMany` returning zero means no row held that token.
 */
export async function revokeSession(args: {
  readonly client: PrismaClient
  readonly token: string
  readonly now: Date
}): Promise<boolean> {
  const { client, token, now } = args
  const result = await client.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: now },
  })
  return result.count > 0
}

/**
 * A fresh token, and the hash the column stores.
 *
 * One function returns the pair because the two are produced together and a caller
 * that had one without the other would be a caller holding a hash it intended to
 * set as a cookie — which is the bug the pair makes impossible to write.
 */
export function newSessionToken(): { readonly token: string; readonly tokenHash: string } {
  const token = randomUUID()
  return { token, tokenHash: hashToken(token) }
}

/**
 * The expiry a session created at `issuedAt` carries.
 *
 * A pure function of the clock so a test sets the lifetime by setting the clock,
 * and so the login and the renewal compute the same value from the same input. The
 * value is the **idle** deadline, which is what makes a row that has not been used
 * for `SESSION_IDLE_MS` fail the resolution's `expiresAt` check; the absolute
 * deadline is `createdAt + SESSION_TTL_MS`, which the renewal reads but never writes
 * past.
 */
export function sessionExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + SESSION_IDLE_MS)
}

/**
 * Slides a session's idle deadline forward on the request path, §10's "absolute
 * expiry plus idle expiry".
 *
 * Called from the panel's resolution after the token has already proved itself, so a
 * row this returns `false` for is a row whose clock answer the caller already has. It
 * never rewrites the absolute deadline: a session renewed repeatedly by a person who
 * keeps using the panel still dies on the day it was opened, which is what keeps a
 * leaked token from being refreshed into permanence.
 *
 * @returns the row's new expiry, or `null` when there was nothing to renew — no row,
 * a revoked or expired session, or idle life the renewal window has not reached yet.
 */
export async function renewSession(args: {
  readonly client: PrismaClient
  readonly token: string
  readonly now: Date
}): Promise<Date | null> {
  const { client, token, now } = args
  const row = await client.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
  })
  if (row === null) return null
  // An expired or revoked session is not renewed: the resolution has already refused
  // it, and sliding its deadline would be the fix a replay was looking for.
  if (row.revokedAt !== null || now.getTime() >= row.expiresAt.getTime()) return null
  // And a session with most of its idle life left is left alone, so a page view is
  // not a write.
  if (now.getTime() + SESSION_RENEW_AT_MS <= row.expiresAt.getTime()) return null

  const absolute = new Date(row.createdAt.getTime() + SESSION_TTL_MS)
  const renewed = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absolute.getTime()))
  if (renewed.getTime() <= row.expiresAt.getTime()) return null

  await client.session.update({ where: { id: row.id }, data: { expiresAt: renewed } })
  return renewed
}
