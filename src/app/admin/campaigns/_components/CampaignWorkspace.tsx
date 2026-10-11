/**
 * The campaign workspace — the assistant's card, the eight type cards, and the wizard
 * the two of them open.
 *
 * The three are one client component because the wizard's open state is the page's one
 * open question: the header's «کمپین جدید», a type card, and the assistant's «بررسی و
 * شروع» are three answers to it, and a state each of them owned would be three modals
 * the page could stack. The header's own button is the one entry the URL holds
 * (`?new=1`), so an open is a bookmarkable fact the wizard's own revalidation clears; the
 * other two carry a type or a proposal the URL cannot hold, and they open in memory.
 *
 * ## Why the assistant's figures are the reads they are
 *
 * The demo's output panel carries four figures. Two of them — a parsed rule list and an
 * SMS cost — are the demo's own: the interpreter's rules are its private vocabulary and a
 * price is a thing the schema holds nowhere, so the panel renders neither. The two it
 * does render are the audience's own size and the ledger's own conversion for the type
 * the proposal picked. A number the panel invented would be a number a manager approved
 * a campaign on.
 *
 * ## Why the conversion is the type's own
 *
 * «نرخ تبدیل کمپین مشابه» is the clinic's own campaigns of the type the proposal picked
 * and not the demo's fixed figure, so a type that has never sent reads `—`: a rate the
 * panel invented for a type with no sends is a rate the clinic has never had.
 */

'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { Field, TextArea } from '@/core/components/form'
import { CAMPAIGNS_PAGE } from '@/app/catalog'
import { ADMIN_CAMPAIGNS } from '@/app/admin/catalog'
import { formatNumber, formatPercent, toPersianDigits } from '@/core/localization'

import {
  interpretBriefAction,
  previewAudienceSampleAction,
  type AssistantProposal,
  type AudienceSample,
} from '@/app/_campaigns/actions'
import {
  CampaignBuilder,
  type BuilderChrome,
  type OptionList,
} from '@/app/_campaigns/campaign-builder'

/** One of the eight type cards, as the page composed it from the module's own catalog. */
export interface TypeCard {
  /** The type's own enum value, which the wizard's `type` field holds. */
  readonly value: string
  /** The type's own name, as the module's catalog labels it. */
  readonly label: string
  /** One sentence the module's catalog keeps about what the type is for. */
  readonly description: string
  /** The icon the card renders, from the set the icon component owns. */
  readonly icon: IconName
}

/** The audience options the page loaded for this tenant, as the wizard's dropdown holds them. */
export interface GroupOption {
  readonly id: string
  readonly name: string
}

/** The workspace's props: the type cards, the audience, the wizard's chrome, its opens. */
export interface CampaignWorkspaceProps {
  /** The eight campaign types, as the page built them from the module's own catalog. */
  readonly typeCards: readonly TypeCard[]
  /** The audience options the page loaded for this tenant. */
  readonly groups: readonly GroupOption[]
  /** The type and channel dropdown lists, as the wizard renders them. */
  readonly typeOptions: readonly OptionList[]
  readonly channelOptions: readonly OptionList[]
  /**
   * The ledger's own conversion per type — attributed visits over sends — keyed as the
   * enum spells it, or `null` for a type that has not sent yet.
   */
  readonly conversionsByType: Readonly<Record<string, number | null>>
  /** The sentence the assistant's low-confidence note renders, from its own catalog. */
  readonly lowConfidenceHint: string
  /** The wizard's own chrome, from the admin page's catalog. */
  readonly chrome: BuilderChrome
  /** Whether the URL's `?new=1` already opened the wizard. */
  readonly openFromUrl: boolean
  /** The type the URL's `?type=` preselected, or `null` when it names none. */
  readonly presetTypeFromUrl: string | null
  /** The href that closes the wizard, which the page built from its own other params. */
  readonly closeHref: string
}

/** What opened the wizard, because the three entry points carry three different presets. */
type OpenState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'url'; readonly type: string | null }
  | { readonly kind: 'type'; readonly type: string }
  | { readonly kind: 'proposal'; readonly proposal: AssistantProposal }

/**
 * «دستیار کمپین» و «انواع کمپین» و «کمپین جدید» — the three surfaces and their modal.
 */
