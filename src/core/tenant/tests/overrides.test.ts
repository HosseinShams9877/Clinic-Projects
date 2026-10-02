/**
 * The membership-override reader.
 *
 * This is the only place a stored permission override becomes a value the
 * permission primitive can use, which makes it the one boundary where a corrupt
 * row could widen access rather than narrow it. The tests are therefore grouped
 * by the question that matters at each boundary: what a well-formed row becomes,
 * what a row from an older release becomes, and what a row that is not a row
 * becomes.
 *
 * The asymmetric rule the module documents — unknown slugs are dropped, a
 * malformed row throws — is asserted directly, because it is the kind of
 * asymmetry a later simplification would flatten into "always fall back to
 * empty" without noticing that the fallback discards `revoked` too.
 */

import { describe, expect, it } from 'vitest'

import { Permission } from '@/core/constants'
import { DomainError } from '@/core/types'

import { EMPTY_PERMISSION_OVERRIDES, parsePermissionOverrides } from '../index'

/** A well-formed stored row, as the column holds it on both engines. */
const stored = (granted: readonly string[], revoked: readonly string[]): string =>
  JSON.stringify({ granted, revoked })

/**
 * The error a call raised, or a failure if it returned instead.
 *
 * A local helper rather than a `try`/`catch` per test: asserting on an error's
 * properties needs the error out of the block, and a bare `catch` around several
 * assertions cannot tell "it did not throw" from "it threw and the assertion
 * failed".
 */
function capturedError(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw, and it returned')
}

