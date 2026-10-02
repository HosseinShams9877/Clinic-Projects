/**
 * The error classes.
 *
 * `05-conventions.md` §7 defines three of these and `09-security.md` §6.3 adds the
 * fourth, and the reason each one is a separate class rather than a code on one
 * error is that the **HTTP status differs**: a record outside the caller's scope is
 * a 404 and not a 403, because a 403 confirms the record exists and that is itself a
 * disclosure. So the mapping from class to status is a security boundary, and these
 * tests pin the four `code` values that mapping is written against.
 *
 * Two properties are asserted for every class because both are easy to get wrong and
 * both are load-bearing:
 *
 * - **`name` comes from `new.target.name`.** A stack trace and a log line are read by
 *   a person at two in the morning; «ValidationError» is worth more than «Error», and
 *   a subclass that forgot to pass its own name through would make every log entry
 *   identical.
 * - **`messageKey` is a catalog key, never a sentence.** §7.2 puts the Persian copy
 *   in the catalog and this file's own doc comment says so: "a Persian string in this
 *   file would be a second place Persian copy lives". Asserted by rejecting any
 *   Persian character in a message key, which is the shape a violation would take.
 */

import { describe, expect, it } from 'vitest'

import {
  AppError,
  AuthError,
  DomainError,
  NotFoundError,
  PermissionError,
  ValidationError,
  exhaustive,
  isAppError,
  type AppErrorOptions,
  type ErrorCode,
} from '../index'

/** Every concrete class, with the code it must carry. */
const CLASSES = [
  { name: 'ValidationError', build: ValidationError, code: 'VALIDATION' },
  { name: 'AuthError', build: AuthError, code: 'AUTH_REQUIRED' },
  { name: 'PermissionError', build: PermissionError, code: 'PERMISSION_DENIED' },
  { name: 'NotFoundError', build: NotFoundError, code: 'NOT_FOUND' },
  { name: 'DomainError', build: DomainError, code: 'DOMAIN' },
] as const

const OPTIONS: AppErrorOptions = { messageKey: 'validation.localDate.invalid' }

/* ── The five classes ─────────────────────────────────────────────────────── */

describe.each(CLASSES)('$name', ({ build, code }) => {
  it('carries its own code, which is what the HTTP mapping reads', () => {
    const error = new build('internal English message', OPTIONS)
    expect(error.code).toBe(code)
  })

  it('names itself in a stack trace rather than saying "Error"', () => {
    // `this.name = new.target.name` in the base constructor. Without it every
    // subclass logs as «Error» and the five classes become indistinguishable in the
    // one place someone is reading them under pressure.
    const error = new build('internal English message', OPTIONS)
    expect(error.name).toBe(build.name)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(build.name).not.toBe('Error')
  })

  it('carries the catalog key through unchanged', () => {
    const error = new build('internal English message', OPTIONS)
    expect(error.messageKey).toBe('validation.localDate.invalid')
  })

  it('keeps its message in English and its key out of the catalog', () => {
    // The division of labour: the message is for a log, the key is for the screen.
    // A Persian character in either field here means someone has started writing
    // user-facing copy in the exception, which is the second-copy problem §7.2 names.
    const error = new build('A Jalali month must be between 1 and 12', OPTIONS)
    expect(error.messageKey).not.toMatch(/[؀-ۿ]/)
    expect(error.message).toBe('A Jalali month must be between 1 and 12')
  })

  it('defaults the params and the detail to empty records, never undefined', () => {
    // The boundary and the logger both read these without a null check. `undefined`
    // would force one at every call site, and a missed one is a crash in the error
    // handler — the worst place for a second failure.
    const error = new build('internal English message', OPTIONS)
    expect(error.messageParams).toEqual({})
    expect(error.detail).toEqual({})
    expect(error.messageParams).not.toBeUndefined()
    expect(error.detail).not.toBeUndefined()
  })

  it('has no cause when none was supplied', () => {
    // The base constructor passes `undefined` rather than `{ cause: undefined }`, so
    // an error with no cause does not claim to have one.
    const error = new build('internal English message', OPTIONS)
    expect(error.cause).toBeUndefined()
  })

  it('keeps the params and the detail it is given', () => {
    const error = new build('internal English message', {
      messageKey: 'validation.localDate.outOfRange',
      messageParams: { min: '1300', max: '1500' },
      detail: { field: 'scheduledAt', received: 1299 },
    })
    expect(error.messageParams).toEqual({ min: '1300', max: '1500' })
    expect(error.detail).toEqual({ field: 'scheduledAt', received: 1299 })
  })

  it('preserves a cause it is given, so a wrapped failure is not lost', () => {
    // The branch the previous test does not reach: `options.cause` present. A driver
    // error swallowed without its cause is a defect nobody can diagnose from the
    // outer message alone.
    const cause = new RangeError('SQLITE_CONSTRAINT: UNIQUE constraint failed')
    const error = new build('internal English message', { ...OPTIONS, cause })
    expect(error.cause).toBe(cause)
    expect(error.cause).toBeInstanceOf(RangeError)
  })

  it('survives a falsy cause, which the undefined check must not treat as absent', () => {
    // `options.cause === undefined` rather than `!options.cause`, deliberately: a
    // thrown empty string or a thrown `0` is a cause someone wrote on purpose.
    const error = new build('internal English message', { ...OPTIONS, cause: '' })
    expect(error.cause).toBe('')
  })

  it('is caught by isAppError and is an instance of its own class', () => {
    const error = new build('internal English message', OPTIONS)
    expect(isAppError(error)).toBe(true)
    expect(error).toBeInstanceOf(build)
  })
})

