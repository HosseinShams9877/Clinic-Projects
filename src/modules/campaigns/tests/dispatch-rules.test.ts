/**
 * The send rules a campaign's dispatch keeps, and the door before a campaign exists —
 * area 5.
 *
 * `approval-gate.test.ts` owns the approval invariant (draft never scanned, a row
 * forced ACTIVE without the two columns, the real submit→approve→activate path), and
 * `messages/tests/consent.test.ts` owns consent at the automatic-dispatch level. What
 * this suite adds is the rest of area 5's questions:
 *
 * - **`createCampaign`'s door and its validation** — a secretary's column stops at the
 *   twelfth permission and `manage_campaigns` is the thirteenth, so she cannot create a
 *   campaign; the same session *with* the grant can. The builder's own refusals (blank
 *   name, blank text, a retired group, a type the closed set does not hold) are the
 *   sentences the catalog keeps, and none of them writes a row.
 * - **The four send rules the dispatch applies per recipient** — consent first, then the
 *   campaign's own `(customer, campaign)` ledger key, then the clinic's daily cap, then
 *   the 90-day duplicate window — each driven to the suppression reason it records, with
 *   the cases that *almost* trigger a rule separated from the ones that do: a send that
 *   never delivered (QUEUED, `sentAt` null) does not close the duplicate window, and a
 *   campaign's own `dailyCap` bounds the run itself.
 * - **The recurring schedule** — the two mechanisms that keep a recurring campaign
 *   honest, read against a `DAILY_AT` row: the schedule advance plus the ledger's
 *   period-scoped key, so a re-tick of the same period writes nothing at all — not
 *   even the refusals again — and then the person-level ۹۰-day window sitting *over*
 *   the schedule: a campaign that recurs daily still cannot reach a person the window
 *   holds, which is the promise «یک پیام در ۹۰ روز» winning over the clinic's own
 *   schedule, and releasing the person only once the window has passed.
 *
 * Every case drives the module directly (`dispatchDueCampaigns`, `createCampaign`),
 * because the questions are the module's own; the action layer adds a form boundary the
 * settings and permissions suites already cover. The clock is the fixed `NOW` the seeds
 * measure their distances from — no `new Date()` outside the seed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AudienceGroupKey,
  AutomaticMessageKind,
  CampaignScheduleKind,
  CampaignStatus,
  CampaignType,
  Channel,
  CustomerLifecycle,
  Permission,
  Role,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@prisma/client'

import { ensureBuiltInGroups } from '@/modules/audience-groups'
import { recordConsent } from '@/modules/customers'
import { createCampaign, dispatchDueCampaigns, type CampaignInput } from '@/modules/campaigns'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-dispatch-rules')
const CLINIC_ID = asClinicId('clinic-dispatch-rules')
const MANAGER_ID: UserId = asUserId('manager-dispatch-rules')
const CUSTOMER_A = 'customer-rules-a'
const CUSTOMER_B = 'customer-rules-b'
const CUSTOMER_C = 'customer-rules-c'
const CAMPAIGN_ID = 'campaign-rules'

/** مهر ۱۴۰۵ — the seeded day, so the birthday group the campaign uses is the current month's. */
const NOW = new Date('2026-10-06T10:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

let database: TestDatabase
let unscoped: PrismaClient

/** The birthday group's id, seeded per case — the audience most campaigns here send to. */
let birthdayGroupId: string

/** The loyal group's id — a membership the clock does not move, for the long-horizon case. */
let loyalGroupId: string

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.messageSend.deleteMany(),
    unscoped.consentRecord.deleteMany(),
    unscoped.campaign.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.audienceGroup.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'dispatch-rules', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  // The window is the whole day, the duplicate window is the spec's ۹۰ days, and the
  // clinic cap is opened wide. `dailyMessageCap: NULL` is not "no cap" —
  // `readSendSettings` falls back to `AUTOMATIC_MESSAGES_PER_DAY` (۱) — so the seed
  // sets an open cap, and a case that wants the daily-cap rule narrows it itself.
  await unscoped.tenantSettings.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        utcOffsetMinutes: 210,
        sendWindowStart: '00:00',
        sendWindowEnd: '23:59',
        dailyMessageCap: 10,
        duplicateMessageWindowDays: 90,
      },
    ],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000040',
        firstName: 'مدیر',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })

  const groups = await ensureBuiltInGroups({ tx: unscoped as never, tenantId: TENANT_ID })
  const birthday = groups.find((group) => group.key === AudienceGroupKey.Birthday)
  const loyal = groups.find((group) => group.key === AudienceGroupKey.Loyal)
  if (birthday === undefined || loyal === undefined) {
    throw new Error('the eight built-in groups were not seeded')
  }
  birthdayGroupId = birthday.id
  loyalGroupId = loyal.id

  // Three customers of the current Jalali month — the birthday group holds all three,
  // so one dispatch sees all three and each rule can name its own victim.
  await unscoped.customer.createMany({
    data: [CUSTOMER_A, CUSTOMER_B, CUSTOMER_C].map((id, index) => ({
      id,
      tenantId: TENANT_ID,
      mobile: `0913000004${index}`,
      firstName: 'مشتری',
      searchName: 'مشتری',
      lifecycle: CustomerLifecycle.Customer,
      birthMonth: 7,
    })),
  })
})

