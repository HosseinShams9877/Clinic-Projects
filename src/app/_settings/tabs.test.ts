/**
 * The six tabs' saves, as the manager panel's forms send them — area 3.
 *
 * Every case drives a Server Action with a real `FormData`, because the audit's
 * question for this area is what the boundary does with the strings a form
 * actually posts: the Persian digits and thousands separators a Persian/RTL
 * form sends, the empty strings an untouched field sends, and the checkbox map
 * the Options tab's read-only controls would post if they were ever wired up.
 * Each write is then read back through the module's own read (`readSettingsSurface`
 * and friends), so what is asserted is what the next request renders and not
 * what the writer happened to be given.
 *
 * The harness is the repo's standard action one: `prisma()` is pointed at a
 * file-local database through a hoisted ref, `resolveStaffPanel` answers the
 * session the case chose, and `revalidatePath` is silenced because no router
 * is here to invalidate. No clock is mocked — none of the six writes stamps a
 * time; the tabs are stateless enough that the clock is not one of their facts.
 *
 * Two of the cases name the audit's own premises directly:
 *
 * - the Options tab's toggles are a read-only surface in the shipped UI, but
 *   `saveTogglesAction` is a live write path — so the case posts a partial
 *   checkbox map and asserts `writeToggles` *merges* it onto the row's values,
 *   which is the property that keeps an unsent control from unsetting its
 *   seven neighbours;
 * - a secretary's column stops at the twelfth permission and
 *   `manage_clinic_settings` is the fifteenth, so the whole page is one door
 *   her role never opens — asserted at the action boundary, where the form
 *   reads the sentence.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Role } from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import { DEFAULT_CYCLE_SETTINGS } from '@/modules/cycles'
import { MESSAGES as SETTINGS_MESSAGES } from '@/modules/settings'
import { MESSAGES as ROLES_MESSAGES } from '@/modules/roles-permissions/catalog'
import { readSettingsSurface, readToggles, readWorkingHours } from '@/modules/settings'
import type { PanelSession } from '@/app/_shell/session'
import type { PrismaClient } from '@prisma/client'

import {
  addHolidayAction,
  addShiftAction,
  removeHolidayAction,
  removeShiftAction,
  saveBookingAction,
  saveCycleTabAction,
  saveIdentityAction,
  saveMessagesAction,
  saveTogglesAction,
} from './actions'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-settings-tabs')
const CLINIC_ID = asClinicId('clinic-settings-tabs')
const MANAGER_ID: UserId = asUserId('manager-settings-tabs')

/** The per-file database, handed to the mocked `prisma()` through the hoisted ref. */
const clientRef = vi.hoisted(() => ({ current: null as PrismaClient | null }))

/** The session `resolveStaffPanel` answers with — `null` is a session that opens no panel. */
const sessionRef = vi.hoisted(() => ({ current: null as PanelSession | null }))

vi.mock('@/core/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/db')>()
  return { ...actual, prisma: () => clientRef.current }
})

vi.mock('@/app/_shell/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/_shell/session')>()
  return {
    ...actual,
    resolveStaffPanel: async () => {
      if (sessionRef.current === null) throw new Error('no session the case seeded')
      return sessionRef.current
    },
  }
})

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
  clientRef.current = unscoped
})

afterAll(async () => {
  clientRef.current = null
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
  sessionRef.current = managerSession()

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'settings-tabs', name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [
      {
        id: CLINIC_ID,
        tenantId: TENANT_ID,
        name: 'کلینیک الف',
        phone: '0210000000',
        address: 'خیابان قدیم',
        isActive: true,
      },
    ],
  })
})

/** The manager session every write case acts under. */
function managerSession(): PanelSession {
  const permissions: TenantContext = Object.freeze({
    userId: MANAGER_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [], revoked: [] }),
  })
  return Object.freeze({ permissions, tenantId: TENANT_ID, role: Role.Manager })
}

/** The settings surface, read as the page renders it. */
async function surface() {
  return readSettingsSurface(unscoped as never, TENANT_ID)
}

