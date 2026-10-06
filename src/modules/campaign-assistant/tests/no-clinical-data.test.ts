/**
 * DoD 3 — the assistant never returns or accepts a clinical field.
 *
 * The contract is two negatives, and each is a property a test can hold:
 *
 * - **The signature carries no database reach.** `interpretCampaignBrief` takes a brief
 *   and a clock. No `TransactionClient`, no tenant, no customer id — so the type-level
 *   assertion below is the guarantee, and a caller who tried to hand it a client would
 *   not compile.
 * - **The field allow-list is closed.** `audienceCondition` takes `AudienceField`, and
 *   `medicalHistory` is not a member, so the `@ts-expect-error` is a test that fails the
 *   day someone widens the set. The Zod schema is generated from the same keys, so a
 *   predicate written by hand past the type is rejected at read time as well.
 *
 * A third thing the test does not need to assert: the proposal's own fields are the
 * closed sets' members, which the interpreter's return type already keeps and the
 * runtime check below names.
 */

import { describe, expect, expectTypeOf, it } from 'vitest'

import { AudienceGroupKey, CampaignScheduleKind, CampaignType, Channel } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import {
  audienceCondition,
  parsePredicate,
} from '@/modules/audience-groups'
import { interpretCampaignBrief } from '@/modules/campaign-assistant'

const NOW = new Date('2026-10-06T10:00:00Z')

describe('DoD 3 — the assistant never returns or accepts a clinical field', () => {
  it('takes no transaction, no tenant and no customer id', () => {
    // The equality is the guarantee: the parameter object holds exactly a brief and a
    // clock, and a clinical read needs a client the signature has no slot for.
    expectTypeOf<Parameters<typeof interpretCampaignBrief>[0]>().toEqualTypeOf<{
      readonly brief: { readonly text: string; readonly channel: Channel }
      readonly now: Date
    }>()

    // A caller who tried to hand it a client is a caller the compiler turns away.
    expectTypeOf<TransactionClient>().not.toMatchTypeOf<
      Parameters<typeof interpretCampaignBrief>[0]
    >()
  })

  it('rejects a clinical field at compile time and at read time', () => {
    // The `@ts-expect-error` is the assertion: `medicalHistory` is not an
    // `AudienceField`, so this call does not type-check. If the set ever admits a
    // clinical name, the error disappears and this test fails instead.
    // @ts-expect-error — a clinical column is not a field a predicate may name.
    audienceCondition({ field: 'medicalHistory', op: 'eq', value: 'حساسیت' })

    // A row written by hand past the type is the case the Zod schema is for: the
    // schema is keyed on the same allow-list, so the read raises rather than
    // selecting on a column the evaluator has no path to.
    expect(() =>
      parsePredicate(
        JSON.stringify({
          kind: 'CONDITIONS',
          conditions: [{ field: 'medicalHistory', op: 'eq', value: 'حساسیت' }],
        }),
      ),
    ).toThrow()
  })

  it('answers a proposal whose fields stay inside the closed sets', async () => {
    const proposal = await interpretCampaignBrief({
      brief: { text: 'مشتریانی که مدت زیادی است نیامده‌اند', channel: Channel.Sms },
      now: NOW,
    })

    const types = new Set<string>(Object.values(CampaignType))
    const groups = new Set<string>(Object.values(AudienceGroupKey))
    const schedules = new Set<string>(Object.values(CampaignScheduleKind))

    expect(proposal.type === null || types.has(proposal.type)).toBe(true)
    expect(
      proposal.audienceGroupKey === null || groups.has(proposal.audienceGroupKey),
    ).toBe(true)
    expect(schedules.has(proposal.scheduleKind)).toBe(true)
    expect(proposal.confidence).toBeGreaterThanOrEqual(0)
    expect(proposal.confidence).toBeLessThanOrEqual(1)
    expect(typeof proposal.messageText).toBe('string')
  })
})