/** The manager who may create and approve; `granted` widens the effective set. */
function managerContext(
  role: Role = Role.Manager,
  granted: readonly Permission[] = [],
): TenantContext {
  return Object.freeze({
    userId: MANAGER_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role,
    overrides: Object.freeze({ granted, revoked: [] }),
  })
}

/** A valid campaign input, varied by the case. */
function input(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    name: 'کمپین تولد',
    type: CampaignType.Occasion,
    channel: Channel.Sms,
    audienceGroupId: birthdayGroupId,
    messageText: '{name} عزیز، پیشنهاد ویژه‌ای برای شما داریم.',
    scheduleKind: CampaignScheduleKind.OneTime,
    scheduledAt: new Date(NOW.getTime() - DAY_MS),
    scheduledTime: null,
    isRecurring: false,
    dailyCap: null,
    ...overrides,
  }
}

/** An approved, active campaign — the state the real path ends in, seeded as a row. */
async function activeCampaign(patch: {
  readonly scheduleKind?: CampaignScheduleKind
  readonly scheduledTime?: string | null
  readonly isRecurring?: boolean
  readonly scheduledAt?: Date
  readonly dailyCap?: number | null
  readonly audienceGroupId?: string
}): Promise<void> {
  await unscoped.campaign.create({
    data: {
      id: CAMPAIGN_ID,
      tenantId: TENANT_ID,
      audienceGroupId: patch.audienceGroupId ?? birthdayGroupId,
      createdByUserId: MANAGER_ID,
      approvedByUserId: MANAGER_ID,
      approvedAt: new Date(NOW.getTime() - DAY_MS),
      name: 'کمپین تولد',
      type: CampaignType.Occasion,
      channel: Channel.Sms,
      messageText: '{name} عزیز، پیشنهاد ویژه‌ای برای شما داریم.',
      isRecurring: patch.isRecurring ?? false,
      scheduleKind: patch.scheduleKind ?? CampaignScheduleKind.OneTime,
      scheduledAt: patch.scheduledAt ?? new Date(NOW.getTime() - DAY_MS),
      scheduledTime: patch.scheduledTime ?? null,
      dailyCap: patch.dailyCap ?? null,
      status: CampaignStatus.Active,
    },
  })
}

/** The channel's consent, granted as the profile page would grant it. */
async function consent(customerId: string): Promise<void> {
  await recordConsent({
    tx: unscoped as never,
    ctx: managerContext(),
    customerId,
    flags: { sms: true, whatsApp: false, phone: false, beforeAfter: false },
    source: 'PROFILE',
    now: NOW,
  })
}

/** One message the tenant already sent the customer — the 90-day window's evidence. */
async function priorSend(
  customerId: string,
  args: {
    readonly sentAt: Date | null
    readonly status?: string
    readonly createdAt?: Date
  },
): Promise<void> {
  await unscoped.messageSend.create({
    data: {
      tenantId: TENANT_ID,
      customerId,
      campaignId: null,
      automaticKind: AutomaticMessageKind.AppointmentReminder,
      templateId: null,
      channel: Channel.Sms,
      renderedText: 'یادآوری جلسه',
      status: args.status ?? 'SENT',
      suppressedReason: null,
      sentAt: args.sentAt,
      createdAt: args.createdAt ?? args.sentAt ?? NOW,
    },
  })
}

/** One dispatch at the case's clock, as the job would run it. */
async function dispatch(now = NOW) {
  const [outcome] = await dispatchDueCampaigns({ tx: unscoped as never, tenantId: TENANT_ID, now })
  return outcome
}

/** The rows this campaign's dispatch left in the ledger. */
async function ledger(status?: string) {
  return unscoped.messageSend.findMany({
    where: { tenantId: TENANT_ID, campaignId: CAMPAIGN_ID, status },
    orderBy: { createdAt: 'asc' },
  })
}

