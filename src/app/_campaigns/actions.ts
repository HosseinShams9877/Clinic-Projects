/**
 * The campaigns surface's eight actions, as the manager panel renders them.
 *
 * The page is a builder, an assistant and a results table, and the seven are what move a
 * campaign between them: the assistant reads a brief, the preview counts an audience, the
 * create writes a draft, and the four state actions walk the row through the gate
 * `03-data-model.md` §2.6's invariant keeps — `DRAFT → AWAITING_APPROVAL → APPROVED →
 * ACTIVE ⇄ PAUSED`, with `FINISHED` the one-time campaign's own end.
 *
 * ## Why the interpret action is a server action at all
 *
 * The interpreter is pure — no database, no tenant — and a client component could call a
 * pure function. The barrel is server-only because the module sits beside modules that
 * touch the database, and the boundary rule (`02-architecture.md` §10 rule 4) is one the
 * whole tier keeps rather than one it keeps where it is cheap. The action is the boundary,
 * and it does the one thing the client cannot: resolve the proposal's group *key* to the
 * tenant's own group *id*, which is what the builder's dropdown holds.
 *
 * ## Why the create cannot name an approval fact
 *
 * `createCampaign` writes a `DRAFT`, and the two columns the gate is written in stay
 * `null` — a row the action created and the row an approval state describes are two
 * different rows, and the create path has no argument for an approver because the module
 * offers none. The gate's server-side assertion is `activateCampaign`'s own
 * `assertApprovalFacts`, and no action here can reach around it.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { CampaignType, Channel, isMember } from '@/core/constants'
import { prisma, runInTenantScope } from '@/core/db'
import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import { DomainError } from '@/core/types'
import { realClock } from '@/core/lib/clock'
import { asLocalDate, asLocalTime, toUtcInstant } from '@/core/localization'

import { CAMPAIGNS_PAGE } from '@/app/catalog'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'
import { moduleFailureMessage } from '@/app/_shared/module-failure'
import {
  type CampaignInput,
  activateCampaign,
  approveCampaign,
  createCampaign,
  previewCampaignAudience,
  pauseCampaign,
  resumeCampaign,
  submitCampaignForApproval,
} from '@/modules/campaigns'
import {
  type CampaignProposal,
  interpretCampaignBrief,
} from '@/modules/campaign-assistant'
import { type AudienceGroupRow, listAudienceGroups } from '@/modules/audience-groups'

/** The manager panel the seven actions run under. */
const CAMPAIGNS_PANEL: Panel = 'admin'

/** The answer every form reads: a done, or a sentence about why it was not done. */
export type ActionResult = { readonly ok: true } | FormFailure

/** The one arm every failure is: a Persian sentence the form renders. */
export type FormFailure = { readonly ok: false; readonly message: string }

/** The assistant's proposal, with its group key resolved to the tenant's own row. */
export interface AssistantProposal {
  readonly type: CampaignProposal['type']
  readonly audienceGroupId: string | null
  readonly messageText: string
  readonly scheduleKind: CampaignProposal['scheduleKind']
  /** The proposal's first run, as an ISO instant the form's date and time split. */
  readonly scheduledAt: string | null
  readonly scheduledTime: string | null
  readonly isRecurring: boolean
  readonly channel: Channel
  readonly confidence: number
}

/** The fields the builder sends, as the form holds them before the module parses them. */
export interface CampaignFormInput {
  readonly name: string
  readonly type: string
  readonly channel: string
  readonly audienceGroupId: string
  readonly messageText: string
  readonly scheduleKind: string
  readonly localDate: string
  readonly localTime: string
  readonly isRecurring: boolean
  readonly dailyCap: string
}

/* ── The assistant and the preview ─────────────────────────────────────────── */

/**
 * «پیشنهاد بگیر» — reads the brief and answers the proposal the builder applies.
 *
 * A group the tenant does not hold — a fresh tenant the seed has not run for — resolves
 * to `null`, and the builder leaves the dropdown where it was rather than naming a group
 * the clinic has no row for.
 */
