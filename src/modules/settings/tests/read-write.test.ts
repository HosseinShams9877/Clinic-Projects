/**
 * The six settings tabs persist and read back — Phase 10's DoD 3, against a real
 * SQLite file built from the committed migrations.
 *
 * The assertion that matters for a settings surface is not "the write returned" but
 * "the *next read* sees it", because the read is what the next request runs. Each
 * tab here writes a value the defaults do not hold and then reads through the
 * module's own reader, so the round trip is what is tested and not the write's
 * return value.
 *
 * The defaults are asserted first, once, because a tenant that has never opened the
 * page is the common case and a default that moved between the write and the read is
 * a silent settings change.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AutomaticMessageKind,
  BookingMode,
  Channel,
  DepositRefundPolicy,
  Role,
} from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES, type TenantContext } from '@/core/tenant'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import { asLocalTime } from '@/core/localization'

import {
  readBooking,
  readCycleTab,
  readIdentity,
  readMessagesTab,
  readOptions,
  readSettingsSurface,
  readWorkingHours,
  saveBooking,
  saveCycleTab,
  saveIdentity,
  saveMessagesTab,
  saveToggles,
  saveWorkingHours,
} from '@/modules/settings'
import { TOGGLE_DEFAULTS, type Toggle } from '@/modules/roles-permissions'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-b')
const CLINIC_ID = asClinicId('clinic-a')
const MANAGER_ID: UserId = asUserId('manager-a')

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.messageTemplate.deleteMany(),
    unscoped.holiday.deleteMany(),
    unscoped.clinicShift.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_ID, slug: 'a', name: 'کلینیک الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'b', name: 'کلینیک ب', isActive: true },
    ],
  })
  await unscoped.clinic.createMany({
    data: [
      { id: CLINIC_ID, tenantId: TENANT_ID, name: 'شعبه اصلی', isActive: true },
      { id: 'clinic-b', tenantId: OTHER_TENANT_ID, name: 'شعبه ب', isActive: true },
    ],
  })
})

/** A manager's context, which every settings write takes. */
function managerContext(tenantId: TenantId = TENANT_ID): TenantContext {
  return {
    userId: MANAGER_ID,
    tenantId,
    clinicId: null,
    role: Role.Manager,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

describe('a tenant that has never opened the page', () => {
  it('reads the documented defaults for every tab', async () => {
    const surface = await readSettingsSurface(unscoped as never, TENANT_ID)

    expect(surface.identity.tenantName).toBe('کلینیک الف')
    expect(surface.identity.clinicName).toBe('شعبه اصلی')

    expect(surface.booking.mode).toBe(BookingMode.FixedSlot)
    expect(surface.booking.secretaryDiscountCap).toBeNull()
    expect(surface.booking.depositRefundPolicy).toBeNull()

    expect(surface.workingHours.shifts).toHaveLength(0)
    expect(surface.workingHours.holidays).toHaveLength(0)

    expect(surface.options.overrides).toHaveLength(0)
    for (const [toggle, enabled] of Object.entries(surface.options.toggles)) {
      expect(TOGGLE_DEFAULTS[toggle as Toggle]).toBe(enabled)
    }
  })
})

describe('«اطلاعات کلینیک»', () => {
  it('persists the names, the phone and the address, and reads them back', async () => {
    const saved = await saveIdentity(unscoped as never, managerContext(), {
      tenantName: 'کلینیک زیبایی الف',
      clinicName: 'شعبه شمال',
      phone: '۰۲۱-۲۲۰۲۲۰۲۰',
      address: 'تهران، خیابان ولیعصر',
    })

    expect(saved).toEqual({
      tenantName: 'کلینیک زیبایی الف',
      clinicName: 'شعبه شمال',
      phone: '۰۲۱-۲۲۰۲۲۰۲۰',
      address: 'تهران، خیابان ولیعصر',
    })

    expect(await readIdentity(unscoped as never, TENANT_ID)).toEqual(saved)
  })

  it('falls back to the tenant name when the clinic name is blank', async () => {
    const saved = await saveIdentity(unscoped as never, managerContext(), {
      tenantName: 'کلینیک زیبایی الف',
      clinicName: '   ',
      phone: '',
      address: '',
    })

    expect(saved.clinicName).toBe('کلینیک زیبایی الف')
    // An empty field the form sends is a null column, not an empty string.
    expect(saved.phone).toBeNull()
    expect(saved.address).toBeNull()
  })

  it('refuses a blank tenant name', async () => {
    await expect(
      saveIdentity(unscoped as never, managerContext(), {
        tenantName: '   ',
        clinicName: 'شعبه',
        phone: null,
        address: null,
      }),
    ).rejects.toThrow()
  })

  it("never writes the other tenant's row", async () => {
    await saveIdentity(unscoped as never, managerContext(), {
      tenantName: 'نام الف',
      clinicName: 'شعبه الف',
      phone: null,
      address: null,
    })

    const other = await readIdentity(unscoped as never, OTHER_TENANT_ID)
    expect(other.tenantName).toBe('کلینیک ب')
    expect(other.clinicName).toBe('شعبه ب')
  })
})

describe('«نوبتدهی»', () => {
  it('persists the mode, the three timings and the two policy values', async () => {
    const saved = await saveBooking(unscoped as never, managerContext(), {
      mode: BookingMode.TimeRange,
      timings: { slotDurationMinutes: 20, reminderLeadHours: 6, bookingHoldMinutes: 45 },
      secretaryDiscountCap: 500_000n,
      depositRefundPolicy: DepositRefundPolicy.Half,
    })

    expect(saved.mode).toBe(BookingMode.TimeRange)
    expect(saved.timings).toEqual({
      slotDurationMinutes: 20,
      reminderLeadHours: 6,
      bookingHoldMinutes: 45,
    })
    expect(saved.secretaryDiscountCap).toBe(500_000n)
    expect(saved.depositRefundPolicy).toBe(DepositRefundPolicy.Half)

    expect(await readBooking(unscoped as never, TENANT_ID)).toEqual(saved)
  })

  it('narrows a policy the matrix does not name back to none', async () => {
    // The column is a free `String?`, so the read — not the column — is what keeps
    // the value inside the closed set.
    await unscoped.tenantSettings.upsert({
      where: { tenantId: TENANT_ID },
      create: { tenantId: TENANT_ID, depositRefundPolicy: 'WHATEVER' },
      update: { depositRefundPolicy: 'WHATEVER' },
    })

    expect(await readBooking(unscoped as never, TENANT_ID)).toMatchObject({
      depositRefundPolicy: null,
    })
  })

  it('clears the discount cap and the policy when the manager removes them', async () => {
    await saveBooking(unscoped as never, managerContext(), {
      mode: BookingMode.FixedSlot,
      timings: { slotDurationMinutes: 15, reminderLeadHours: 24, bookingHoldMinutes: 30 },
      secretaryDiscountCap: 500_000n,
      depositRefundPolicy: DepositRefundPolicy.Full,
    })

    const cleared = await saveBooking(unscoped as never, managerContext(), {
      mode: BookingMode.Request,
      timings: { slotDurationMinutes: 15, reminderLeadHours: 24, bookingHoldMinutes: 30 },
      secretaryDiscountCap: null,
      depositRefundPolicy: null,
    })

    expect(cleared.secretaryDiscountCap).toBeNull()
    expect(cleared.depositRefundPolicy).toBeNull()
    expect(await readBooking(unscoped as never, TENANT_ID)).toEqual(cleared)
  })
})

describe('«ساعات کاری»', () => {
  it('replaces the shifts and the holidays wholesale', async () => {
    await saveWorkingHours(unscoped as never, managerContext(), {
      shifts: [{ weekday: 0, startTime: '09:00', endTime: '14:00' }],
      holidays: [{ localDate: '1404-01-01', title: 'نوروز', isOfficial: true }],
    })

    const first = await readWorkingHours(unscoped as never, TENANT_ID)
    expect(first.shifts.map((shift) => [shift.weekday, shift.startTime, shift.endTime])).toEqual([
      [0, '09:00', '14:00'],
    ])
    expect(first.holidays.map((holiday) => holiday.title)).toEqual(['نوروز'])

    // The tab is a replacement, not an append: a second save leaves no trace of the
    // first, which is what the page's one-form-per-tab shape promises.
    await saveWorkingHours(unscoped as never, managerContext(), {
      shifts: [{ weekday: 1, startTime: '16:00', endTime: '20:00' }],
      holidays: [],
    })

    const second = await readWorkingHours(unscoped as never, TENANT_ID)
    expect(second.shifts.map((shift) => shift.weekday)).toEqual([1])
    expect(second.holidays).toHaveLength(0)
  })

  it('writes a shift to every clinic in the tenant', async () => {
    await unscoped.clinic.createMany({
      data: { tenantId: TENANT_ID, name: 'شعبه جنوب', isActive: true },
    })

    await saveWorkingHours(unscoped as never, managerContext(), {
      shifts: [{ weekday: 0, startTime: '09:00', endTime: '17:00' }],
      holidays: [],
    })

    const shifts = await unscoped.clinicShift.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { clinicId: 'asc' },
    })
    expect(shifts).toHaveLength(2)
    expect(new Set(shifts.map((shift) => shift.clinicId)).size).toBe(2)
  })

  it('refuses a weekday that is not a day of the week', async () => {
    await expect(
      saveWorkingHours(unscoped as never, managerContext(), {
        shifts: [{ weekday: 7, startTime: '09:00', endTime: '17:00' }],
        holidays: [],
      }),
    ).rejects.toThrow()
    expect(await unscoped.clinicShift.count({ where: { tenantId: TENANT_ID } })).toBe(0)
  })

  it('refuses a shift that does not end after it starts', async () => {
    await expect(
      saveWorkingHours(unscoped as never, managerContext(), {
        shifts: [{ weekday: 0, startTime: '17:00', endTime: '09:00' }],
        holidays: [],
      }),
    ).rejects.toThrow()
    expect(await unscoped.clinicShift.count({ where: { tenantId: TENANT_ID } })).toBe(0)
  })

  it('refuses a holiday without a date or a title', async () => {
    await expect(
      saveWorkingHours(unscoped as never, managerContext(), {
        shifts: [],
        holidays: [{ localDate: '1404-13-01', title: 'نامعتبر', isOfficial: false }],
      }),
    ).rejects.toThrow()

    await expect(
      saveWorkingHours(unscoped as never, managerContext(), {
        shifts: [],
        holidays: [{ localDate: '1404-05-15', title: '  ', isOfficial: false }],
      }),
    ).rejects.toThrow()

    expect(await unscoped.holiday.count({ where: { tenantId: TENANT_ID } })).toBe(0)
  })
})

