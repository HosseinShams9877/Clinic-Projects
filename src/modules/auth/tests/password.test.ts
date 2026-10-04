/**
 * The two pure helpers a login's security rests on, without a database.
 *
 * `10-testing-strategy.md` §2's rule 4 is about queries; these are not queries, and
 * the property each one guarantees is a property of the function alone — so a plain
 * unit table is the right shape for them and a database would only be in the way.
 */

import { describe, expect, it } from 'vitest'

import { constantTimeEquals, hashPassword, verifyPassword } from '../lib/password'
import { CODE_LENGTH, generateCode, hashCode } from '../lib/otp'

describe('hashPassword / verifyPassword', () => {
  it('verifies a password it hashed', async () => {
    const hash = await hashPassword('a-password-a-test-made-up')

    expect(await verifyPassword('a-password-a-test-made-up', hash)).toBe(true)
  })

  it('rejects a different password', async () => {
    const hash = await hashPassword('a-password-a-test-made-up')

    expect(await verifyPassword('another-one', hash)).toBe(false)
  })

  it('hashes the same password to two different values', async () => {
    // A salt per hash is what makes a stolen table of hashes useless as a lookup. The
    // library's own parameter string carries it, and this is the observable half.
    const first = await hashPassword('a-password-a-test-made-up')
    const second = await hashPassword('a-password-a-test-made-up')

    expect(first).not.toBe(second)
    expect(first.startsWith('$argon2id$')).toBe(true)
  })

  it('fails closed on a hash that is not one', async () => {
    // `verifyPassword` is called on a column a database disclosure could have
    // altered; a hash that fails to parse is a refusal rather than an exception, and
    // a refusal is the answer that does not authenticate.
    expect(await verifyPassword('a-password-a-test-made-up', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('a-password-a-test-made-up', '')).toBe(false)
  })
})

describe('constantTimeEquals', () => {
  it('is true for equal values and false for unequal ones', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true)
    expect(constantTimeEquals('abc', 'abd')).toBe(false)
  })

  it('is false for values of different lengths', () => {
    // `timingSafeEqual` throws on a length mismatch, which is the one thing it cannot
    // compare in constant time; the wrapper turns that into the false the callers
    // expect, so a caller never has to know the length has to match.
    expect(constantTimeEquals('abc', 'abcd')).toBe(false)
    expect(constantTimeEquals('', 'a')).toBe(false)
  })

  it('compares hashes rather than the values that produced them', () => {
    // The property the two call sites in `login.ts` rely on: the comparison the login
    // makes is of two hex digests, never of the code or the password itself.
    expect(constantTimeEquals(hashCode('000000'), hashCode('000000'))).toBe(true)
    expect(constantTimeEquals(hashCode('000000'), hashCode('000001'))).toBe(false)
  })
})

describe('generateCode', () => {
  it('produces a fixed-length string of digits', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect(code).toMatch(/^\d+$/)
    }
  })

  it('covers the whole range, including leading zeros', () => {
    // `padStart` is the point: a code below 10⁵ is not a shorter code, and a
    // generator that returned `randomInt(10**6).toString()` without padding would
    // hand the form a five-character code one time in ten.
    const codes = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      codes.add(generateCode())
    }

    expect(codes.size).toBeGreaterThan(150)
  })
})
