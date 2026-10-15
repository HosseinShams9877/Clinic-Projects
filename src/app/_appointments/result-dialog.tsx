'use client'

import { useId, useState } from 'react'
import type { ChangeEvent, MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { Field, TextInput } from '@/core/components/form'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { formatMoney, formatNumber, normalizeDigits } from '@/core/localization'
import { PaymentMethod, isMember } from '@/core/constants'
import { SERVICES_PAGE } from '@/app/catalog'

import { RESULT_POPUP, RESULT_PAYMENT_METHOD_LABELS } from './catalog'
import { recordResultAction, type ActionResult } from './actions'

const METHOD_OPTIONS = Object.values(PaymentMethod).map((value) => ({
  value,
  label: RESULT_PAYMENT_METHOD_LABELS[value],
}))

export interface ResultDialogProps {
  readonly panel: 'reception' | 'doctor' | 'admin'
  readonly appointmentId: string
  readonly charged: bigint
  /** The sum already on the ledger — the deposit paid at booking, in practice. */
  readonly alreadyPaid: bigint
  readonly triggerLabel?: string
  readonly triggerIcon?: IconName | null
}

export function ResultDialog(props: ResultDialogProps) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState('')
  const [discount, setDiscount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [method, setMethod] = useState<string>(PaymentMethod.Cash)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  if (!open) {
    return (
      <Button
        size="small"
        variant="neutral"
        leadingIcon={props.triggerIcon === null ? undefined : (props.triggerIcon ?? 'confirm')}
        onClick={() => {
          setNote('')
          setPaid('')
          setDiscount('')
          setDiscountReason('')
          setMethod(PaymentMethod.Cash)
          setResult(null)
          setOpen(true)
        }}
      >
        {props.triggerLabel ?? RESULT_POPUP.trigger}
      </Button>
    )
  }

  async function submit() {
    setPending(true)
    const outcome = await recordResultAction(props.panel, {
      appointmentId: props.appointmentId,
      note: note === '' ? undefined : note,
      paidAmount: paid === '' ? undefined : paid,
      discountAmount: discount === '' ? undefined : discount,
      discountReason: discountReason === '' ? undefined : discountReason,
      method: isMember(PaymentMethod, method) ? method : PaymentMethod.Cash,
    })
    setPending(false)
    if (outcome.ok) {
      setOpen(false)
      return
    }
    setResult(outcome)
  }

  const liveBalance = computeBalance(props.charged, props.alreadyPaid, paid, discount)

  return (
    <Overlay onClose={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[520px]"
      >
        <div className="h-1 rounded-t-xl bg-brand" aria-hidden="true" />

        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-700">
              <Icon name="confirm" size="card" />
            </span>
            {RESULT_POPUP.title}
          </h2>
          <Button size="icon" variant="ghost" icon="close" aria-label={RESULT_POPUP.close} onClick={() => setOpen(false)} />
        </header>

        <div className="flex flex-col gap-4 px-5 pb-4">
          <Field label={RESULT_POPUP.note}>
            <TextInput
              type="text"
              value={note}
              placeholder={RESULT_POPUP.notePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-xs">
            <dt className="text-ink-3">{RESULT_POPUP.chargedLabel}</dt>
            <dd className="text-end font-semibold text-ink tabular-nums">{formatMoney(props.charged)}</dd>
            {props.alreadyPaid === 0n ? null : (
              <>
                <dt className="text-ink-3">{RESULT_POPUP.alreadyPaidLabel}</dt>
                <dd className="text-end font-semibold text-ok tabular-nums">{formatMoney(props.alreadyPaid)}</dd>
              </>
            )}
            <dt className="text-ink-3">{RESULT_POPUP.balanceLabel}</dt>
            <dd className="text-end font-semibold text-ink tabular-nums">{formatMoney(liveBalance)}</dd>
          </dl>

          <p className="text-sm font-semibold text-ink-2">{RESULT_POPUP.moneySection}</p>

          <Field label={RESULT_POPUP.paidAmount} hint={RESULT_POPUP.paidAmountHint}>
            <MoneyInput value={paid} onChange={setPaid} />
          </Field>

          <Field label={RESULT_POPUP.method}>
            <select className={CONTROL_CLASSES} value={method} onChange={(event) => setMethod(event.target.value)}>
              {METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-4 panel:flex-row">
            <Field label={RESULT_POPUP.discount} className="flex-1">
              <MoneyInput value={discount} onChange={setDiscount} />
            </Field>
            <Field label={RESULT_POPUP.discountReason} className="flex-1">
              <TextInput
                type="text"
                value={discountReason}
                placeholder={RESULT_POPUP.discountReasonPlaceholder}
                onChange={(event) => setDiscountReason(event.target.value)}
              />
            </Field>
          </div>

          {result !== null && !result.ok ? (
            <p className="flex items-center gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              <Icon name="error" size="compact" />
              {result.message}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {RESULT_POPUP.cancel}
          </Button>
          <Button variant="primary" loading={pending} onClick={() => void submit()}>
            {paid === '' ? RESULT_POPUP.saveNoteOnly : RESULT_POPUP.save}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

function computeBalance(charged: bigint, alreadyPaid: bigint, paidText: string, discountText: string): bigint {
  return charged - alreadyPaid - parseTomanText(paidText) - parseTomanText(discountText)
}

function parseTomanText(value: string): bigint {
  const normalized = normalizeDigits(value).replace(/\D/g, '')
  if (normalized === '') return 0n
  return BigInt(normalized) * 10n
}

function MoneyInput({ value, onChange }: { readonly value: string; readonly onChange: (next: string) => void }) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = normalizeDigits(event.currentTarget.value)
    const digitsOnly = raw.replace(/\D/g, '')
    onChange(digitsOnly === '' ? '' : formatNumber(Number(digitsOnly)))
  }
  return (
    <div className="relative">
      <TextInput
        type="text"
        inputMode="numeric"
        dir="rtl"
        value={value}
        onChange={handleChange}
        className="pe-16 text-end tabular-nums"
      />
      <span
        className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-ink-3"
        aria-hidden="true"
      >
        {SERVICES_PAGE.money.unit}
      </span>
    </div>
  )
}

function Overlay({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      <div className="inline-size-full" onClick={stopPropagation} role="presentation">
        {children}
      </div>
    </div>
  )
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}