describe('parsePermissionOverrides', () => {
  describe('a membership with no overrides', () => {
    // The three forms the column actually takes for "never edited": a nullable
    // column that was never written, and the empty string a `String` column
    // defaults to when a row is created without one.
    const absentRows: [string, unknown][] = [
      ['null', null],
      ['undefined', undefined],
      ['an empty string', ''],
    ]

    it.each(absentRows)('resolves %s to the shared empty set', (_label, raw) => {
      const parsed = parsePermissionOverrides(raw)

      expect(parsed.overrides).toBe(EMPTY_PERMISSION_OVERRIDES)
      expect(parsed.overrides.granted).toEqual([])
      expect(parsed.overrides.revoked).toEqual([])
      expect(parsed.unknown).toEqual([])
    })

    it('hands out a frozen set, so a caller cannot mutate the shared one', () => {
      expect(Object.isFrozen(EMPTY_PERMISSION_OVERRIDES)).toBe(true)
      expect(Object.isFrozen(EMPTY_PERMISSION_OVERRIDES.granted)).toBe(true)
      expect(Object.isFrozen(EMPTY_PERMISSION_OVERRIDES.revoked)).toBe(true)
    })
  })

  describe('a well-formed row', () => {
    it('reads the two sets from a JSON string', () => {
      const parsed = parsePermissionOverrides(
        stored([Permission.ManageCampaigns], [Permission.FollowUpDebt]),
      )

      expect(parsed.overrides.granted).toEqual([Permission.ManageCampaigns])
      expect(parsed.overrides.revoked).toEqual([Permission.FollowUpDebt])
      expect(parsed.unknown).toEqual([])
    })

    it('accepts a row that has already been parsed', () => {
      // A caller that read the column itself should not have to re-serialise it.
      const column = { granted: [Permission.ManageServices], revoked: [] }

      expect(parsePermissionOverrides(column).overrides.granted).toEqual([
        Permission.ManageServices,
      ])
    })

    it('keeps the stored order', () => {
      // The order is not semantic, but a reader comparing two screens deserves the
      // same order twice, and the set built downstream is insertion-ordered.
      const parsed = parsePermissionOverrides(
        stored([Permission.ManageUsers, Permission.ViewDebts], []),
      )

      expect(parsed.overrides.granted).toEqual([Permission.ManageUsers, Permission.ViewDebts])
    })

    it('reads an empty pair as a pair, not as the shared empty set', () => {
      // A row that exists and holds two empty arrays is a membership that was
      // edited and cleared. It is equal to the empty set but is not the frozen
      // constant, and a caller comparing by identity must not be told otherwise.
      const parsed = parsePermissionOverrides(stored([], []))

      expect(parsed.overrides).not.toBe(EMPTY_PERMISSION_OVERRIDES)
      expect(parsed.overrides).toEqual({ granted: [], revoked: [] })
      expect(parsed.unknown).toEqual([])
    })

    it('ignores a key it does not know', () => {
      // The column is JSON written by the product, and a later release adding a
      // third set would otherwise make this one read its own rows as malformed.
      const parsed = parsePermissionOverrides(
        JSON.stringify({ granted: [], revoked: [], note: 'written by hand' }),
      )

      expect(parsed.overrides).toEqual({ granted: [], revoked: [] })
    })
  })

  describe('a slug that is no longer a permission', () => {
    it('drops it from granted and reports it', () => {
      // Dropping a grant withholds access — the closed direction.
      const parsed = parsePermissionOverrides(
        stored(['manage_invoices', Permission.ManageUsers], []),
      )

      expect(parsed.overrides.granted).toEqual([Permission.ManageUsers])
      expect(parsed.unknown).toEqual(['manage_invoices'])
    })

    it('drops it from revoked and reports it', () => {
      // Unlike a grant, a revocation of a permission that no longer exists has
      // nothing left to withhold, so dropping it cannot widen access either.
      const parsed = parsePermissionOverrides(
        stored([], ['record_refund', Permission.FollowUpDebt]),
      )

      expect(parsed.overrides.revoked).toEqual([Permission.FollowUpDebt])
      expect(parsed.unknown).toEqual(['record_refund'])
    })

    it('reports both sets in one list, and keeps the distinction out of it', () => {
      // The caller logs the list. Which set a stale slug came from is not
      // something an operator can act on differently.
      const parsed = parsePermissionOverrides(stored(['gone_a'], ['gone_b']))

      expect(parsed.overrides).toEqual({ granted: [], revoked: [] })
      expect(parsed.unknown).toEqual(['gone_a', 'gone_b'])
    })
  })

  describe('a malformed row', () => {
    // The whole reason this branch exists. An empty set would discard `revoked`
    // as well as `granted`, so falling back would silently hand back every
    // permission the role default carries — a corrupt row would *widen* access.
    const malformedRows: [string, string][] = [
      ['the JSON does not parse', '{ not json'],
      ['granted is a string', '{"granted":"manage_users","revoked":[]}'],
      ['revoked is missing', '{"granted":[]}'],
      ['granted holds a number', '{"granted":[3],"revoked":[]}'],
      ['the row is an array', '[{"granted":[],"revoked":[]}]'],
      ['the row is a bare string', '"manage_users"'],
      ['the row is a number', '12'],
    ]

    it.each(malformedRows)('throws when %s', (_label, raw) => {
      expect(() => parsePermissionOverrides(raw)).toThrow(DomainError)
    })

    it('carries the catalog key and the DOMAIN code', () => {
      // The boundary renders the Persian sentence from the key, and the key has a
      // catalog entry — `catalog.test.ts` asserts every `CoreMessageKey` does.
      const error = capturedError(() => parsePermissionOverrides('{ not json'))

      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('DOMAIN')
      expect((error as DomainError).messageKey).toBe('error.malformedPermissionOverrides')
    })

    it('keeps the parse failure as the cause, never in the message', () => {
      // The message is English and internal; the cause is what a developer reads.
      // A JSON parse error quotes the column's contents, which is why it stays in
      // `cause` rather than being interpolated into a logged line.
      const error = capturedError(() => parsePermissionOverrides('{ not json'))

      expect((error as DomainError).cause).toBeInstanceOf(SyntaxError)
    })

    it('has no cause when the shape is wrong rather than the syntax', () => {
      // Nothing threw before the schema rejected it, so there is nothing to chain.
      const error = capturedError(() => parsePermissionOverrides('12'))

      expect((error as DomainError).cause).toBeUndefined()
    })
  })
})
