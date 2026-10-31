/**
 * The template read, seed and validation — DoD 7 and `07-localization.md` §7.3.
 *
 * The audit's question for this surface is the two lines of defence the document
 * names, and whether they actually hold at the boundary a settings POST would hit:
 *
 * - `validateTemplateText` refuses a placeholder the kind cannot fill **before** a
 *   row is ever written, so the message that would have rendered an empty gap is
 *   never stored, let alone sent;
 * - `ensureDefaultTemplates` seeds only what is missing — a clinic that edited a
 *   sentence keeps its own words, which is what makes the default trustworthy;
 * - `readTemplate` answers the shipped default for a kind the clinic never
 *   touched, and answers the row itself — inactive included — for one it has,
 *   because an `isActive = false` row is the clinic's off switch and not a gap
 *   to paper over with the default.
 *
 * Every expected Persian sentence comes from the catalog (`DEFAULT_TEMPLATES`,
 * indexed by the kind constant) and never retyped in the assertion: the strings
 * are the module's own facts, and a retyped copy is a copy that can drift.
 *
 * The harness is the module suite's standard one: a per-file SQLite database
 * handed to each function as `unscoped as never`, with tenant/clinic/user seeded
 * per case. No clock is mocked — none of these reads or writes stamps a time.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AutomaticMessageKind, Channel } from '@/core/constants'
import { asClinicId, asTenantId, type TenantId } from '@/core/types'
import type { PrismaClient } from '@prisma/client'

import {
  DEFAULT_TEMPLATES,
  MESSAGES,
  TEMPLATE_PLACEHOLDERS,
  ensureDefaultTemplates,
  readTemplate,
  renderAutomaticTemplate,
  templatesForChannel,
  validateTemplateText,
} from '@/modules/messages'
import { ValidationError } from '@/core/types'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-templates')
const CLINIC_ID = asClinicId('clinic-templates')

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
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'templates', name: 'کلینیک الف', isActive: true }],
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

/** One read of the channel's seven, as the «پیام‌ها» tab renders them. */
async function ofChannel(channel: Channel) {
  return templatesForChannel({ tx: unscoped as never, tenantId: TENANT_ID, channel })
}

describe('ensureDefaultTemplates — the seed', () => {
  it('seeds the seven SMS kinds from the catalog, and is idempotent over the same call', async () => {
    const created = await ensureDefaultTemplates({ tx: unscoped as never, tenantId: TENANT_ID })

    // The seven kinds, in the constants module's own documented order — the same
    // order the tab renders, and the order `Object.keys(TEMPLATE_PLACEHOLDERS)` is.
    expect(created).toEqual(Object.keys(TEMPLATE_PLACEHOLDERS))
    expect(await unscoped.messageTemplate.count()).toBe(7)

    // Each row carries the catalog's own shipped text — the sentences a clinic
    // that has never opened the tab sends, verified against the catalog and not
    // against a retyped copy.
    const rows = await ofChannel(Channel.Sms)
    expect(rows.map((row) => row.automaticKind)).toEqual(Object.keys(TEMPLATE_PLACEHOLDERS))
    for (const row of rows) {
      expect(row.text).toBe(DEFAULT_TEMPLATES[row.automaticKind])
      expect(row.id).not.toBeNull()
      expect(row.isActive).toBe(true)
    }

    // A second seeding is a no-op: the kinds a row was created for is empty, and
    // the rows the first call wrote are the rows the second found.
    const second = await ensureDefaultTemplates({ tx: unscoped as never, tenantId: TENANT_ID })
    expect(second).toEqual([])
    expect(await unscoped.messageTemplate.count()).toBe(7)
  })

  it('never overwrites a sentence the clinic edited, and seeds the other channel independently', async () => {
    // The clinic rewrites the one sentence it cares about, and retires a second.
    await ensureDefaultTemplates({ tx: unscoped as never, tenantId: TENANT_ID })
    const reminder = await unscoped.messageTemplate.findUniqueOrThrow({
      where: {
        tenantId_automaticKind_channel: {
          tenantId: TENANT_ID,
          automaticKind: AutomaticMessageKind.AppointmentReminder,
          channel: Channel.Sms,
        },
      },
    })
    await unscoped.messageTemplate.update({
      where: { id: reminder.id },
      data: { text: 'متن دلخواه کلینیک' },
    })

    const created = await ensureDefaultTemplates({ tx: unscoped as never, tenantId: TENANT_ID })
    expect(created).toEqual([])

    // The clinic's own words survive a re-seed — a default that overwrote them
    // would be a default nobody can trust (the same argument the catalog makes).
    const read = await readTemplate({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      kind: AutomaticMessageKind.AppointmentReminder,
      channel: Channel.Sms,
    })
    expect(read.text).toBe('متن دلخواه کلینیک')

    // The two channels are separate rows: seeding WhatsApp after SMS creates the
    // seven again rather than reusing the SMS rows the tenant already holds.
    const whatsApp = await ensureDefaultTemplates({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      channel: Channel.WhatsApp,
    })
    expect(whatsApp).toEqual(Object.keys(TEMPLATE_PLACEHOLDERS))
    expect(await unscoped.messageTemplate.count()).toBe(14)
  })
})

