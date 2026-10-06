/**
 * The campaign builder — the assistant's box, the form, and the live count.
 *
 * The page's three halves are the builder, the assistant and the results table, and this
 * file is the first two: the assistant reads a brief into a proposal, the proposal fills
 * the builder's fields, and the preview's count beside the audience field is the number
 * the manager is committing to. The create writes a **draft** — the approval step is a
 * row's own state and lives in the results table, because a gate the builder performed
 * would be a gate the builder's own button undid.
 *
 * ## Why the count is fetched and not computed
 *
 * `previewCampaignAudience` is the same evaluation the dispatch runs, which is what makes
 * the number the manager reads the number the campaign sends to. A client-side guess at
 * a count would be a second answer to "who is in this group", and the two would disagree
 * about the one fact the manager is approving.
 *
 * ## Why the assistant's proposal lands in the form and not the database
 *
 * The interpreter never writes anything; its answer is a draft a person reads. The
 * «اعمال پیشنهاد» button is the person's, and the fields it fills are editable — a
 * proposal the manager could not change would be a decision the assistant made.
 *
 * ## Why the option lists arrive as props
 *
 * The `campaigns` barrel is a server-only surface — it holds the dispatch, and the
 * dispatch's graph reaches modules a browser cannot load. A client component that
 * imported it for its label maps would pull that graph into the browser bundle, so the
 * page builds the two dropdown lists and hands the low-confidence sentence down, the
 * same way the debts surface hands its option lists down (`_debts/debts-forms.tsx`).
 */

'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Combobox } from '@/core/components/combobox'
import { Field, TextArea, TextInput } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { CAMPAIGNS_PAGE } from '@/app/catalog'
import { cx } from '@/core/lib'
import { DEFAULT_CLINIC_UTC_OFFSET_MINUTES } from '@/core/constants'
import { fromUtcInstant } from '@/core/localization'

import {
  createCampaignAction,
  interpretBriefAction,
  previewAudienceCountAction,
  type AssistantProposal,
  type CampaignFormInput,
} from './actions'

/** One dropdown's options, as the page built them from the module's own labels. */
export interface OptionList {
  readonly value: string
  readonly label: string
}

/**
 * The audience options the page loaded for this tenant, and the two label lists the
 * type and channel dropdowns render.
 */
export interface CampaignBuilderProps {
  readonly groups: readonly { readonly id: string; readonly name: string }[]
  readonly typeOptions: readonly OptionList[]
  readonly channelOptions: readonly OptionList[]
  /** The sentence the assistant's low-confidence note renders, from its own catalog. */
  readonly lowConfidenceHint: string
}

/** The three schedule kinds, as the form's own select offers them. */
const SCHEDULE_OPTIONS = [
  { value: 'ONE_TIME', label: CAMPAIGNS_PAGE.builder.scheduleOptions.ONE_TIME },
  { value: 'DAILY_AT', label: CAMPAIGNS_PAGE.builder.scheduleOptions.DAILY_AT },
  { value: 'MONTHLY_DAY', label: CAMPAIGNS_PAGE.builder.scheduleOptions.MONTHLY_DAY },
] as const

/**
 * «کمپین جدید» — the builder and the assistant, opened from the page's own header.
 */