/* ── The classes are distinguishable ──────────────────────────────────────── */

describe('the five classes', () => {
  it('carry five distinct codes', () => {
    const codes = CLASSES.map(({ build }) => new build('m', OPTIONS).code) as ErrorCode[]
    expect(new Set(codes).size).toBe(CLASSES.length)
    expect([...codes].sort()).toEqual([
      'AUTH_REQUIRED',
      'DOMAIN',
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION',
    ])
  })

  it('are not interchangeable, which is why the 403/404 split is expressible', () => {
    // `09-security.md` §6.3: a record outside the caller's scope is a 404, because a
    // 403 confirms it exists. That rule is only enforceable if the two are different
    // classes at runtime and not merely different strings.
    const denied = new PermissionError('Not permitted', { messageKey: 'error.permissionDenied' })
    const missing = new NotFoundError('Not found', { messageKey: 'error.notFound' })
    expect(denied).not.toBeInstanceOf(NotFoundError)
    expect(missing).not.toBeInstanceOf(PermissionError)
    expect(denied.code).not.toBe(missing.code)
  })
})

/* ── The base class ───────────────────────────────────────────────────────── */

describe('AppError', () => {
  it('is abstract at the type level and has no abstract members at runtime', () => {
    // A subclass with a third constructor argument pattern, or a fourth class, must
    // get the same behaviour by inheriting. The only way to reach the base directly
    // is a subclass, which is what the loop above does — so this asserts the
    // inheritance chain rather than an instantiation the type system forbids.
    const error = new DomainError('m', OPTIONS)
    expect(Object.getPrototypeOf(DomainError.prototype)).toBe(AppError.prototype)
    expect(Object.getPrototypeOf(error)).toBe(DomainError.prototype)
  })
})

/* ── isAppError ───────────────────────────────────────────────────────────── */

describe('isAppError', () => {
  it('accepts every class in the hierarchy', () => {
    for (const { build } of CLASSES) {
      expect(isAppError(new build('m', OPTIONS))).toBe(true)
    }
  })

  it('rejects a plain Error, a subclass of it, and a look-alike object', () => {
    // A plain `Error` is a defect that escaped the layer, and the boundary must not
    // treat it as a handled one — it has no `messageKey` to render, and the fallback
    // sentence is what stops an internal message reaching a user.
    expect(isAppError(new Error('boom'))).toBe(false)
    expect(isAppError(new RangeError('boom'))).toBe(false)
    expect(
      isAppError({
        code: 'VALIDATION',
        messageKey: 'validation.localDate.invalid',
        message: 'looks right',
      }),
    ).toBe(false)
  })

  it('rejects every non-error a catch block can receive', () => {
    // `catch (error)` is typed `unknown` for a reason: a string, a `null` or a
    // rejected promise value all arrive here, and a type guard that threw on one of
    // them would fail inside the handler.
    for (const value of [undefined, null, '', 0, Number.NaN, false, Symbol('x'), {}, [], () => {}]) {
      expect(isAppError(value)).toBe(false)
    }
  })
})

/* ── exhaustive ───────────────────────────────────────────────────────────── */

describe('exhaustive', () => {
  it('throws a DomainError naming the case and the context', () => {
    // `05-conventions.md` §2: used in a `switch` over a union so that adding a member
    // without handling it fails to compile. The runtime throw is the backstop for a
    // value that arrived from outside the type system — a database string, a query
    // parameter — and both halves of the message matter: the context says where, the
    // value says what.
    expect(() => exhaustive('weekday' as never, 'formatDate style')).toThrow(DomainError)
    expect(() => exhaustive('weekday' as never, 'formatDate style')).toThrow(
      'Unhandled case in formatDate style: weekday',
    )
  })

  it('carries the catalog key the boundary renders from', () => {
    // The one key raised from outside the localization layer, which is why its
    // sentence lives in `catalog/common.ts` — §14 of `05-conventions.md` makes a
    // Persian literal outside the catalog a finding, and an exception is not exempt.
    try {
      exhaustive(undefined as never, 'an unhandled union member')
      expect.unreachable('exhaustive must always throw')
    } catch (error) {
      expect(isAppError(error)).toBe(true)
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('DOMAIN')
      expect((error as DomainError).messageKey).toBe('error.unhandledCase')
    }
  })

  it('renders an exotic value without throwing a second error', () => {
    // The value is interpolated with `String(...)`, which is total: a symbol, a
    // null-prototype object or a circular structure must not make the error handler
    // throw while building its own message.
    expect(() => exhaustive(Symbol('member') as never, 'a switch')).toThrow(DomainError)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => exhaustive(circular as never, 'a switch')).toThrow(DomainError)
    expect(() => exhaustive(null as never, 'a switch')).toThrow(
      'Unhandled case in a switch: null',
    )
  })

  it('is assignable where a never-returning function is expected', () => {
    // The whole point of the `never` return type: it satisfies the exhaustiveness
    // check in a `switch`, so a new union member turns into a compile error rather
    // than a fall-through. Asserted by using it in the position the compiler checks.
    const describeStyle = (style: 'short' | 'long'): string => {
      switch (style) {
        case 'short':
          return '۱۴۰۵/۰۶/۲۹'
        case 'long':
          return '۲۹ شهریور ۱۴۰۵'
        default:
          return exhaustive(style, 'describeStyle')
      }
    }
    expect(describeStyle('short')).toBe('۱۴۰۵/۰۶/۲۹')
    expect(describeStyle('long')).toBe('۲۹ شهریور ۱۴۰۵')
  })
})