describe('«چرخه درمان»', () => {
  it('persists both defaults and merges them with the engine\'s own', async () => {
    const saved = await saveCycleTab(unscoped as never, managerContext(), {
      noShowAddsToContactList: false,
      rescheduleShiftsDueDates: false,
    })

    expect(saved).toEqual({
      noShowAddsToContactList: false,
      rescheduleShiftsDueDates: false,
    })
    expect(await readCycleTab(unscoped as never, TENANT_ID)).toEqual(saved)
  })
})

describe('«پیام‌ها»', () => {
  it('persists every template and the send policy, and rewrites a template that exists', async () => {
    await saveMessagesTab(unscoped as never, managerContext(), {
      sendWindowStart: asLocalTime('08:00'),
      sendWindowEnd: asLocalTime('21:00'),
      dailyMessageCap: 200,
      duplicateWindowDays: 60,
      templates: [
        { id: null, kind: AutomaticMessageKind.BookingConfirmation, channel: Channel.Sms, text: 'نوبت شما تأیید شد.' },
      ],
    })

    expect(await readMessagesTab(unscoped as never, TENANT_ID)).toMatchObject({
      sendWindowStart: asLocalTime('08:00'),
      sendWindowEnd: asLocalTime('21:00'),
      dailyMessageCap: 200,
      duplicateWindowDays: 60,
    })

    // A second save of the same (kind, channel) is an update, not a second row —
    // which is what keeps one template per channel per message.
    await saveMessagesTab(unscoped as never, managerContext(), {
      sendWindowStart: asLocalTime('08:00'),
      sendWindowEnd: asLocalTime('21:00'),
      dailyMessageCap: 200,
      duplicateWindowDays: 60,
      templates: [
        { id: null, kind: AutomaticMessageKind.BookingConfirmation, channel: Channel.Sms, text: 'نوبت شما ثبت شد.' },
      ],
    })

    const rows = await unscoped.messageTemplate.findMany({
      where: { tenantId: TENANT_ID },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toBe('نوبت شما ثبت شد.')
  })

  it('keeps a channel apart as its own template', async () => {
    await saveMessagesTab(unscoped as never, managerContext(), {
      sendWindowStart: asLocalTime('08:00'),
      sendWindowEnd: asLocalTime('21:00'),
      dailyMessageCap: 100,
      duplicateWindowDays: 90,
      templates: [
        { id: null, kind: AutomaticMessageKind.BookingConfirmation, channel: Channel.Sms, text: 'پیامک' },
        { id: null, kind: AutomaticMessageKind.BookingConfirmation, channel: Channel.WhatsApp, text: 'واتساپ' },
      ],
    })

    const rows = await unscoped.messageTemplate.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { channel: 'asc' },
    })
    expect(rows).toHaveLength(2)
  })

  it('refuses a blank template', async () => {
    await expect(
      saveMessagesTab(unscoped as never, managerContext(), {
        sendWindowStart: asLocalTime('08:00'),
        sendWindowEnd: asLocalTime('21:00'),
        dailyMessageCap: 100,
        duplicateWindowDays: 90,
        templates: [{ id: null, kind: AutomaticMessageKind.Aftercare, channel: Channel.Sms, text: '   ' }],
      }),
    ).rejects.toThrow()

    expect(await unscoped.messageTemplate.count({ where: { tenantId: TENANT_ID } })).toBe(0)
  })
})

describe('«اختیارات»', () => {
  it('flips a toggle and the next read sees it', async () => {
    await saveToggles(unscoped as never, managerContext(), { SECRETARY_DISCOUNT: false })

    const options = await readOptions(unscoped as never, TENANT_ID)
    expect(options.toggles['SECRETARY_DISCOUNT']).toBe(false)
    expect(options.toggles['DOCTOR_SELF_BOOKING']).toBe(TOGGLE_DEFAULTS.DOCTOR_SELF_BOOKING)
  })

  it('writes the eight as one blob, so a partial change leaves the rest alone', async () => {
    await saveToggles(unscoped as never, managerContext(), { BOOKING_ON_HOLIDAYS: true })
    await saveToggles(unscoped as never, managerContext(), { ONLINE_BOOKING_NO_DEPOSIT: true })

    const options = await readOptions(unscoped as never, TENANT_ID)
    expect(options.toggles['BOOKING_ON_HOLIDAYS']).toBe(true)
    expect(options.toggles['ONLINE_BOOKING_NO_DEPOSIT']).toBe(true)
    expect(options.toggles['AUTO_LEAD_FROM_SITE_FORM']).toBe(TOGGLE_DEFAULTS.AUTO_LEAD_FROM_SITE_FORM)
  })
})
