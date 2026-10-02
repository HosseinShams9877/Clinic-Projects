/**
 * The branded identifiers and the `Rial` amount.
 *
 * `05-conventions.md` §2 makes these constructors "the code that has to be right",
 * because a brand is a compile-time claim that a value came from a trusted place
 * and this file *is* that place. The type system does the rest: a test cannot
 * assert that `asTenantId(...)` fails to assign to a `ClinicId`, because that code
 * does not compile — which is the point, and why the assertions below are about
 * what the constructors **do at runtime** instead.
 *
 * What happens at runtime matters more than it looks. `TenantId` reaches an RLS
 * session variable and a Prisma `where` clause, so an empty string here is a tenant
 * filter that matches nothing (fail-closed, and correct) or, worse, a filter
 * someone "fixes" by dropping it. And an over-long identifier is almost always a
 * whole JSON body passed where an id was expected — the mistake §2's limit exists
 * to catch at the boundary, where the message can say so, rather than in a database
 * error nobody can read.
 *
 * `asRial` is deliberately **not** validated. It is a cast and nothing more: a
 * `bigint` is already an integer, `§8` already forbids storing a negative amount
 * (`06-constants.md` §8 makes debt a positive amount with a direction), and a
 * "helpful" check here would be a second place the money rule lives. The assertion
 * below records that decision so it is not mistaken for an omission.
 */

import { describe, expect, it } from 'vitest'

import {
  MAX_IDENTIFIER_LENGTH,
  asClinicId,
  asCustomerId,
  asRial,
  asTenantId,
  asUserId,
  type Rial,
} from '../index'

/** Every constructor, with the `kind` its message names. */
const STRING_CONSTRUCTORS = [
  { name: 'asTenantId', build: asTenantId, kind: 'TenantId' },
  { name: 'asClinicId', build: asClinicId, kind: 'ClinicId' },
  { name: 'asUserId', build: asUserId, kind: 'UserId' },
  { name: 'asCustomerId', build: asCustomerId, kind: 'CustomerId' },
] as const

/* ── Identifiers ──────────────────────────────────────────────────────────── */

describe.each(STRING_CONSTRUCTORS)('$name', ({ build, kind }) => {
  it('keeps a well-formed identifier unchanged', () => {
    expect(build('cln_2f9a1c')).toBe('cln_2f9a1c')
  })

  it('trims the surrounding whitespace a form or a URL produces', () => {
    // A trailing newline from a textarea, or a space from a query string, must not
    // become part of a primary key.
    expect(build('  cln_2f9a1c  ')).toBe('cln_2f9a1c')
    expect(build('\tcln_2f9a1c\n')).toBe('cln_2f9a1c')
  })

  it('accepts an identifier exactly at the length limit', () => {
    const longest = 'a'.repeat(MAX_IDENTIFIER_LENGTH)
    expect(build(longest)).toBe(longest)
    expect(build(longest)).toHaveLength(MAX_IDENTIFIER_LENGTH)
  })

  it('rejects an identifier one character over the limit, naming the kind', () => {
    // Over-long means a caller passed a whole JSON body where an id was expected.
    // The message has to say which id and by how much, or the defect is diagnosed
    // from a database error instead of from the line that caused it.
    const tooLong = 'a'.repeat(MAX_IDENTIFIER_LENGTH + 1)
    expect(() => build(tooLong)).toThrow(TypeError)
    expect(() => build(tooLong)).toThrow(new RegExp(kind))
    expect(() => build(tooLong)).toThrow(/at most 64 characters, received 65/)
  })

  it('rejects an empty string', () => {
    expect(() => build('')).toThrow(TypeError)
    expect(() => build('')).toThrow(new RegExp(`${kind} must not be empty`))
  })

  it('rejects a string that is only whitespace', () => {
    // The trim runs first, so this is the same failure as the empty case and not a
    // one-character identifier made of a space.
    expect(() => build('   ')).toThrow(TypeError)
    expect(() => build('\t\n ')).toThrow(TypeError)
  })

  it('measures length after trimming, not before', () => {
    // Padding a 64-character id with spaces pushes the raw string past the limit
    // while the value itself is legal. The trimmed value is what reaches the
    // database, so the trimmed value is what is measured.
    const padded = `  ${'a'.repeat(MAX_IDENTIFIER_LENGTH)}  `
    expect(padded.length).toBeGreaterThan(MAX_IDENTIFIER_LENGTH)
    expect(build(padded)).toHaveLength(MAX_IDENTIFIER_LENGTH)
  })

  it('does not validate existence, only shape', () => {
    // The constructors are a parse, not a lookup. A well-formed id for a tenant that
    // does not exist is still a `TenantId`; whether the row is there is the
    // database's answer and is never assumed from a parse.
    expect(build('no-such-tenant')).toBe('no-such-tenant')
  })

  it('returns a primitive string, so it survives structured serialisation', () => {
    // These values are posted into query keys, cached by TanStack Query, sent to the
    // worker and written into RLS session variables. A wrapper object would compare
    // unequal against itself in a cache key and would not round-trip through JSON.
    const id = build('cln_2f9a1c')
    expect(typeof id).toBe('string')
    expect(JSON.parse(JSON.stringify({ id }))).toEqual({ id: 'cln_2f9a1c' })
    expect(id).toBe('cln_2f9a1c')
  })
})