export function CampaignWorkspace({
  typeCards,
  groups,
  typeOptions,
  channelOptions,
  conversionsByType,
  lowConfidenceHint,
  chrome,
  openFromUrl,
  presetTypeFromUrl,
  closeHref,
}: CampaignWorkspaceProps) {
  const router = useRouter()
  const [open, setOpen] = useState<OpenState>(
    openFromUrl ? { kind: 'url', type: presetTypeFromUrl } : { kind: 'closed' },
  )

  return (
    <>
      <AssistantCard
        groups={groups}
        typeOptions={typeOptions}
        conversionsByType={conversionsByType}
        lowConfidenceHint={lowConfidenceHint}
        onStart={(proposal) => setOpen({ kind: 'proposal', proposal })}
      />

      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <span className="grid size-7 place-items-center rounded-sm bg-brand-50 text-brand">
              <Icon name="treatment" size="compact" />
            </span>
            {ADMIN_CAMPAIGNS.typesTitle}
          </h2>
          <span className="text-xs text-ink-3">{ADMIN_CAMPAIGNS.typesHint}</span>
        </header>
        <div className="grid grid-cols-1 gap-3 p-4 panel:grid-cols-4">
          {typeCards.map((card) => (
            <button
              key={card.value}
              type="button"
              onClick={() => setOpen({ kind: 'type', type: card.value })}
              className="flex items-start gap-3 rounded-md border border-line-2 bg-surface p-3 text-start hover:bg-brand-50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-brand-50 text-brand">
                <Icon name={card.icon} size="compact" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-bold text-ink">{card.label}</span>
                <span className="text-xs text-ink-3">{card.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {open.kind === 'closed' ? null : (
        <CampaignBuilder
          key={open.kind}
          groups={groups}
          typeOptions={typeOptions}
          channelOptions={channelOptions}
          lowConfidenceHint={lowConfidenceHint}
          chrome={chrome}
          presetType={open.kind === 'proposal' ? null : open.type}
          presetProposal={open.kind === 'proposal' ? open.proposal : null}
          onClose={() => {
            if (open.kind === 'url') router.replace(closeHref)
            setOpen({ kind: 'closed' })
          }}
        />
      )}
    </>
  )
}

/* ── The assistant's card ───────────────────────────────────────────────────── */

/**
 * «دستیار کمپین» — the box, the four example chips, and the proposal that comes back.
 *
 * The proposal fills the wizard's fields and not the database, because the interpreter
 * never writes anything; the card's «بررسی و شروع» is the manager's, and the fields it
 * fills are editable.
 */
function AssistantCard({
  groups,
  typeOptions,
  conversionsByType,
  lowConfidenceHint,
  onStart,
}: {
  readonly groups: readonly GroupOption[]
  readonly typeOptions: readonly OptionList[]
  readonly conversionsByType: Readonly<Record<string, number | null>>
  readonly lowConfidenceHint: string
  readonly onStart: (proposal: AssistantProposal) => void
}) {
  const headingId = useId()
  const [brief, setBrief] = useState('')
  const [pending, startTransition] = useTransition()
  const [proposal, setProposal] = useState<AssistantProposal | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [sample, setSample] = useState<AudienceSample | null>(null)

  function interpret(text: string) {
    if (text.trim() === '') return
    startTransition(async () => {
      const outcome = await interpretBriefAction(text)
      if (!outcome.ok) {
        setAnswer(outcome.message)
        return
      }
      setAnswer(null)
      setProposal(outcome.proposal)
      setSample(null)
      if (outcome.proposal.audienceGroupId !== null) {
        const sampled = await previewAudienceSampleAction(outcome.proposal.audienceGroupId)
        if (sampled.ok) setSample(sampled.sample)
      }
    })
  }

  const lowConfidence = proposal !== null && proposal.confidence < 1
  const typeLabel =
    proposal === null || proposal.type === null
      ? null
      : typeOptions.find((option) => option.value === proposal.type)?.label ?? null
  const groupLabel =
    proposal === null || proposal.audienceGroupId === null
      ? null
      : groups.find((option) => option.id === proposal.audienceGroupId)?.name ?? null
  const conversion =
    proposal === null || proposal.type === null ? null : conversionsByType[proposal.type] ?? null

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-bold text-ink">
          <span className="grid size-7 place-items-center rounded-sm bg-brand-50 text-brand">
            <Icon name="treatment" size="compact" />
          </span>
          {CAMPAIGNS_PAGE.builder.assistant.title}
        </h2>
        <span className="inline-flex rounded-pill bg-brand-50 px-3 py-[6px] text-xs font-semibold text-brand-700">
          {ADMIN_CAMPAIGNS.assistant.badge}
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <Field label={ADMIN_CAMPAIGNS.assistant.label}>
          <TextArea
            value={brief}
            onChange={(event) => setBrief(event.currentTarget.value)}
            placeholder={CAMPAIGNS_PAGE.builder.assistant.placeholder}
            rows={2}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          {ADMIN_CAMPAIGNS.examples.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => {
                setBrief(example.brief)
                void interpret(example.brief)
              }}
              className="rounded-pill border border-line-2 bg-surface px-3 py-[6px] text-xs font-semibold text-ink-2 hover:border-brand-300 hover:text-brand-700"
            >
              {example.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="small"
            variant="primary"
            loading={pending}
            disabled={brief.trim() === ''}
            onClick={() => void interpret(brief)}
          >
            {ADMIN_CAMPAIGNS.assistant.build}
          </Button>
          <span className="text-xs text-ink-3">{ADMIN_CAMPAIGNS.assistant.hint}</span>
        </div>

        {proposal === null ? null : (
          <div className="flex flex-col gap-4 border-t border-line-2 pt-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-2">
                {ADMIN_CAMPAIGNS.assistant.understood}
              </span>
              <div className="flex flex-wrap gap-2">
                {typeLabel === null ? null : (
                  <span className="rounded-xs bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
                    {typeLabel}
                  </span>
                )}
                {groupLabel === null ? null : (
                  <span className="rounded-xs bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
                    {groupLabel}
                  </span>
                )}
                <span className="rounded-xs bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
                  {CAMPAIGNS_PAGE.builder.scheduleOptions[proposal.scheduleKind]}
                </span>
                <span className="rounded-xs bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
                  {proposal.isRecurring ? ADMIN_CAMPAIGNS.runRecurring : ADMIN_CAMPAIGNS.runOnce}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SampleTile sample={sample} />
              <ConversionTile conversion={conversion} />
            </div>

            {sample === null || sample.names.length === 0 ? null : (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-ink-2">
                  {ADMIN_CAMPAIGNS.assistant.sample}
                </span>
                <div className="flex flex-wrap gap-2">
                  {sample.names.map((name) => (
                    <span
                      key={name}
                      className="rounded-pill bg-surface-sunken px-3 py-[4px] text-xs font-semibold text-ink-2"
                    >
                      {name}
                    </span>
                  ))}
                  {sample.count <= sample.names.length ? null : (
                    <span className="rounded-pill bg-brand-50 px-3 py-[4px] text-xs font-semibold text-brand-700">
                      + {toPersianDigits(sample.count - sample.names.length)}
                      {ADMIN_CAMPAIGNS.assistant.sampleMore}
                    </span>
                  )}
                </div>
              </div>
            )}

            <Field label={ADMIN_CAMPAIGNS.assistant.messageLabel}>
              <TextArea
                value={proposal.messageText}
                onChange={(event) =>
                  setProposal({ ...proposal, messageText: event.currentTarget.value })
                }
                rows={3}
              />
            </Field>
            <span className="text-xs text-ink-3">{CAMPAIGNS_PAGE.builder.hints.placeholders}</span>

            {lowConfidence ? (
              <p
                className="flex items-center gap-1 text-xs text-warning"
                role="status"
                aria-live="polite"
              >
                <Icon name="error" size="compact" />
                {lowConfidenceHint}
              </p>
            ) : null}

            {answer !== null ? (
              <p
                className="flex items-center gap-1 text-xs text-danger"
                role="alert"
                aria-live="polite"
              >
                <Icon name="error" size="compact" />
                {answer}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="small"
                variant="primary"
                disabled={pending}
                onClick={() => onStart(proposal)}
              >
                {ADMIN_CAMPAIGNS.assistant.openBuilder}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** One of the two tiles the output panel renders — the audience's own size. */
function SampleTile({ sample }: { readonly sample: AudienceSample | null }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
        <Icon name="customers" size="card" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-3">{ADMIN_CAMPAIGNS.assistant.audience}</span>
        <span className="text-lg font-bold text-ink tabular-nums">
          {sample === null
            ? ADMIN_CAMPAIGNS.assistant.conversionNone
            : `${formatNumber(sample.count)}${ADMIN_CAMPAIGNS.groupCountSuffix}`}
        </span>
      </span>
    </div>
  )
}

/**
 * One of the two tiles the output panel renders — the type's own conversion.
 *
 * `null` while no proposal has arrived, and `—` when the type has sent nothing, because
 * a rate the panel invented for a type with no sends is a rate the clinic never had.
 */
function ConversionTile({ conversion }: { readonly conversion: number | null }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-warn-bg text-warn">
        <Icon name="reports" size="card" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-3">{ADMIN_CAMPAIGNS.assistant.conversion}</span>
        <span className="text-lg font-bold text-ink tabular-nums">
          {conversion === null ? ADMIN_CAMPAIGNS.assistant.conversionNone : formatPercent(conversion)}
        </span>
      </span>
    </div>
  )
}
