/**
 * ویرایش موقتِ یک مرحله از قسط — توکن‌هایی که در `note` قسط نگه داشته می‌شوند.
 *
 * پنل اجازه می‌دهد کاربر تاریخ یا مبلغ **یک مرحله** را موقتاً تغییر دهد، بدون اینکه
 * سررسیدهای ثابتِ مراحل بعد را جابجا کند. قرارداد این است:
 *
 * - `OVERRIDE:YYYY-MM-DD` تاریخ جلالیِ سررسید موقت است و `OVERRIDE_AMOUNT:<ریال>` مبلغ
 *   موقتِ همین مرحله.
 * - هر دو فقط تا زمانی خوانده می‌شوند که `paidAmount === 0n` باشد؛ بعد از پرداخت،
 *   سررسید استاندارد (اولین سررسید + تعداد پرداختی × بازه) دیده می‌شود.
 * - «بازتعریف کل بدهی» باید توکن‌ها را از noteی طرح جدید پاک کند، چون ویرایش موقت
 *   مربوط به مرحله‌ی قبل است، نه به طرح جدید.
 *
 * این مجموعه روی خود توکن‌ها تمرکز دارد: خواندنِ معتبر/نامعتبر، پاک‌سازی و ساختن.
 * قانونِ «فقط هنگام پرداخت‌نشده» در جای خواندن (جدول‌ها و صفحه‌ها) اعمال می‌شود و
 * مجموعه‌ی `reinstallment.test.ts` روی همان قانون در Server Action کار می‌کند.
 */

import { describe, expect, it } from 'vitest'

import {
  effectiveAmount,
  effectiveDueInstant,
  legacyTotalInNote,
  overrideAmountInNote,
  overrideDueInNote,
  overrideDueInstant,
  overrideDueLocalDate,
  stripOverrideTokens,
  withOverrideTokens,
} from './installment-overrides'
import { fromClockParts, asLocalDate, toUtcInstant } from '@/core/localization'

const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

describe('overrideDueInNote — خواندنِ تاریخ موقت', () => {
  it('returns the Jalali date when the token is present and valid', () => {
    expect(overrideDueInNote('OVERRIDE:1405-08-15')).toBe('1405-08-15')
    expect(overrideDueInNote('OVERRIDE:1405-08-15 یادداشت ریسپشن')).toBe('1405-08-15')
  })

  it('returns null when the token is absent', () => {
    expect(overrideDueInNote(null)).toBeNull()
    expect(overrideDueInNote('')).toBeNull()
    expect(overrideDueInNote('یادداشت بدون توکن')).toBeNull()
    expect(overrideDueInNote('OVERRIDE_AMOUNT:3000000')).toBeNull()
  })

  it('returns null when the token carries a date that is not a Jalali date', () => {
    // ۱۴۰۵-۰۷-۳۱ وجود ندارد: ماه‌های ۱ تا ۶ سی‌ویک روزه هستند.
    expect(overrideDueInNote('OVERRIDE:1405-07-31')).toBeNull()
    expect(overrideDueInNote('OVERRIDE:1405-13-01')).toBeNull()
    expect(overrideDueInNote('OVERRIDE:not-a-date')).toBeNull()
  })

  it('reads only the first token when a note carries more than one', () => {
    expect(overrideDueInNote('OVERRIDE:1405-08-15 OVERRIDE:1405-09-01')).toBe('1405-08-15')
  })
})

describe('overrideDueLocalDate / overrideDueInstant — تبدیلِ تاریخ موقت', () => {
  it('brands the Jalali date as a LocalDate', () => {
    expect(overrideDueLocalDate('OVERRIDE:1405-08-15')).toBe('1405-08-15')
    expect(overrideDueLocalDate(null)).toBeNull()
  })

  it('builds the midnight instant at the given offset', () => {
    const instant = overrideDueInstant('OVERRIDE:1405-08-15', MIDNIGHT, 210)
    expect(instant).toEqual(toUtcInstant(asLocalDate('1405-08-15'), MIDNIGHT, 210))
    // ۱۵ آبان ۱۴۰۵ = ۲۰۲۶-۱۱-۰۶ در UTC+۳:۳۰ → نیمه‌شبِ UTC برابر ۲۰:۳۰ روز قبل.
    expect(instant!.toISOString()).toBe('2026-11-05T20:30:00.000Z')
  })

  it('falls back to the localization default when no offset is passed', () => {
    expect(overrideDueInstant('OVERRIDE:1405-08-15', MIDNIGHT)).toEqual(
      toUtcInstant(asLocalDate('1405-08-15'), MIDNIGHT),
    )
  })

  it('returns null instead of throwing for an invalid token', () => {
    expect(overrideDueInstant('OVERRIDE:1405-07-31', MIDNIGHT)).toBeNull()
  })
})

describe('overrideAmountInNote — خواندنِ مبلغ موقت', () => {
  it('returns the rial amount when the token is present', () => {
    expect(overrideAmountInNote('OVERRIDE:1405-08-15 OVERRIDE_AMOUNT:3000000')).toBe(3_000_000n)
    expect(overrideAmountInNote('OVERRIDE_AMOUNT:0')).toBe(0n)
  })

  it('returns null when the token is absent', () => {
    expect(overrideAmountInNote(null)).toBeNull()
    expect(overrideAmountInNote('OVERRIDE:1405-08-15')).toBeNull()
    expect(overrideAmountInNote('OVERRIDE_AMOUNT:')).toBeNull()
  })

  it('parses only digits, so a Persian-digit token is not half-read', () => {
    expect(overrideAmountInNote('OVERRIDE_AMOUNT:۳۰۰۰۰۰۰')).toBeNull()
  })
})