/* ── Money ────────────────────────────────────────────────────────────────── */

describe('asRial', () => {
  it('brands a bigint without touching its value', () => {
    const amount = asRial(5_000_000n)
    expect(amount).toBe(5_000_000n)
    expect(typeof amount).toBe('bigint')
  })

  it('keeps a bigint a bigint, so no float is introduced', () => {
    // §8: "never a float, never a JS `Number`… A `number` appearing anywhere near an
    // amount is a finding." The signature only accepts a `bigint`, and this records
    // that the value that comes out is still one — a `Rial` that had become a
    // `number` on the way through would be a wrong number on a screen above 2^53.
    const amount = asRial(9_007_199_254_740_993n) // 2^53 + 1, unrepresentable as a Number
    expect(typeof amount).toBe('bigint')
    expect(amount).toBe(9_007_199_254_740_993n)
  })

  it('accepts zero and a negative amount, because neither is its job to refuse', () => {
    // A zero balance is ordinary — `06-constants.md` §8 computes a balance and never
    // stores one. A negative value is a report's difference between two amounts, and
    // §8's rule is about what is *stored*: debt is a positive amount with a
    // direction. Refusing either here would put the money rule in two places.
    expect(asRial(0n)).toBe(0n)
    expect(asRial(-5_000_000n)).toBe(-5_000_000n)
  })

  it('is a cast, not a conversion — the value it is given is the value it returns', () => {
    // Stated as an assertion rather than a comment so that a later "improvement" that
    // started rounding or dividing here — the Rial-to-Toman conversion, for instance,
    // which belongs in `formatMoney` — fails this test instead of silently shipping.
    for (const value of [0n, 1n, 10n, 15n, 5_000_000n, -15n]) {
      const branded: Rial = asRial(value)
      expect(branded).toBe(value)
    }
  })
})

/* ── The limit itself ─────────────────────────────────────────────────────── */

describe('MAX_IDENTIFIER_LENGTH', () => {
  it('is 64, which leaves room over the 24–25 characters the generators produce', () => {
    // `cuid2` produces 24 characters and Prisma's `cuid()` 25. The limit is a guard
    // against a whole JSON body arriving where an id was expected, so it has to sit
    // well above a real identifier and well below a body — and it is asserted here so
    // that lowering it into the range of real ids fails loudly.
    expect(MAX_IDENTIFIER_LENGTH).toBe(64)
    expect(MAX_IDENTIFIER_LENGTH).toBeGreaterThan(25)
  })
})