export async function interpretBriefAction(
  text: string,
): Promise<{ readonly ok: true; readonly proposal: AssistantProposal } | FormFailure> {
  const session = await resolveStaffPanel(CAMPAIGNS_PANEL)
  const result = await interpretCampaignBrief({
    brief: { text, channel: Channel.Sms },
    now: realClock(),
  }).then(
    (proposal) => ({ ok: true, proposal }) as const,
    (error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const,
  )
  if (!('proposal' in result)) return result

  // A key is a name; the builder's dropdown holds ids, so the tenant's own row for the
  // name is the one thing the assistant cannot supply from the text alone.
  let groups: readonly AudienceGroupRow[] = []
  try {
    groups = await runInTenantScope(session.permissions, prisma(), (tx) =>
      listAudienceGroups(tx, session.permissions.tenantId),
    )
  } catch {
    groups = []
  }
  const group = groups.find(
    (row) => row.key !== null && row.key === result.proposal.audienceGroupKey,
  )

  return {
    ok: true,
    proposal: {
      ...result.proposal,
      audienceGroupId: group?.id ?? null,
      scheduledAt: result.proposal.scheduledAt?.toISOString() ?? null,
    },
  }
}

/**
 * The live count beside the builder's group choice.
 *
 * Re-evaluated on each change of the dropdown, because a stored count is a number from a
 * clock the preview has not run on and a manager approving a campaign reads this number.
 */
export async function previewAudienceCountAction(
  audienceGroupId: string,
): Promise<{ readonly ok: true; readonly count: number } | FormFailure> {
  const session = await resolveStaffPanel(CAMPAIGNS_PANEL)
  try {
    const count = await runInTenantScope(session.permissions, prisma(), (tx) =>
      previewCampaignAudience({
        tx,
        tenantId: session.permissions.tenantId,
        audienceGroupId,
        now: realClock(),
      }),
    )
    return { ok: true, count }
  } catch (error) {
    return { ok: false, message: moduleFailureMessage(error) }
  }
}

/* ── The builder's one write ──────────────────────────────────────────────── */

/**
 * «ساخت پیش‌نویس کمپین» — the builder's one create, which is a draft and nothing more.
 *
 * The date and time arrive as the form's own strings and become the instant the module's
 * contract takes, because a `LocalDate` and a `LocalTime` are branded types a form cannot
 * produce and the conversion is the boundary's job (`05-conventions.md` §7).
 */
export async function createCampaignAction(
  input: CampaignFormInput,
): Promise<ActionResult> {
  const type = input.type
  const channel = input.channel
  if (!isMember(CampaignType, type) || !isMember(Channel, channel)) {
    return {
      ok: false,
      message: moduleFailureMessage(
        new DomainError('The form sent a type or channel the closed sets do not hold.', {
          messageKey: 'campaigns.typeUnknown',
        }),
      ),
    }
  }

  const parsed = parseSchedule(input)
  if (!parsed.ok) return parsed

  const result = await inTenantScope(({ tx, ctx }) =>
    createCampaign({
      tx,
      ctx,
      now: realClock(),
      input: {
        name: input.name,
        type,
        channel,
        audienceGroupId: input.audienceGroupId,
        messageText: input.messageText,
        scheduleKind: parsed.value.scheduleKind,
        scheduledAt: parsed.value.scheduledAt,
        scheduledTime: parsed.value.scheduledTime,
        isRecurring: input.isRecurring,
        dailyCap: parsed.value.dailyCap,
      },
    }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCampaigns()
  return { ok: true }
}

/* ── The row's four state actions ─────────────────────────────────────────── */

/** «ارسال برای تأیید» — the draft becomes an approver's question. */
export async function submitCampaignAction(campaignId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    submitCampaignForApproval({ tx, ctx, campaignId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCampaigns()
  return { ok: true }
}

/**
 * «تأیید» — the gate's first half, and the one column-pair it writes.
 *
 * The module refuses an approver who created the draft, and the sentence for it is the
 * catalog's own — the page names it beside the button, because a manager who is both the
 * draft's author and the panel's only approver is a manager reading the sentence and
 * asking a colleague, not a manager reading a refusal and not knowing why.
 */
export async function approveCampaignAction(campaignId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    approveCampaign({ tx, ctx, campaignId, now: realClock() }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCampaigns()
  return { ok: true }
}

/** «فعال کردن» — the gate's second half, and the edge immutable rule 4 is about. */
export async function activateCampaignAction(campaignId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    activateCampaign({ tx, ctx, campaignId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCampaigns()
  return { ok: true }
}

/** «توقف موقت» — holds an active campaign's schedule without closing it. */
export async function pauseCampaignAction(campaignId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    pauseCampaign({ tx, ctx, campaignId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCampaigns()
  return { ok: true }
}

/** «از سرگیری» — the reverse, on the same row. */
export async function resumeCampaignAction(campaignId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    resumeCampaign({ tx, ctx, campaignId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCampaigns()
  return { ok: true }
}

/* ── The scope every action runs in ────────────────────────────────────────── */

/** One action's own scope: the transaction and the caller's own context. */
interface ScopeArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}

/**
 * One action's write, inside the tenant scope the shell resolved.
 *
 * The catch is the one place the file speaks Persian: a module's `AppError` carries an
 * English message and a catalog key, and the form reads the key's own sentence.
 */
async function inTenantScope<T>(
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(CAMPAIGNS_PANEL)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions }),
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const)
}

/** The sentinel a block returns when it has nothing but a success to report. */
const SUCCESS = { succeeded: true } as const

/** The page the builder and the results table both render on. */
function revalidateCampaigns(): void {
  revalidatePath('/admin/campaigns')
}

/* ── The builder's own parse ───────────────────────────────────────────────── */

/** The schedule the module takes, built from the two strings the form holds. */
interface ParsedSchedule {
  readonly scheduleKind: CampaignInput['scheduleKind']
  readonly scheduledAt: Date | null
  readonly scheduledTime: string | null
  readonly dailyCap: number | null
}

/** One action's pre-scope outcome: either the parsed schedule or the sentence the form reads. */
type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

/**
 * Turns the form's date and time into the instant and the `HH:mm` the module's contract
 * takes, or the page's own sentence about a date the form did not send.
 */
function parseSchedule(input: CampaignFormInput): Parsed<ParsedSchedule> {
  const dailyCap = input.dailyCap.trim()
  const parsedCap = dailyCap === '' ? null : Number.parseInt(dailyCap, 10)
  if (dailyCap !== '' && (parsedCap === null || Number.isNaN(parsedCap))) {
    return { ok: false, message: CAMPAIGNS_PAGE.builder.validation.dailyCap }
  }

  if (input.scheduleKind === 'DAILY_AT') {
    return {
      ok: true,
      value: {
        scheduleKind: 'DAILY_AT',
        scheduledAt: realClock(),
        scheduledTime: input.localTime.trim() === '' ? null : asLocalTime(input.localTime),
        dailyCap: parsedCap,
      },
    }
  }

  if (input.scheduleKind === 'MONTHLY_DAY') {
    if (input.localDate.trim() === '') {
      return { ok: false, message: CAMPAIGNS_PAGE.builder.validation.scheduleRequired }
    }
    return {
      ok: true,
      value: {
        scheduleKind: 'MONTHLY_DAY',
        scheduledAt: toUtcInstant(asLocalDate(input.localDate), asLocalTime('00:00')),
        scheduledTime: null,
        dailyCap: parsedCap,
      },
    }
  }

  if (input.localDate.trim() === '') {
    return { ok: false, message: CAMPAIGNS_PAGE.builder.validation.scheduleRequired }
  }
  const time = input.localTime.trim() === '' ? '09:00' : input.localTime
  return {
    ok: true,
    value: {
      scheduleKind: 'ONE_TIME',
      scheduledAt: toUtcInstant(asLocalDate(input.localDate), asLocalTime(time)),
      scheduledTime: null,
      dailyCap: parsedCap,
    },
  }
}