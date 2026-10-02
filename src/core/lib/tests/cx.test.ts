/**
 * `cx` is five lines, and the reason it has a test is the same reason it exists:
 * the two ways of joining class names that a component author reaches for first —
 * a template literal and a `.filter(Boolean).join(' ')` written inline — both have
 * a failure mode that is invisible until something compares the whole `class`
 * attribute. A trailing space from `` `${base} ${conditional}` `` where the
 * conditional is empty produces `class="icon "`, which `toHaveClass` tolerates and
 * a snapshot does not.
 *
 * So the tests below are mostly about what `cx` *drops*.
 */

import { describe, expect, it } from 'vitest'

import { cx } from '../cx'

describe('cx', () => {
  it('joins the given names with a single space', () => {
    expect(cx('icon', 'mirrored')).toBe('icon mirrored')
  })

  it('preserves order, so the base class stays first', () => {
    // Load-bearing: `Icon` puts its own class first and the caller's `className`
    // last, which is the order a stylesheet's specificity expects.
    expect(cx('a', 'b', 'c')).toBe('a b c')
  })

  it('returns an empty string for no arguments', () => {
    expect(cx()).toBe('')
  })

  it('returns a single name unchanged, with no padding', () => {
    expect(cx('icon')).toBe('icon')
  })

  it.each([
    ['false, which is what a short-circuited `&&` produces', false],
    ['null', null],
    ['undefined, which is what an absent prop produces', undefined],
    ['an empty string', ''],
  ] as const)('drops %s', (_description, value) => {
    expect(cx('icon', value)).toBe('icon')
  })

  it('leaves no trailing space when the last value is dropped', () => {
    // The specific defect this function exists to prevent: a template literal
    // would render `class="icon "` here.
    expect(cx('icon', false)).not.toMatch(/\s$/)
  })

  it('leaves no double space when a middle value is dropped', () => {
    expect(cx('a', false, 'b')).toBe('a b')
  })

  it('keeps a name that contains a space, without re-splitting it', () => {
    // A component may pass a whole list it built itself. Treating it as one value
    // is the documented contract; splitting it would be a second, undocumented
    // normalisation that a caller cannot see.
    expect(cx('a b', 'c')).toBe('a b c')
  })

  it('is not confused by a name that is only whitespace', () => {
    // Not dropped: `' '` is truthy and is the caller's business. Stated as a test
    // because the alternative — trimming — would silently change a caller's value.
    expect(cx('a', ' ', 'b')).toBe('a   b')
  })
})