describe('stripOverrideTokens — پاک‌سازی برای طرح جدید', () => {
  it('removes both tokens and keeps the rest of the note', () => {
    expect(stripOverrideTokens('OVERRIDE:1405-08-15 OVERRIDE_AMOUNT:3000000 یادداشت')).toBe('یادداشت')
  })

  it('collapses the whitespace the tokens leave behind', () => {
    expect(stripOverrideTokens('OVERRIDE:1405-08-15   یادداشت')).toBe('یادداشت')
  })

  it('returns null when nothing but tokens (or nothing) was there', () => {
    expect(stripOverrideTokens(null)).toBeNull()
    expect(stripOverrideTokens('')).toBeNull()
    expect(stripOverrideTokens('OVERRIDE:1405-08-15 OVERRIDE_AMOUNT:3000000')).toBeNull()
  })

  it('leaves a note without tokens untouched (trimmed)', () => {
    expect(stripOverrideTokens('  یادداشت ریسپشن  ')).toBe('یادداشت ریسپشن')
  })
})

describe('withOverrideTokens — نوشتنِ ویرایش موقت', () => {
  it('writes both tokens in front of the existing note', () => {
    expect(withOverrideTokens('یادداشت', '1405-08-15', 3_000_000n)).toBe(
      'OVERRIDE:1405-08-15 OVERRIDE_AMOUNT:3000000 یادداشت',
    )
  })

  it('builds a note from nothing', () => {
    expect(withOverrideTokens(null, '1405-08-15', 3_000_000n)).toBe(
      'OVERRIDE:1405-08-15 OVERRIDE_AMOUNT:3000000',
    )
  })

  it('replaces the previous override instead of stacking a second one', () => {
    const note = withOverrideTokens('OVERRIDE:1405-08-15 OVERRIDE_AMOUNT:3000000', '1405-09-01', 2_500_000n)
    expect(note).toBe('OVERRIDE:1405-09-01 OVERRIDE_AMOUNT:2500000')
    // یک توکنِ تاریخ و یک توکنِ مبلغ — نه دو تا.
    expect(note!.match(/OVERRIDE:/g)).toHaveLength(1)
    expect(note!.match(/OVERRIDE_AMOUNT:/g)).toHaveLength(1)
  })

  it('round-trips through the readers', () => {
    const note = withOverrideTokens('یادداشت ریسپشن', '1405-08-15', 3_000_000n)
    expect(overrideDueInNote(note)).toBe('1405-08-15')
    expect(overrideAmountInNote(note)).toBe(3_000_000n)
    expect(stripOverrideTokens(note)).toBe('یادداشت ریسپشن')
  })
})

describe('legacyTotalInNote — طرحِ قسطیِ قدیمی در سایه‌ی توکن‌های ویرایش', () => {
  it('reads the legacy TOTAL token from a clean note', () => {
    expect(legacyTotalInNote('TOTAL:6:قسط:18000000')).toEqual({ count: 6, amount: 18_000_000n })
  })

  it('keeps reading TOTAL after a temporary edit prepended the override tokens', () => {
    // `withOverrideTokens` توکن‌ها را قبل از note می‌نویسد — startsWith('TOTAL:')
    // دیگر کار نمی‌کند، ولی طرحِ قسطی باید همچنان دیده شود.
    const note = withOverrideTokens('TOTAL:6:قسط:18000000', '1405-09-01', 3_500_000n)
    expect(legacyTotalInNote(note)).toEqual({ count: 6, amount: 18_000_000n })
  })

  it('falls back to the given amount when the legacy token carries none', () => {
    expect(legacyTotalInNote('TOTAL:4:قسط', 12_000_000n)).toEqual({ count: 4, amount: 12_000_000n })
    expect(legacyTotalInNote(withOverrideTokens('TOTAL:4:قسط', '1405-09-01', 3_000_000n), 12_000_000n)).toEqual(
      { count: 4, amount: 12_000_000n },
    )
  })

  it('returns null for notes without the legacy token', () => {
    expect(legacyTotalInNote(null)).toBeNull()
    expect(legacyTotalInNote('یادداشت ریسپشن')).toBeNull()
    expect(legacyTotalInNote(withOverrideTokens('یادداشت', '1405-09-01', 3_000_000n))).toBeNull()
  })
})

describe('effectiveDueInstant / effectiveAmount — قانونِ «فقط هنگام پرداخت‌نشده»', () => {
  const anchored = toUtcInstant(asLocalDate('1405-06-01'), MIDNIGHT)

  it('applies the temporary date and amount while the stage is unpaid', () => {
    const note = withOverrideTokens('یادداشت', '1405-08-15', 3_000_000n)
    const due = effectiveDueInstant(note, 0n, anchored, MIDNIGHT)
    expect(due).toEqual(toUtcInstant(asLocalDate('1405-08-15'), MIDNIGHT))
    expect(effectiveAmount(note, 0n, 2_500_000n)).toBe(3_000_000n)
  })

  it('reverts to the anchored date and amount once the stage is paid', () => {
    const note = withOverrideTokens('یادداشت', '1405-08-15', 3_000_000n)
    expect(effectiveDueInstant(note, 1_000_000n, anchored, MIDNIGHT)).toBe(anchored)
    expect(effectiveAmount(note, 1_000_000n, 2_500_000n)).toBe(2_500_000n)
  })

  it('passes the standard values through when no override exists', () => {
    expect(effectiveDueInstant('یادداشت', 0n, anchored, MIDNIGHT)).toBe(anchored)
    expect(effectiveAmount('یادداشت', 0n, 2_500_000n)).toBe(2_500_000n)
  })
})