describe('createCampaign — the door and the shape', () => {
  it('refuses a secretary and a doctor, and admits the same secretary once the permission is granted', async () => {
    await expect(
      createCampaign({
        tx: unscoped as never,
        ctx: managerContext(Role.Secretary),
        input: input(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })

    await expect(
      createCampaign({
        tx: unscoped as never,
        ctx: managerContext(Role.Doctor),
        input: input(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })
    expect(await unscoped.campaign.count()).toBe(0)

    // The same secretary with the grant in the overrides is admitted: the effective set
    // is `defaults ∪ granted`, read at the module boundary and not the role's label.
    const created = await createCampaign({
      tx: unscoped as never,
      ctx: managerContext(Role.Secretary, [Permission.ManageCampaigns]),
      input: input({ name: ' کمپین تولد ' }),
      now: NOW,
    })
    expect(created.status).toBe(CampaignStatus.Draft)
    expect(created.name).toBe('کمپین تولد')
    // A one-time campaign is written as a one-time campaign: the recurring flag and the
    // schedule the form sent are the row's own facts.
    expect(created.isRecurring).toBe(false)
    expect(created.scheduledAt).toEqual(new Date(NOW.getTime() - DAY_MS))
  })

  it('refuses a blank name, a blank text, a retired group and an unknown type, and writes no row', async () => {
    const ctx = managerContext()

    await expect(
      createCampaign({ tx: unscoped as never, ctx, input: input({ name: '   ' }), now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'campaigns.nameRequired' })
    await expect(
      createCampaign({ tx: unscoped as never, ctx, input: input({ messageText: '  ' }), now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'campaigns.textRequired' })
    await expect(
      createCampaign({
        tx: unscoped as never,
        ctx,
        input: input({ type: 'NOT_A_TYPE' as never }),
        now: NOW,
      }),
    ).rejects.toMatchObject({ messageKey: 'campaigns.typeUnknown' })
    await expect(
      createCampaign({
        tx: unscoped as never,
        ctx,
        input: input({ scheduleKind: 'HOURLY' as never }),
        now: NOW,
      }),
    ).rejects.toMatchObject({ messageKey: 'campaigns.typeUnknown' })

    // A retired group is a group the clinic turned off, and the catalog's own sentence
    // is the refusal — the builder never offers a group that cannot be chosen.
    await unscoped.audienceGroup.update({
      where: { id: birthdayGroupId },
      data: { isActive: false },
    })
    await expect(
      createCampaign({ tx: unscoped as never, ctx, input: input(), now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'campaigns.groupNotActive' })

    expect(await unscoped.campaign.count()).toBe(0)
  })
})

describe('the four send rules the dispatch keeps', () => {
  it('suppresses a customer without consent, records the refusal, and sends to the two who agreed', async () => {
    // The audience is all three — the birthday group holds every customer seeded —
    // so the one without consent is the only one the rule names.
    await consent(CUSTOMER_B)
    await consent(CUSTOMER_C)
    await activeCampaign({})

    const outcome = await dispatch()
    expect(outcome?.evaluated).toBe(3)
    expect(outcome?.sent).toBe(2)
    expect(outcome?.suppressed).toBe(1)

    // The refusal is on the person's record, with the reason a reader can act on — and
    // no provider row was ever written for a person who never agreed.
    const suppressed = await ledger('SUPPRESSED')
    expect(suppressed).toHaveLength(1)
    expect(suppressed[0]!.customerId).toBe(CUSTOMER_A)
    expect(suppressed[0]!.suppressedReason).toBe('NO_CONSENT')
    expect(suppressed[0]!.sentAt).toBeNull()
    expect(suppressed[0]!.campaignId).toBe(CAMPAIGN_ID)

    const sent = await ledger('SENT')
    expect(sent.map((row) => row.customerId).sort()).toEqual([CUSTOMER_B, CUSTOMER_C])
    expect(sent[0]!.sentAt).toEqual(NOW)
    expect(sent[0]!.renderedText).toContain('مشتری')
  })

  it('holds a second message within the 90-day window, and releases it past the window or when the first never delivered', async () => {
    // A: a delivered send ۳۰ days ago — inside the window, held.
    await consent(CUSTOMER_A)
    await priorSend(CUSTOMER_A, { sentAt: new Date(NOW.getTime() - 30 * DAY_MS) })
    // B: a delivered send ۹۱ days ago — one day past the window, sent.
    await consent(CUSTOMER_B)
    await priorSend(CUSTOMER_B, { sentAt: new Date(NOW.getTime() - 91 * DAY_MS) })
    // C: a send that never left the queue — `sentAt` is null, so it delivered nothing,
    // and a message that never arrived does not close the window. It still counts
    // toward the daily cap (QUEUED is a delivered status), which is why the seed's
    // clinic cap is open rather than unset.
    await consent(CUSTOMER_C)
    await priorSend(CUSTOMER_C, {
      sentAt: null,
      status: 'QUEUED',
      createdAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
    })
    await activeCampaign({})

    const outcome = await dispatch()
    expect(outcome?.evaluated).toBe(3)
    expect(outcome?.sent).toBe(2)
    expect(outcome?.suppressed).toBe(1)

    const reasons = new Map(
      (await ledger('SUPPRESSED')).map((row) => [row.customerId, row.suppressedReason]),
    )
    expect(reasons.get(CUSTOMER_A)).toBe('DUPLICATE_WINDOW')
    expect(reasons.has(CUSTOMER_B)).toBe(false)
    expect(reasons.has(CUSTOMER_C)).toBe(false)
  })

  it('suppresses the customer who already holds the clinic daily cap of delivered sends', async () => {
    // The clinic's cap is one delivered message a day — the spec's own default
    // (`AUTOMATIC_MESSAGES_PER_DAY`), set here so the rule it names is the case's.
    await unscoped.tenantSettings.update({
      where: { tenantId: TENANT_ID },
      data: { dailyMessageCap: 1 },
    })
    // All three agreed; A alone holds a delivered send from two hours ago — the cap
    // reads on `createdAt` over the rolling day, so A is held and B and C are not.
    await consent(CUSTOMER_A)
    await consent(CUSTOMER_B)
    await consent(CUSTOMER_C)
    await priorSend(CUSTOMER_A, {
      sentAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
    })
    await activeCampaign({})

    const outcome = await dispatch()
    expect(outcome?.evaluated).toBe(3)
    expect(outcome?.sent).toBe(2)
    expect(outcome?.suppressed).toBe(1)

    const reasons = new Map(
      (await ledger('SUPPRESSED')).map((row) => [row.customerId, row.suppressedReason]),
    )
    expect(reasons.get(CUSTOMER_A)).toBe('DAILY_CAP')

    // A suppression is not a delivery: it counts toward nothing, so the two people
    // the cap did not name are the two rows the run sent.
    const sent = await ledger('SENT')
    expect(sent.map((row) => row.customerId).sort()).toEqual([CUSTOMER_B, CUSTOMER_C])
  })

  it("bounds its own run at the campaign's daily cap, and stops there", async () => {
    await consent(CUSTOMER_A)
    await consent(CUSTOMER_B)
    await consent(CUSTOMER_C)
    await activeCampaign({ dailyCap: 1 })

    const outcome = await dispatch()
    expect(outcome?.evaluated).toBe(3)
    expect(outcome?.sent).toBe(1)
    expect(outcome?.suppressed).toBe(0)
    expect(outcome?.skipped).toBeNull()
    // One row in the ledger, not three — the cap bounds the run and not just the
    // count, and the two the cap never reached are not written as refusals.
    expect(await ledger()).toHaveLength(1)
  })

  it('queues the send for the automatic dispatch when the clock is outside the clinic window', async () => {
    // The clinic day closes at ۱۳:۰۰ and the seeded clock is ۱۳:۳۰ local (UTC+۳:۳۰), so
    // the message is due outside the hours the clinic named — queued, not sent.
    await unscoped.tenantSettings.update({
      where: { tenantId: TENANT_ID },
      data: { sendWindowEnd: '13:00' },
    })
    await consent(CUSTOMER_A)
    await consent(CUSTOMER_B)
    await consent(CUSTOMER_C)
    await activeCampaign({})

    const outcome = await dispatch()
    expect(outcome?.evaluated).toBe(3)
    expect(outcome?.sent).toBe(0)
    expect(outcome?.queued).toBe(3)
    expect(outcome?.suppressed).toBe(0)

    const queued = await ledger('QUEUED')
    expect(queued.map((row) => row.customerId).sort()).toEqual([
      CUSTOMER_A,
      CUSTOMER_B,
      CUSTOMER_C,
    ])
    expect(queued[0]!.sentAt).toBeNull()
    expect(queued[0]!.status).toBe('QUEUED')
  })
})

describe('the recurring schedule', () => {
  it('locks the period: a re-tick at the same clock writes nothing at all — not even the refusals again', async () => {
    await consent(CUSTOMER_A)
    await activeCampaign({
      scheduleKind: CampaignScheduleKind.DailyAt,
      scheduledTime: '09:00',
      isRecurring: true,
      scheduledAt: new Date(NOW.getTime() - DAY_MS),
    })

    // The first run sends to the one who agreed and records the refusals of the two
    // who did not — three ledger rows, one period's facts.
    const first = await dispatch()
    expect(first?.evaluated).toBe(3)
    expect(first?.sent).toBe(1)
    expect(first?.suppressed).toBe(2)
    expect(await ledger()).toHaveLength(3)

    // The schedule advanced inside the sends' transaction: the next period is
    // ۱۴۰۵/۰۷/۱۴ at ۰۹:۰۰ local, which is ۰۵:۳۰Z at the seeded offset — and the
    // campaign is still ACTIVE, not finished the way a one-time run is.
    const afterFirst = await unscoped.campaign.findUniqueOrThrow({ where: { id: CAMPAIGN_ID } })
    expect(afterFirst.scheduledAt).toEqual(new Date('2026-10-06T05:30:00.000Z'))
    expect(afterFirst.status).toBe(CampaignStatus.Active)

    // A second tick at the same clock — the row the scan finds is one whose schedule
    // is still due, so the run happens and re-evaluates the whole audience; nobody is
    // written to twice for the period, and the period's refusals are not re-written
    // either. The ledger is exactly what the first run left.
    const second = await dispatch()
    expect(second?.evaluated).toBe(3)
    expect(second?.sent).toBe(0)
    expect(second?.suppressed).toBe(0)
    expect(await ledger()).toHaveLength(3)
  })

  it("holds a daily campaign behind the person's 90-day window, and releases the person only once it has passed", async () => {
    // The audience here is «وفادارها», not «متولدین این ماه»: the birthday group is
    // `birthMonth = currentJalaliMonth`, so a clock ۹۰ days on — مهر has become دی —
    // evaluates it to nobody, and the case would skip on AUDIENCE_EMPTY before the
    // window's question is ever asked. Loyal is `completedSessions > ۵`, a fact the
    // clock does not move, so the same person is in the audience on every tick.
    await unscoped.customer.update({
      where: { id: CUSTOMER_A },
      data: { completedSessions: 6 },
    })
    await consent(CUSTOMER_A)
    await activeCampaign({
      scheduleKind: CampaignScheduleKind.DailyAt,
      scheduledTime: '09:00',
      isRecurring: true,
      scheduledAt: new Date(NOW.getTime() - DAY_MS),
      audienceGroupId: loyalGroupId,
    })

    // Day ۰: the run delivers and advances.
    await dispatch()
    expect(await ledger('SENT')).toHaveLength(1)

    // Day ۱: a new period by the clock, but the ledger's period key still holds —
    // the row the period wrote is the period's fact, so nothing is written and the
    // schedule advances on a run that sent nothing.
    const nextDay = await dispatch(new Date(NOW.getTime() + DAY_MS))
    expect(nextDay?.sent).toBe(0)
    expect(nextDay?.suppressed).toBe(0)
    // The ledger is still exactly the one row day ۰ wrote.
    expect(await ledger()).toHaveLength(1)

    // Day ۲: the period lock opens — the schedule has advanced past the first run's
    // row — and the ۹۰-day window then holds the person. The promise «یک پیام در ۹۰
    // روز» is made to the person across every message the clinic sends, so a campaign
    // that recurs daily still cannot reach them, and the refusal is named as the
    // window and not the period.
    const thirdDay = await dispatch(new Date(NOW.getTime() + 2 * DAY_MS))
    expect(thirdDay?.sent).toBe(0)
    const reasons = new Map(
      (await ledger('SUPPRESSED')).map((row) => [row.customerId, row.suppressedReason]),
    )
    expect(reasons.get(CUSTOMER_A)).toBe('DUPLICATE_WINDOW')

    // Ninety more daily runs would each have advanced the schedule by one local day;
    // that state is seeded directly rather than ticked through, and the final tick is
    // a day past the person's window — the person is reachable again, exactly once
    // for the new period.
    await unscoped.campaign.update({
      where: { id: CAMPAIGN_ID },
      data: { scheduledAt: new Date(NOW.getTime() + 92 * DAY_MS - 4 * 60 * 60 * 1000) },
    })
    const released = await dispatch(new Date(NOW.getTime() + 92 * DAY_MS))
    expect(released?.sent).toBe(1)
    expect(await ledger('SENT')).toHaveLength(2)
  })
})