describe('saveIdentityAction — «اطلاعات کلینیک»', () => {
  it('writes the tenant name and the clinic contact facts, and reads them back', async () => {
    const form = new FormData()
    form.set('tenantName', ' درمانگاه نور ')
    form.set('clinicName', 'کلینیک نور')
    form.set('phone', '02188000000')
    form.set('address', ' خیابان اصلی، پلاک ۱ ')

    const result = await saveIdentityAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: true, message: null })

    // The name is trimmed on both rows, and the empty-to-null rule the writer
    // keeps shows in the read: the fields are the sentence and not the spaces.
    const read = (await surface()).identity
    expect(read.tenantName).toBe('درمانگاه نور')
    expect(read.clinicName).toBe('کلینیک نور')
    expect(read.phone).toBe('02188000000')
    expect(read.address).toBe('خیابان اصلی، پلاک ۱')
  })

  it('refuses a blank clinic name with the settings sentence and leaves the row as it was', async () => {
    const form = new FormData()
    form.set('tenantName', '   ')
    form.set('clinicName', '第二大')

    const result = await saveIdentityAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: false, message: SETTINGS_MESSAGES['settings.invalidValue'] })

    // The refusal is not a partial write: the seeded name and address survive.
    const read = (await surface()).identity
    expect(read.tenantName).toBe('کلینیک الف')
    expect(read.address).toBe('خیابان قدیم')
  })
})

describe('saveBookingAction — «نوبتدهی»', () => {
  it("parses the Persian digits the form posts, and reads the policy back", async () => {
    const form = new FormData()
    form.set('mode', 'TIME_RANGE')
    // Persian digits and the thousands separator a Persian form sends —
    // `normalizeDigits` is the boundary's own translation.
    form.set('slotDurationMinutes', '۴۵')
    form.set('reminderLeadHours', '۲۴')
    form.set('bookingHoldMinutes', '۱۵')
    form.set('secretaryDiscountCap', '۵۰۰٬۰۰۰')
    form.set('depositRefundPolicy', 'HALF')
    form.set('debtGraceDays', '۷')

    const result = await saveBookingAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: true, message: null })

    const read = (await surface()).booking
    expect(read.mode).toBe('TIME_RANGE')
    expect(read.timings).toEqual({
      slotDurationMinutes: 45,
      reminderLeadHours: 24,
      bookingHoldMinutes: 15,
    })
    expect(read.secretaryDiscountCap).toBe(500_000n)
    expect(read.depositRefundPolicy).toBe('HALF')
    expect(read.debtGraceDays).toBe(7)
  })

  it('refuses a discount figure that is not money, and writes no settings row', async () => {
    const form = new FormData()
    form.set('mode', 'FIXED_SLOT')
    form.set('slotDurationMinutes', '30')
    form.set('reminderLeadHours', '24')
    form.set('bookingHoldMinutes', '15')
    form.set('secretaryDiscountCap', 'صفر')

    const result = await saveBookingAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: false, message: SETTINGS_MESSAGES['settings.invalidValue'] })

    // The parse refuses before the upsert opens — no half-written tab.
    expect(await unscoped.tenantSettings.count()).toBe(0)
  })
})