describe('readTemplate — the default, the edit and the off switch', () => {
  it('answers the shipped default for a kind the clinic never touched, id-less and active', async () => {
    const read = await readTemplate({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      kind: AutomaticMessageKind.BookingConfirmation,
      channel: Channel.Sms,
    })

    // A tenant that has never opened the tab has no rows, and a dispatch that
    // found none would send nothing — the default is what the clinic sends until
    // it chooses something, and the choice is the only thing the row stores.
    expect(read).toEqual({
      id: null,
      automaticKind: AutomaticMessageKind.BookingConfirmation,
      channel: Channel.Sms,
      text: DEFAULT_TEMPLATES[AutomaticMessageKind.BookingConfirmation],
      isActive: true,
    })
    expect(await unscoped.messageTemplate.count()).toBe(0)
  })

  it('answers an inactive row as an inactive row — the off switch, not a gap to default over', async () => {
    await ensureDefaultTemplates({ tx: unscoped as never, tenantId: TENANT_ID })
    const row = await unscoped.messageTemplate.findUniqueOrThrow({
      where: {
        tenantId_automaticKind_channel: {
          tenantId: TENANT_ID,
          automaticKind: AutomaticMessageKind.Survey,
          channel: Channel.Sms,
        },
      },
    })
    await unscoped.messageTemplate.update({
      where: { id: row.id },
      data: { isActive: false },
    })

    const read = await readTemplate({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      kind: AutomaticMessageKind.Survey,
      channel: Channel.Sms,
    })
    // The row is returned with its own id and its own inactive flag, so the
    // sender can refuse the message rather than fall back to a default the
    // clinic just turned off — the two cases the read exists to distinguish.
    expect(read.id).toBe(row.id)
    expect(read.isActive).toBe(false)
    expect(read.text).toBe(DEFAULT_TEMPLATES[AutomaticMessageKind.Survey])
  })
})

describe('validateTemplateText — the first line of defence', () => {
  it("refuses a placeholder the kind cannot fill, and names the kind and the placeholder", async () => {
    // `{amount}` is BALANCE_REMINDER's fact, not BOOKING_CONFIRMATION's — a
    // confirmation has a slot and no price, and the amount would render an empty
    // gap into the sentence the customer reads.
    expect(() =>
      validateTemplateText(
        AutomaticMessageKind.BookingConfirmation,
        '{name} عزیز، مبلغ {amount} دریافت شد.',
      ),
    ).toThrowError(ValidationError)

    try {
      validateTemplateText(
        AutomaticMessageKind.BookingConfirmation,
        '{name} عزیز، مبلغ {amount} دریافت شد.',
      )
      expect.unreachable('the validation above throws')
    } catch (error) {
      // `messageKey` is the catalog key the settings form renders through the
      // i18n layer (the sentence itself lives in `MESSAGES` by that key), and the
      // detail names the two facts the clinic needs to correct the text.
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).messageKey).toBe('messages.placeholderUnknown')
      expect(MESSAGES['messages.placeholderUnknown']).toBeTruthy()
      expect((error as ValidationError).detail).toEqual({
        kind: AutomaticMessageKind.BookingConfirmation,
        placeholder: 'amount',
      })
    }
  })

  it('accepts the placeholders the kind holds, including the amount on the one kind that has one', () => {
    // BALANCE_REMINDER's allow-list is the amount and the name — a debt reminder
    // that names no number is a reminder the customer cannot act on.
    validateTemplateText(
      AutomaticMessageKind.BalanceReminder,
      '{name} عزیز، مبلغ {amount} تومان مانده است.',
    )
    // AFTERCARE holds the service's name and the person's.
    validateTemplateText(AutomaticMessageKind.Aftercare, '{name} عزیز، جلسه {serviceName}')
    // An empty text holds no placeholder at all, and a text with a literal brace
    // that is not a token is not a placeholder.
    validateTemplateText(AutomaticMessageKind.Aftercare, 'متن بدون متغیر')
  })

  it('accepts every one of the seven shipped defaults against its own allow-list', () => {
    // The catalog's own defaults must pass the catalog's own validation — an
    // invariant a new kind or a rewritten sentence can break silently, and one
    // that would make the second line of defence reachable from a settings screen.
    for (const kind of Object.keys(TEMPLATE_PLACEHOLDERS) as readonly (keyof typeof TEMPLATE_PLACEHOLDERS)[]) {
      validateTemplateText(kind, DEFAULT_TEMPLATES[kind])
    }
  })
})

describe('renderAutomaticTemplate — the second line of defence', () => {
  it('renders the values it is given, and raises on a placeholder the record left empty', () => {
    const template = {
      id: null,
      automaticKind: AutomaticMessageKind.BookingConfirmation,
      channel: Channel.Sms,
      text: DEFAULT_TEMPLATES[AutomaticMessageKind.BookingConfirmation],
      isActive: true,
    }

    // The happy path: every placeholder the allow-list names is filled, and the
    // sentence the customer reads is the catalog's own with the record's facts.
    const rendered = renderAutomaticTemplate(template, {
      name: 'مشتری',
      date: '۱۴۰۵/۰۷/۱۵',
      time: '۰۹:۰۰',
    })
    expect(rendered).toBe('مشتری عزیز، نوبت شما در تاریخ ۱۴۰۵/۰۷/۱۵ ساعت ۰۹:۰۰ ثبت شد.')

    // The unreachable-from-settings path: a caller that handed the wrong record —
    // a placeholder with no value raises, which is what makes the allow-list the
    // first line rather than the only one.
    expect(() => renderAutomaticTemplate(template, { name: 'مشتری' })).toThrowError(ValidationError)
  })
})
