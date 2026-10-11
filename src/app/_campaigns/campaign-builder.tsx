/**
 * The campaign builder — the demo's three-step «کمپین جدید» wizard.
 *
 * The page's three halves are the type cards, the assistant and the clinic's own
 * campaigns, and this file is the modal the first two open: a proposal or a chosen
 * type lands in the wizard's fields, the audience's live count sits beside the group
 * the manager is committing to, and the create writes a **draft** — the approval step
 * is a row's own state and lives in the results table, because a gate the builder
 * performed would be a gate the builder's own button undid.
 *
 * ## Why the wizard is three steps and one form
 *
 * The demo's three panes are a reading order, not three submissions: the manager
 * answers «به کسی که...» before «چه می‌گوییم؟» before «کی؟», and the fields the
 * module's contract takes are the same eight either way. The three panes are one
 * `<form>` whose off-screen steps are `hidden` and not unmounted, so a step's fields
 * keep what the manager typed when the step is left, and the footer's single submit
 * sends every step at once. Validation is the module's own and arrives as a sentence
 * under the step the field belongs to.
 *
 * ## Why the count is fetched and not computed
 *
 * `previewCampaignAudience` is the same evaluation the dispatch runs, which is what makes
 * the number the manager reads the number the campaign sends to. A client-side guess at
 * a count would be a second answer to "who is in this group", and the two would disagree
 * about the one fact the manager is approving.
 *
 * ## Why a proposal lands in the form and not the database
 *
 * The interpreter never writes anything; its answer is a draft a person reads. The
 * «بررسی و شروع» button that carries a proposal in is the person's, and the fields it
 * fills are editable — a proposal the manager could not change would be a decision the
 * assistant made.
 *
 * ## Why the option lists arrive as props
 *
 * The `campaigns` barrel is a server-only surface — it holds the dispatch, and the
 * dispatch's graph reaches modules a browser cannot load. A client component that
 * imported it for its label maps would pull that graph into the browser bundle, so the
 * page builds the dropdown lists and hands the wizard's own chrome copy down, the same
 * way the debts surface hands its option lists down (`_debts/debts-forms.tsx`).
 *
 * ## What the demo's wizard holds and this one does not
 *
 * A doctor and a service limiter, a discount code, an end date, and the two suppression
 * switches. None is a field the module's `CampaignInput` takes: the audience is a group
 * and a group is already a query over the clinic's own customers, and the dispatch's
 * own suppression is not a switch a campaign holds. A control that wrote nothing would
 * be a control the page cannot back, so the steps carry the eight fields that are real.
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
 * The wizard's own chrome — the three step tabs, the two nav buttons, and the
 * attribution alert — as the admin page's catalog holds them, because the steps are the
 * manager's own and not the shared builder's.
 */
export interface BuilderChrome {
  readonly steps: Readonly<{ readonly audience: string; readonly message: string; readonly schedule: string }>
  readonly prev: string
  readonly next: string
  readonly attribution: string
}

/**
 * The audience options the page loaded for this tenant, the two label lists the type and
 * channel dropdowns render, and the wizard's own chrome copy.
 */
export interface CampaignBuilderProps {
  readonly groups: readonly { readonly id: string; readonly name: string }[]
  readonly typeOptions: readonly OptionList[]
  readonly channelOptions: readonly OptionList[]
  /** The sentence the assistant's low-confidence note renders, from its own catalog. */
  readonly lowConfidenceHint: string
  /** The wizard's own chrome, from the admin page's catalog. */
  readonly chrome: BuilderChrome
  /** A type one of the page's cards chose, preselected on the wizard's first step. */
  readonly presetType: string | null
  /** The assistant's proposal, prefilling the fields it decided. */
  readonly presetProposal: AssistantProposal | null
  /** The one way out, which the page owns so a close and a revalidation agree. */
  readonly onClose: () => void
}