describe('the working-hours tab — add and remove over the same writer', () => {
  it('adds a shift and a holiday, then removes only the row the desk asked for', async () => {
    const shift = new FormData()
    shift.set('weekday', '0')
    shift.set('startTime', '09:00')
    shift.set('endTime', '13:00')
    expect(await addShiftAction({ ok: true, message: null }, shift)).toEqual({
      ok: true,
      message: null,
    })

    const second = new FormData()
    second.set('weekday', '2')
    second.set('startTime', '16:00')
    second.set('endTime', '20:00')
    expect(await addShiftAction({ ok: true, message: null }, second)).toEqual({
      ok: true,
      message: null,
    })

    const holiday = new FormData()
    holiday.set('localDate', '1405-07-14')
    holiday.set('title', ' روز تست ')
    holiday.set('isOfficial', 'on')
    expect(await addHolidayAction({ ok: true, message: null }, holiday)).toEqual({
      ok: true,
      message: null,
    })

    let read = await readWorkingHours(unscoped as never, TENANT_ID)
    expect(read.shifts.map((row) => row.weekday)).toEqual([0, 2])
    expect(read.holidays).toHaveLength(1)
    // The holiday's title is trimmed on the write, like every other text field.
    expect(read.holidays[0]!.title).toBe('روز تست')
    expect(read.holidays[0]!.isOfficial).toBe(true)

    // The remove reads the current lists, applies the one change, and hands the
    // result to the same wholesale writer — so the other shift survives.
    const firstId = read.shifts.find((row) => row.weekday === 0)!.id
    expect(await removeShiftAction(firstId)).toEqual({ ok: true, message: null })
    read = await readWorkingHours(unscoped as never, TENANT_ID)
    expect(read.shifts.map((row) => `${row.weekday}:${row.startTime}`)).toEqual(['2:16:00'])

    expect(await removeHolidayAction(read.holidays[0]!.id)).toEqual({ ok: true, message: null })
    read = await readWorkingHours(unscoped as never, TENANT_ID)
    expect(read.holidays).toHaveLength(0)
    expect(read.shifts).toHaveLength(1)
  })

  it('refuses a shift that does not end after it starts, and keeps the week it had', async () => {
    const form = new FormData()
    form.set('weekday', '9')
    form.set('startTime', '13:00')
    form.set('endTime', '09:00')

    const result = await addShiftAction({ ok: true, message: null }, form)
    expect(result.ok).toBe(false)
    expect(await unscoped.clinicShift.count()).toBe(0)
  })
})

describe('saveCycleTabAction — «چرخه درمان»', () => {
  it("writes the two choices and reads them merged with the cycle engine's defaults", async () => {
    const form = new FormData()
    // One checkbox checked, one left off — the form posts only what is on.
    form.set('rescheduleShiftsDueDates', 'on')

    const result = await saveCycleTabAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: true, message: null })

    const read = (await surface()).cycle
    expect(read).toEqual({
      ...DEFAULT_CYCLE_SETTINGS,
      noShowAddsToContactList: false,
      rescheduleShiftsDueDates: true,
    })
  })
})

describe('saveMessagesAction — «پیام‌ها»', () => {
  it("writes both channels' templates and the send policy, and reads them back", async () => {
    const form = new FormData()
    form.set('template:BOOKING_CONFIRMATION:SMS', ' نوبت شما ثبت شد ')
    form.set('template:APPOINTMENT_REMINDER:WHATSAPP', 'یادآوری جلسه')
    form.set('sendWindowStart', '08:00')
    form.set('sendWindowEnd', '21:00')
    form.set('dailyMessageCap', '۵')
    form.set('duplicateWindowDays', '۴۵')

    const result = await saveMessagesAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: true, message: null })

    const read = (await surface()).messages
    // The read is the whole grid — seven kinds × two channels — with the kinds
    // the tab never touched held as id-less defaults. The two the form posted
    // are the two that carry a row id and the trimmed sentence.
    const templates = read.templates.map((row) => `${row.kind}:${row.channel}`)
    expect(templates).toHaveLength(14)
    expect(new Set(templates).size).toBe(14)
    const written = read.templates.filter((row) => row.id !== null)
    expect(written).toEqual([
      {
        id: expect.any(String),
        kind: 'BOOKING_CONFIRMATION',
        channel: 'SMS',
        text: 'نوبت شما ثبت شد',
      },
      {
        id: expect.any(String),
        kind: 'APPOINTMENT_REMINDER',
        channel: 'WHATSAPP',
        text: 'یادآوری جلسه',
      },
    ])
    // The twelve the form did not name keep their id-less defaults, so an
    // untouched template is never blanked by an untouched form.
    expect(read.templates.filter((row) => row.id === null)).toHaveLength(12)
    expect(read.sendWindowStart).toBe('08:00')
    expect(read.sendWindowEnd).toBe('21:00')
    expect(read.dailyMessageCap).toBe(5)
    expect(read.duplicateWindowDays).toBe(45)
  })

  it('refuses a blank template with the settings sentence, and writes nothing', async () => {
    const form = new FormData()
    form.set('template:AFTERCARE:SMS', '   ')
    form.set('sendWindowStart', '08:00')
    form.set('sendWindowEnd', '21:00')

    const result = await saveMessagesAction({ ok: true, message: null }, form)
    expect(result).toEqual({ ok: false, message: SETTINGS_MESSAGES['settings.invalidValue'] })

    expect(await unscoped.messageTemplate.count()).toBe(0)
    expect(await unscoped.tenantSettings.count()).toBe(0)
  })
})

