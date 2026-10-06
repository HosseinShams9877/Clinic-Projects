/**
 * The template read and its validation — `07-localization.md` §7.3's two lines of
 * defence, in the order the document states them:
 *
 * > An unknown placeholder fails validation in settings, not at send time.
 *
 * The first line is `validateTemplateText`, which compares a template's placeholders
 * against the kind's allow-list and refuses a text the kind cannot fill. The second
 * is the renderer itself, which raises on a placeholder with no value; the first is
 * what makes the second unreachable from a settings screen.
 *
 * ## Why a template falls back to the shipped default
 *
 * A tenant that has never opened «پیامها» has no rows, and a dispatch that found none
 * would send nothing — which is a clinic whose confirmations silently stopped on the
 * day it signed up. `readTemplate` answers with the catalog's default, and the
 * settings tab of Phase 10 will render that default as the editable text rather than
 * as an empty field. The default is what the clinic sends until it chooses something,
 * and the choice is the only thing the row stores.
 *
 * ## Why `ensureDefaultTemplates` never overwrites
 *
 * Seeding is idempotent on the `(automaticKind, channel)` pair, and a row the clinic
 * already holds is a row the clinic already edited. A seed that overwrote it would
 * be a default nobody can trust, which is the same argument `02-architecture.md`
 * §13.4 makes about onboarding defaults generally.
 */

import { Channel } from '@/core/constants'
import type { AutomaticMessageKind } from '@/core/constants'
import {
  templatePlaceholders,
  renderMessage,
  type MessageValue,
} from '@/core/localization'
import { ValidationError } from '@/core/types'
import type { TransactionClient } from '@/core/db/scope'

import {
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
} from '../catalog'
import type { MessageTemplateRow } from '../types'

/** The columns a template read carries, and nothing more. */
const TEMPLATE_SELECT = {
  id: true,
  automaticKind: true,
  channel: true,
  text: true,
  isActive: true,
} as const

/**
 * One kind's template for a channel — the tenant's own row, or the shipped default
 * when the row is absent or has been deactivated.
 *
 * Deactivation is the clinic's off switch for a single message: an `isActive = false`
 * row is a message the clinic chose not to send, and the read answers with an
 * inactive row so the sender can refuse it rather than fall back to a default the
 * clinic just turned off.
 */
export async function readTemplate(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly kind: AutomaticMessageKind
  readonly channel: Channel
}): Promise<MessageTemplateRow> {
  const row = await args.tx.messageTemplate.findUnique({
    where: {
      tenantId_automaticKind_channel: {
        tenantId: args.tenantId,
        automaticKind: args.kind,
        channel: args.channel,
      },
    },
    select: TEMPLATE_SELECT,
  })

  if (row === null) {
    return Object.freeze({
      id: null,
      automaticKind: args.kind,
      channel: args.channel,
      text: DEFAULT_TEMPLATES[args.kind],
      isActive: true,
    })
  }

  return Object.freeze({
    id: row.id,
    automaticKind: row.automaticKind as AutomaticMessageKind,
    channel: row.channel as Channel,
    text: row.text,
    isActive: row.isActive,
  })
}

/**
 * The seven templates of one channel, in the constants module's own order, each
 * falling back to the shipped default — the read the «پیامها» tab renders as a table.
 */
export async function templatesForChannel(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly channel: Channel
}): Promise<readonly MessageTemplateRow[]> {
  const kinds = Object.keys(TEMPLATE_PLACEHOLDERS) as readonly AutomaticMessageKind[]
  return Promise.all(
    kinds.map((kind) =>
      readTemplate({ tx: args.tx, tenantId: args.tenantId, kind, channel: args.channel }),
    ),
  )
}

/**
 * Seeds the templates a tenant is missing, and never the ones it has.
 *
 * @returns the kinds a row was created for, for the caller's own accounting.
 */
export async function ensureDefaultTemplates(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly channel?: Channel
}): Promise<readonly AutomaticMessageKind[]> {
  const channel = args.channel ?? Channel.Sms
  const kinds = Object.keys(TEMPLATE_PLACEHOLDERS) as readonly AutomaticMessageKind[]

  const created: AutomaticMessageKind[] = []
  for (const kind of kinds) {
    const existing = await args.tx.messageTemplate.findUnique({
      where: {
        tenantId_automaticKind_channel: {
          tenantId: args.tenantId,
          automaticKind: kind,
          channel,
        },
      },
      select: { id: true },
    })
    if (existing !== null) continue

    await args.tx.messageTemplate.create({
      data: {
        tenantId: args.tenantId,
        automaticKind: kind,
        channel,
        text: DEFAULT_TEMPLATES[kind],
        isActive: true,
      },
    })
    created.push(kind)
  }
  return created
}

/**
 * Refuses a template whose placeholders the kind cannot fill.
 *
 * @throws `ValidationError`, as `messages.placeholderUnknown` — DoD 7's settings-time
 *   failure, so the message that would have rendered an empty gap is never sent.
 */
export function validateTemplateText(kind: AutomaticMessageKind, text: string): void {
  const allowed = TEMPLATE_PLACEHOLDERS[kind]
  for (const placeholder of templatePlaceholders(text)) {
    if (!allowed.includes(placeholder)) {
      throw new ValidationError(
        `The ${kind} template uses the placeholder {${placeholder}}, which this kind does not provide.`,
        { messageKey: 'messages.placeholderUnknown', detail: { kind, placeholder } },
      )
    }
  }
}

/**
 * Renders one kind's template with a record's values — the second line of defence,
 * which raises on a placeholder the record did not fill.
 *
 * @throws `ValidationError` — a placeholder with no value, which the allow-list above
 *   makes unreachable from a settings screen and reachable only from a caller that
 *   handed the wrong record.
 */
export function renderAutomaticTemplate(
  template: MessageTemplateRow,
  values: Readonly<Record<string, MessageValue>>,
): string {
  return renderMessage(template.text, values)
}