/** The three schedule kinds, as the form's own select offers them. */
const SCHEDULE_OPTIONS = [
  { value: 'ONE_TIME', label: CAMPAIGNS_PAGE.builder.scheduleOptions.ONE_TIME },
  { value: 'DAILY_AT', label: CAMPAIGNS_PAGE.builder.scheduleOptions.DAILY_AT },
  { value: 'MONTHLY_DAY', label: CAMPAIGNS_PAGE.builder.scheduleOptions.MONTHLY_DAY },
] as const

/** The three steps' own indices, as the tab state reads them. */
const STEP_AUDIENCE = 0
const STEP_MESSAGE = 1
const STEP_SCHEDULE = 2
const STEP_COUNT = 3

/**
 * «کمپین جدید» — the three-step wizard, opened from the page's header, its type cards,
 * and the assistant's own «بررسی و شروع».
 */
export function CampaignBuilder({
  groups,
  typeOptions,
  channelOptions,
  lowConfidenceHint,
  chrome,
  presetType,
  presetProposal,
  onClose,
}: CampaignBuilderProps) {
  const [step, setStep] = useState(STEP_AUDIENCE)
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)
  // The proposal is a seed and not editable state here: the assistant's own card edits
  // the text it proposed, and the builder receives the proposal the manager accepted.
  const [proposal] = useState<AssistantProposal | null>(presetProposal)
  const [groupId, setGroupId] = useState<string | null>(presetProposal?.audienceGroupId ?? null)
  const [scheduleKind, setScheduleKind] = useState<string>(presetProposal?.scheduleKind ?? 'ONE_TIME')
  const [type, setType] = useState<string>(presetType ?? presetProposal?.type ?? 'OCCASION')
  const [channel, setChannel] = useState<string>(presetProposal?.channel ?? 'SMS')
  const titleId = useId()

  // The count follows the group, because the count is the group's and not the form's.
  const count = useAudienceCount(groupId)

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
        onClose()
        return
      }
      setAnswer({ ok: false, message: outcome.message })
    })
  }

  const steps = [chrome.steps.audience, chrome.steps.message, chrome.steps.schedule]

  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[720px]"
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
            onClick={onClose}
          />
        </header>

        <nav
          className="flex flex-wrap items-center gap-2 p-6 pb-0"
          aria-label={CAMPAIGNS_PAGE.builder.title}
        >
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? 'step' : undefined}
              className={cx(
                'rounded-pill px-4 py-[6px] text-xs font-semibold no-underline',
                index === step
                  ? 'bg-brand text-ink-inverse'
                  : 'bg-surface text-ink-2 border border-line-2 hover:bg-surface-2',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <form id={BUILDER_FORM_ID} className="flex flex-col gap-4 p-6" onSubmit={submit}>
          <div className={cx('flex flex-col gap-4', step === STEP_AUDIENCE ? 'flex' : 'hidden')}>
            <div className="flex flex-col gap-4 panel:flex-row">
              <Field label={CAMPAIGNS_PAGE.builder.fields.name} required className="flex-1">
                <TextInput name="name" defaultValue={nameFromProposal(proposal, typeOptions)} />
              </Field>
              <Field label={CAMPAIGNS_PAGE.builder.fields.type} className="w-full panel:w-48">
                <Combobox
                  name="type"
                  value={type}
                  onChange={setType}
                  options={typeOptions}
                  placeholder={CAMPAIGNS_PAGE.builder.fields.type}
                  emptyMessage={CAMPAIGNS_PAGE.results.empty}
                />
              </Field>
            </div>

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

            <p className="flex items-center gap-1 text-xs text-ink-3">
              <Icon name="info" size="compact" />
              {lowConfidenceHint}
            </p>
          </div>

          <div className={cx('flex flex-col gap-4', step === STEP_MESSAGE ? 'flex' : 'hidden')}>
            <Field label={CAMPAIGNS_PAGE.builder.fields.channel}>
              <input type="hidden" name="channel" value={channel} />
              <div className="grid grid-cols-2 gap-3">
                {channelOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setChannel(option.value)}
                    aria-pressed={channel === option.value}
                    className={cx(
                      'flex items-center gap-3 rounded-md border p-3 text-start',
                      channel === option.value
                        ? 'border-brand bg-brand-50'
                        : 'border-line-2 bg-surface hover:bg-surface-2',
                    )}
                  >
                    <Icon name="message" size="compact" />
                    <span className="text-sm font-semibold text-ink">{option.label}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={CAMPAIGNS_PAGE.builder.fields.messageText}
              required
              hint={CAMPAIGNS_PAGE.builder.hints.placeholders}
            >
              <TextArea name="messageText" defaultValue={proposal?.messageText ?? ''} rows={4} />
            </Field>
          </div>

          <div className={cx('flex flex-col gap-4', step === STEP_SCHEDULE ? 'flex' : 'hidden')}>
            <Field label={CAMPAIGNS_PAGE.builder.fields.scheduleKind}>
              <Combobox
                name="scheduleKind"
                value={scheduleKind}
                onChange={setScheduleKind}
                options={SCHEDULE_OPTIONS}
                placeholder={CAMPAIGNS_PAGE.builder.fields.scheduleKind}
                emptyMessage={CAMPAIGNS_PAGE.results.empty}
              />
            </Field>

            {scheduleKind !== 'DAILY_AT' ? (
              <div className="flex flex-col gap-4 panel:flex-row">
                <Field
                  label={CAMPAIGNS_PAGE.builder.fields.localDate}
                  required
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
                      defaultValue={
                        proposal?.scheduledTime ?? CAMPAIGNS_PAGE.builder.hints.defaultTime
                      }
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
                  defaultValue={
                    proposal?.scheduledTime ?? CAMPAIGNS_PAGE.builder.hints.defaultTime
                  }
                  placeholder={CAMPAIGNS_PAGE.builder.hints.defaultTime}
                />
              </Field>
            )}

            <Field
              label={CAMPAIGNS_PAGE.builder.fields.dailyCap}
              hint={CAMPAIGNS_PAGE.builder.hints.dailyCap}
            >
              <TextInput name="dailyCap" inputMode="numeric" dir="ltr" />
            </Field>

            <label className="flex items-center gap-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                name="isRecurring"
                defaultChecked={proposal?.isRecurring ?? false}
                className="size-4 rounded-xs border border-line-2 accent-brand"
              />
              {CAMPAIGNS_PAGE.builder.fields.isRecurring}
            </label>

            <div
              role="status"
              className="flex items-start gap-3 rounded-md bg-info-bg px-4 py-3 text-sm text-info [border:1px_solid_var(--info)]"
            >
              <Icon name="info" size="card" />
              <span>{chrome.attribution}</span>
            </div>
          </div>

          <FormAnswer answer={answer} />
        </form>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((current) => Math.max(STEP_AUDIENCE, current - 1))}
            disabled={step === STEP_AUDIENCE}
          >
            {chrome.prev}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {step < STEP_COUNT - 1 ? (
              <Button
                type="button"
                variant="neutral"
                onClick={() => setStep((current) => Math.min(STEP_COUNT - 1, current + 1))}
              >
                {chrome.next}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {CAMPAIGNS_PAGE.builder.actions.cancel}
            </Button>
            <Button type="submit" form={BUILDER_FORM_ID} variant="primary" loading={pending}>
              {CAMPAIGNS_PAGE.builder.actions.create}
            </Button>
          </div>
        </footer>
      </div>
    </Overlay>
  )
}

/** The id the footer's submit button refers to, so the form and its button are one. */
const BUILDER_FORM_ID = 'campaign-builder-form'

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
  if (state.status === 'count') {
    return { hint: CAMPAIGNS_PAGE.builder.hints.audienceCount(state.value) }
  }
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