describe("saveTogglesAction — «اختیارات» as the API takes it", () => {
  it('merges a partial checkbox map onto the row, so a control the form left out keeps its value', async () => {
    // The shipped Options tab renders its toggles read-only, but the action is a
    // live write path — the audit's question is what happens when the map is
    // posted. A checkbox form sends only the checked boxes; the two default-off
    // ones posted here flip on.
    const first = new FormData()
    first.set('SECRETARY_EDIT_PRICE', 'on')
    first.set('BOOKING_ON_HOLIDAYS', 'on')

    const result = await saveTogglesAction({ ok: true, message: null }, first)
    expect(result).toEqual({ ok: true, message: null })

    const afterFirst = await readToggles(unscoped as never, TENANT_ID)
    expect(afterFirst.SECRETARY_EDIT_PRICE).toBe(true)
    expect(afterFirst.BOOKING_ON_HOLIDAYS).toBe(true)
    // The six the form did not name keep the row's values — the documented
    // default, which is what keeps an unsent control from unsetting its
    // neighbours.
    expect(afterFirst.DOCTOR_SELF_BOOKING).toBe(true)
    expect(afterFirst.DOCTOR_CLOSE_OWN_HOURS).toBe(false)
    expect(afterFirst.AUTO_LEAD_FROM_SITE_FORM).toBe(true)

    // A second submit that names only one control merges again over the row:
    // the toggle the second form left out keeps the value the first wrote.
    const second = new FormData()
    second.set('DOCTOR_CLOSE_OWN_HOURS', 'on')
    expect(await saveTogglesAction({ ok: true, message: null }, second)).toEqual({
      ok: true,
      message: null,
    })

    const afterSecond = await readToggles(unscoped as never, TENANT_ID)
    expect(afterSecond.DOCTOR_CLOSE_OWN_HOURS).toBe(true)
    expect(afterSecond.BOOKING_ON_HOLIDAYS).toBe(true)
    expect(afterSecond.SECRETARY_EDIT_PRICE).toBe(true)
  })
})

describe('the door the whole page sits behind', () => {
  it('refuses a secretary, whose column stops twelve permissions short of the settings one', async () => {
    sessionRef.current = Object.freeze({
      ...managerSession(),
      role: Role.Secretary,
      permissions: Object.freeze({
        ...managerSession().permissions,
        role: Role.Secretary,
      }),
    })

    const identity = new FormData()
    identity.set('tenantName', 'نام جدید')
    identity.set('clinicName', 'نام جدید')
    expect(await saveIdentityAction({ ok: true, message: null }, identity)).toEqual({
      ok: false,
      message: ROLES_MESSAGES['permission.denied'],
    })

    const toggles = new FormData()
    toggles.set('SECRETARY_EDIT_PRICE', 'on')
    expect(await saveTogglesAction({ ok: true, message: null }, toggles)).toEqual({
      ok: false,
      message: ROLES_MESSAGES['permission.denied'],
    })

    // Nothing was written: the seeded name is the seeded name.
    expect((await surface()).identity.tenantName).toBe('کلینیک الف')
    expect(await readToggles(unscoped as never, TENANT_ID)).toEqual(
      expect.objectContaining({ SECRETARY_EDIT_PRICE: false }),
    )
  })
})