export function CampaignBuilder({
  groups,
  typeOptions,
  channelOptions,
  lowConfidenceHint,
}: CampaignBuilderProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  const [brief, setBrief] = useState('')
  const [proposal, setProposal] = useState<AssistantProposal | null>(null)
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [scheduleKind, setScheduleKind] = useState<string>('ONE_TIME')
  const [type, setType] = useState<string>('OCCASION')
  const [channel, setChannel] = useState<string>('SMS')
  const titleId = useId()

  // The count follows the group, because the count is the group's and not the form's.
  const count = useAudienceCount(groupId)

  if (!open) {
    return (
      <Button variant="primary" leadingIcon="message" onClick={() => setOpen(true)}>
        {CAMPAIGNS_PAGE.builder.title}
      </Button>
    )
  }

  function applyProposal(next: AssistantProposal) {
    setProposal(next)
    setGroupId(next.audienceGroupId)
    setScheduleKind(next.scheduleKind)
    if (next.type !== null) setType(next.type)
    setChannel(next.channel)
    setAssistantAnswer(null)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input: CampaignFormInput = {
      name: asFormString(form, 'name'),
      type: asFormString(form, 'type'),
      channel: asFormString(form, 'channel'),
      audienceGroupId: asFormString(form, 'audienceGroupId'),
      messageText: asFormString(form, 'messageText'),
      scheduleKind: asFormString(form, 'scheduleKind'),
      localDate: asFormString(form, 'localDate'),
      localTime: asFormString(form, 'localTime'),
      isRecurring: checked(form, 'isRecurring'),
      dailyCap: asFormString(form, 'dailyCap'),
    }
    startTransition(async () => {
      const outcome = await createCampaignAction(input)
      if (outcome.ok) {
        setAnswer({ ok: true, message: CAMPAIGNS_PAGE.builder.actions.created })
        setOpen(false)
        return
      }
      setAnswer({ ok: false, message: outcome.message })
    })
  }

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-lg bg-surface shadow-3 panel:max-w-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line p-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {CAMPAIGNS_PAGE.builder.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={CAMPAIGNS_PAGE.builder.actions.cancel}
            onClick={() => setOpen(false)}
          />
        </header>

        <div className="flex flex-col gap-6 p-6">
          <AssistantBox
            brief={brief}
            onBriefChange={setBrief}
            proposal={proposal}
            onApply={applyProposal}
            answer={assistantAnswer}
            onAnswer={setAssistantAnswer}
            lowConfidenceHint={lowConfidenceHint}
          />

          <form id={BUILDER_FORM_ID} className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-4 panel:flex-row">
              <Field label={CAMPAIGNS_PAGE.builder.fields.name} required className="flex-1">
                <TextInput name="name" defaultValue={nameFromProposal(proposal, typeOptions)} />
              </Field>
              <Field label={CAMPAIGNS_PAGE.builder.fields.channel} className="w-full panel:w-40">
                <Combobox
                  name="channel"
                  value={channel}
                  onChange={setChannel}
                  options={channelOptions}
                  placeholder={CAMPAIGNS_PAGE.builder.fields.channel}
                  emptyMessage={CAMPAIGNS_PAGE.results.empty}
                />
              </Field>
            </div>

            <Field label={CAMPAIGNS_PAGE.builder.fields.type}>
              <Combobox
                name="type"
                value={type}
                onChange={setType}
                options={typeOptions}
                placeholder={CAMPAIGNS_PAGE.builder.fields.type}
                emptyMessage={CAMPAIGNS_PAGE.results.empty}
              />
            </Field>

            <Field
              label={CAMPAIGNS_PAGE.builder.fields.audienceGroup}
              required
              hint={count.hint}
            >
              <Combobox
                name="audienceGroupId"
                value={groupId}
                onChange={setGroupId}
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
                placeholder={CAMPAIGNS_PAGE.builder.fields.audienceGroup}
                emptyMessage={CAMPAIGNS_PAGE.results.empty}
              />
            </Field>

            <Field
              label={CAMPAIGNS_PAGE.builder.fields.messageText}
              required
              hint={CAMPAIGNS_PAGE.builder.hints.placeholders}
            >
              <TextArea name="messageText" defaultValue={proposal?.messageText ?? ''} rows={4} />
            </Field>

            <div className="flex flex-col gap-4 panel:flex-row">
              <Field label={CAMPAIGNS_PAGE.builder.fields.scheduleKind} className="flex-1">
                <Combobox
                  name="scheduleKind"
                  value={scheduleKind}
                  onChange={setScheduleKind}
                  options={SCHEDULE_OPTIONS}
                  placeholder={CAMPAIGNS_PAGE.builder.fields.scheduleKind}
                  emptyMessage={CAMPAIGNS_PAGE.results.empty}
                />
              </Field>
              <Field
                label={CAMPAIGNS_PAGE.builder.fields.dailyCap}
                className="w-full panel:w-40"
                hint={CAMPAIGNS_PAGE.builder.hints.dailyCap}
              >
                <TextInput name="dailyCap" inputMode="numeric" dir="ltr" />
              </Field>
            </div>

            {scheduleKind !== 'DAILY_AT' ? (
              <div className="flex flex-col gap-4 panel:flex-row">
                <Field
                  label={CAMPAIGNS_PAGE.builder.fields.localDate}
                  required={scheduleKind !== 'DAILY_AT'}
                  className="flex-1"
                >
                  <TextInput
                    name="localDate"
                    dir="ltr"
                    inputMode="numeric"
                    defaultValue={dateFromProposal(proposal)}
                    placeholder={CAMPAIGNS_PAGE.builder.hints.datePlaceholder}
                  />
                </Field>
                {scheduleKind === 'ONE_TIME' ? (
                  <Field label={CAMPAIGNS_PAGE.builder.fields.localTime} className="flex-1">
                    <TextInput
                      name="localTime"
                      dir="ltr"
                      inputMode="numeric"
                      defaultValue={proposal?.scheduledTime ?? CAMPAIGNS_PAGE.builder.hints.defaultTime}
                      placeholder={CAMPAIGNS_PAGE.builder.hints.defaultTime}
                    />
                  </Field>
                ) : null}
              </div>
            ) : (
              <Field label={CAMPAIGNS_PAGE.builder.fields.localTime}>
                <TextInput
                  name="localTime"
                  dir="ltr"
                  inputMode="numeric"
                  defaultValue={proposal?.scheduledTime ?? CAMPAIGNS_PAGE.builder.hints.defaultTime}
                  placeholder={CAMPAIGNS_PAGE.builder.hints.defaultTime}
                />
              </Field>
            )}

            <label className="flex items-center gap-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                name="isRecurring"
                defaultChecked={proposal?.isRecurring ?? false}
                className="size-4 rounded-xs border border-line-2 accent-brand"
              />
              {CAMPAIGNS_PAGE.builder.fields.isRecurring}
            </label>

            <FormAnswer answer={answer} />
          </form>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-6">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {CAMPAIGNS_PAGE.builder.actions.cancel}
          </Button>
          <Button type="submit" form={BUILDER_FORM_ID} variant="primary" loading={pending}>
            {CAMPAIGNS_PAGE.builder.actions.create}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the footer's submit button refers to, so the form and its button are one. */
const BUILDER_FORM_ID = 'campaign-builder-form'

/* ── The assistant's box ───────────────────────────────────────────────────── */

/**
 * «دستیار کمپین» — one textarea, one button, and the proposal that comes back.
 *
 * The low-confidence hint renders beside a proposal the assistant did not match to a
 * purpose, because a default presented as an answer is the one failure the assistant
 * can make silently.
 */
function AssistantBox({
  brief,
  onBriefChange,
  proposal,
  onApply,
  answer,
  onAnswer,
  lowConfidenceHint,
}: {
  readonly brief: string
  readonly onBriefChange: (value: string) => void
  readonly proposal: AssistantProposal | null
  readonly onApply: (proposal: AssistantProposal) => void
  readonly answer: string | null
  readonly onAnswer: (value: string | null) => void
  readonly lowConfidenceHint: string
}) {
  const [pending, startTransition] = useTransition()
  const [applied, setApplied] = useState(false)
  const headingId = useId()

  function interpret() {
    startTransition(async () => {
      const outcome = await interpretBriefAction(brief)
      if (!outcome.ok) {
        onAnswer(outcome.message)
        return
      }
      onAnswer(null)
      onApply(outcome.proposal)
      setApplied(false)
    })
  }

  const lowConfidence = proposal !== null && proposal.confidence < 1

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-4"
    >
      <div className="flex items-center gap-2">
        <Icon name="treatment" size="compact" />
        <h3 id={headingId} className="text-sm font-bold text-ink">
          {CAMPAIGNS_PAGE.builder.assistant.title}
        </h3>
      </div>
      <p className="text-xs text-ink-2">{CAMPAIGNS_PAGE.builder.assistant.lead}</p>

      <TextArea
        value={brief}
        onChange={(event) => onBriefChange(event.currentTarget.value)}
        placeholder={CAMPAIGNS_PAGE.builder.assistant.placeholder}
        rows={3}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="small"
          variant="neutral"
          loading={pending}
          disabled={brief.trim() === ''}
          onClick={interpret}
        >
          {CAMPAIGNS_PAGE.builder.assistant.interpret}
        </Button>
        {proposal !== null && !applied ? (
          <Button
            type="button"
            size="small"
            variant="primary"
            disabled={pending}
            onClick={() => {
              onApply(proposal)
              setApplied(true)
            }}
          >
            {CAMPAIGNS_PAGE.builder.assistant.apply}
          </Button>
        ) : null}
      </div>

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
    </section>
  )
}

/* ── The live count ────────────────────────────────────────────────────────── */

/** The count's three states, each remembering which group it answers. */
type CountState =
  | { readonly status: 'idle'; readonly groupId: null }
  | { readonly status: 'count'; readonly groupId: string; readonly value: number }
  | { readonly status: 'error'; readonly groupId: string; readonly message: string }

/**
 * The audience's live size, re-fetched whenever the group changes.
 *
 * Skipped while no group is chosen, because a count of nothing is not a number the
 * manager reads.
 *
 * The loading state is derived from what the state's own `groupId` says, not set
 * inside the effect: `setState` in an effect body is a cascading render, so the effect
 * only fetches and the render decides what to show. A `groupId` that differs from the
 * state's is a count that has not arrived yet.
 */
function useAudienceCount(groupId: string | null): { readonly hint: string | undefined } {
  const [state, setState] = useState<CountState>({ status: 'idle', groupId: null })

  useEffect(() => {
    if (groupId === null) return
    let cancelled = false
    void (async () => {
      const outcome = await previewAudienceCountAction(groupId)
      if (cancelled) return
      if (outcome.ok) setState({ status: 'count', groupId, value: outcome.count })
      else setState({ status: 'error', groupId, message: outcome.message })
    })()
    return () => {
      cancelled = true
    }
  }, [groupId])

  if (groupId === null) return { hint: undefined }
  if (state.groupId !== groupId) {
    return { hint: CAMPAIGNS_PAGE.builder.hints.audienceCountLoading }
  }
  if (state.status === 'count') return { hint: CAMPAIGNS_PAGE.builder.hints.audienceCount(state.value) }
  if (state.status === 'error') return { hint: state.message }
  return { hint: CAMPAIGNS_PAGE.builder.hints.audienceCountLoading }
}

/* ── The pieces the builder shares ─────────────────────────────────────────── */

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/**
 * A form's answer: nothing while the form is clean, a sentence once the action returned.
 */
function FormAnswer({ answer }: { readonly answer: FormAnswer | null }) {
  if (answer === null) return null
  return (
    <p
      className={cx('flex items-center gap-1 text-sm', answer.ok ? 'text-ok' : 'text-danger')}
      role="alert"
      aria-live="polite"
    >
      <Icon name={answer.ok ? 'confirm' : 'error'} size="compact" />
      {answer.message}
    </p>
  )
}

/** The dimmed backdrop a click outside and an Escape both close. */
function Overlay({
  children,
  onClose,
}: {
  readonly children: ReactNode
  readonly onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="inline-size-full" onClick={stopPropagation} role="presentation">
        {children}
      </div>
    </div>
  )
}

/**
 * The name a proposal prefills, from the type's own label in the page's list.
 *
 * The list is the page's because the label is the module's and the module's barrel is
 * not one a client component imports (`debts-forms.tsx` keeps the same boundary).
 */
function nameFromProposal(
  proposal: AssistantProposal | null,
  typeOptions: readonly OptionList[],
): string {
  if (proposal === null || proposal.type === null) return ''
  return typeOptions.find((option) => option.value === proposal.type)?.label ?? ''
}

/** The Jalali date a proposal's first run lands on, as the date field holds it. */
function dateFromProposal(proposal: AssistantProposal | null): string {
  if (proposal === null || proposal.scheduledAt === null) return ''
  return fromUtcInstant(new Date(proposal.scheduledAt), DEFAULT_CLINIC_UTC_OFFSET_MINUTES).localDate
}

/** One field's value from a submitted form, or '' when the field was absent. */
function asFormString(form: HTMLFormElement, name: string): string {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.value : ''
}

/** Whether a checkbox in a submitted form was checked. */
function checked(form: HTMLFormElement, name: string): boolean {
  const value = form.elements.namedItem(name)
  return value instanceof HTMLInputElement ? value.checked : false
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: React.MouseEvent): void {
  event.stopPropagation()
}