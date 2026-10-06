/**
 * DoD 2 — no campaign dispatches before approval, as a server-side assertion.
 *
 * `03-data-model.md` §2.6's invariant is the rule immutable rule 4 names, and the three
 * gates that keep it are three different things: the dispatch *scans* `status = ACTIVE`,
 * `activateCampaign` *refuses* without the two approval columns, and `dispatchOne`
 * *re-asserts* the pair before a single send. A UI that hid the activate button would be
 * one gate; the test breaks the other two on purpose, because a row that reached the
 * sending state by any path other than `manage.ts` is the row the third gate is for.
 *
 * The three cases are a draft the scan never reaches, an `ACTIVE` row written with the
 * two columns null, and the real path through submit, approve as a second person, and
 * activate — which is the path the clinic takes, and the one that sends.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AudienceGroupKey,
  CampaignScheduleKind,
  CampaignStatus,
  CampaignType,
  Channel,
  CustomerLifecycle,
  Role,
} from '@/core/constants'
import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { ensureBuiltInGroups } from '@/modules/audience-groups'
import { recordConsent } from '@/modules/customers'
import {
  activateCampaign,
  approveCampaign,
  dispatchDueCampaigns,
  submitCampaignForApproval,
} from '@/modules/campaigns'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-gate')
const CLINIC_ID = asClinicId('clinic-gate')
/** The manager who writes the draft — and who may not approve it. */
const AUTHOR_ID: UserId = asUserId('staff-gate-author')
/** A second manager, who is the gate's other pair of eyes. */
const APPROVER_ID: UserId = asUserId('staff-gate-approver')
const CUSTOMER_ID = 'customer-gate'

/** مهر ۱۴۰۵ — the seeded day, so the birthday group the campaign uses is the current month's. */
const NOW = new Date('2026-10-06T10:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

/** The one campaign the dataset holds, as a draft whose first run is already a day old. */
const CAMPAIGN_ID = 'campaign-gate'

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
    data: [{ id: TENANT_ID, slug: 'gate', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  // The window is the whole day and the cap is unset, so the only thing that can hold a
  // send is the approval the test is about.
  await unscoped.tenantSettings.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        utcOffsetMinutes: 210,
        sendWindowStart: '00:00',
        sendWindowEnd: '23:59',
        dailyMessageCap: null,
      },
    ],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: AUTHOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000050',
        firstName: 'نویسنده',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: APPROVER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000051',
        firstName: 'تأییدکننده',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })

  const groups = await ensureBuiltInGroups({ tx: unscoped as never, tenantId: TENANT_ID })
  const birthday = groups.find((group) => group.key === AudienceGroupKey.Birthday)
  if (birthday === undefined) throw new Error('the eight built-in groups were not seeded')

  await unscoped.customer.createMany({
    data: [
      {
        id: CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000050',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
        birthMonth: 7,
      },
    ],
  })

  // The channel's consent, granted up front, so the approval is the only gate between
  // the campaign and the person.
  await recordConsent({
    tx: unscoped as never,
    ctx: authorContext(),
    customerId: CUSTOMER_ID,
    flags: { sms: true, whatsApp: false, phone: false, beforeAfter: false },
    source: 'PROFILE',
    now: NOW,
  })

  await unscoped.campaign.create({
    data: {
      id: CAMPAIGN_ID,
      tenantId: TENANT_ID,
      audienceGroupId: birthday.id,
      createdByUserId: AUTHOR_ID,
      name: 'کمپین درخواستی',
      type: CampaignType.Occasion,
      channel: Channel.Sms,
      messageText: '{name} عزیز، پیشنهاد ویژه‌ای برای شما داریم.',
      isRecurring: false,
      scheduleKind: CampaignScheduleKind.OneTime,
      scheduledAt: new Date(NOW.getTime() - DAY_MS),
      scheduledTime: null,
      dailyCap: null,
      status: CampaignStatus.Draft,
    },
  })
})

/** The draft's author, who may create and submit but not approve. */
function authorContext(): TenantContext {
  return Object.freeze({
    userId: AUTHOR_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [], revoked: [] }),
  })
}

/** The second manager, who is the gate's own approver. */
function approverContext(): TenantContext {
  return Object.freeze({
    userId: APPROVER_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Manager,
    overrides: Object.freeze({ granted: [], revoked: [] }),
  })
}

describe('DoD 2 — no campaign dispatches before approval', () => {
  it('never scans a draft, even one whose scheduledAt has passed', async () => {
    const outcomes = await dispatchDueCampaigns({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      now: NOW,
    })
    expect(outcomes).toHaveLength(0)
    expect(await ledgerCount()).toBe(0)
  })

  it('refuses a row forced to ACTIVE without the two approval columns', async () => {
    // The state machine is bypassed deliberately: the two columns are the facts the
    // invariant is written in, and a writer that set the status without them is the
    // case the dispatch's own assert exists for.
    await unscoped.campaign.update({
      where: { id: CAMPAIGN_ID },
      data: { status: CampaignStatus.Active },
    })

    const outcomes = await dispatchDueCampaigns({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      now: NOW,
    })
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]?.skipped).toBe('NOT_APPROVED')
    expect(outcomes[0]?.sent).toBe(0)
    expect(await ledgerCount()).toBe(0)
  })

  it('sends through the real path — submit, a second person approves, activate', async () => {
    await submitCampaignForApproval({
      tx: unscoped as never,
      ctx: authorContext(),
      campaignId: CAMPAIGN_ID,
    })
    await expect(
      approveCampaign({
        tx: unscoped as never,
        ctx: authorContext(),
        campaignId: CAMPAIGN_ID,
        now: NOW,
      }),
    ).rejects.toThrow()

    await approveCampaign({
      tx: unscoped as never,
      ctx: approverContext(),
      campaignId: CAMPAIGN_ID,
      now: NOW,
    })
    await activateCampaign({
      tx: unscoped as never,
      ctx: authorContext(),
      campaignId: CAMPAIGN_ID,
    })

    const outcomes = await dispatchDueCampaigns({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      now: NOW,
    })
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]?.skipped).toBeNull()
    expect(outcomes[0]?.evaluated).toBe(1)
    expect(outcomes[0]?.sent).toBe(1)
    expect(await ledgerCount()).toBe(1)
  })
})

/** The ledger's own row count, which is the evidence a send left the clinic. */
async function ledgerCount(): Promise<number> {
  return unscoped.messageSend.count({ where: { tenantId: TENANT_ID, campaignId: CAMPAIGN_ID } })
}
