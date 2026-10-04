/**
 * The customer login form — `09-security.md` §10's second login.
 *
 * > Customer login | Mobile + one-time code. Codes are short-lived, single-use, and
 * > rate-limited per mobile and per IP.
 *
 * Two steps, one form, and one state machine in between:
 *
 * 1. **Request.** A mobile number. The action resolves the tenant from the host and
 *    calls `issueOtp` through the `auth` barrel, and the response is the challenge's
 *    id and its expiry — never the code, which the boundary delivers by text and
 *    this component never holds.
 * 2. **Verify.** The code, plus the sentence that names the mobile it was sent to.
 *    `CODE_SENT_TO` is the one disclosure §10 permits: showing the number confirms
 *    which mobile to check without revealing whether any other number has an
 *    account. The action calls `loginWithOtp`, sets the cookie and sends the person
 *    to `/account`.
 *
 * ## Why the challenge id is the only thing step 2 carries forward
 *
 * The code is a secret and the mobile is a fact; the row's id is the handle. A
 * component that kept the code would be a component holding a credential, and there
 * is no reason to: the server compares what the person types against the row's hash.
 * Keeping the *mobile* forward is what lets the second step name it, and keeping the
 * *expiry* is what lets the countdown run.
 *
 * ## Why the countdown measures elapsed time
 *
 * `05-conventions.md` §8 bans reading the ambient clock in `src/`, and a client
 * component is in `src/`. The page therefore hands this component the server's
 * `now`, and the countdown measures only how long *this browser* has been running
 * since — `performance.now()`, which is a stopwatch and not a clock. The deadline is
 * `serverNow + (expiresAt - serverNow)` computed at mount, so a clock skew between
 * the two does not change the seconds a person sees.
 *
 * ## Enumeration, and what this form does not distinguish
 *
 * §10 requires that the response does not reveal whether the mobile has an account.
 * `issueOtp` writes the challenge row either way and returns a code only for a
 * mobile the tenant knows, so the second step looks identical for a real number and
 * an unknown one — and a code that never arrives produces the same sentence a wrong
 * code does, from `loginWithOtp`. This form renders that answer and adds nothing to
 * it: there is no "no such number" branch here, because the module raises none.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Button } from '@/core/components/button'
import { Field, Form, FormError, SubmitButton, TextInput } from '@/core/components/form'
import {
  formatPhone,
  isValidMobile,
  normalizeDigits,
  normalizeMobile,
  renderMessage,
  toPersianDigits,
} from '@/core/localization'
import type { LoginLabels, LoginPlaceholders } from '@/modules/auth'

import {
  CODE_COUNTDOWN_DONE,
  CODE_COUNTDOWN_LABEL,
  CODE_SENT_TO,
  CUSTOMER_LOGIN_PAGE,
  FIELD_INVALID,
  FIELD_REQUIRED,
  REQUEST_NEW_CODE,
} from '@/app/catalog'

import { requestOtpAction, verifyOtpAction } from '@/app/account/login/actions'

import styles from './Login.module.css'

/**
 * The challenge step 2 holds.
 *
 * The code is deliberately absent, and the mobile is deliberately present — see the
 * header for why each. `expired` is set when the module's own answer says the code
 * is spent, which is the form's one signal that a new one is needed rather than a
 * retry of the old.
 */
interface Challenge {
  /** The row's id, which `loginWithOtp` reads. */
  readonly id: string
  /** The mobile the code was sent to, shown in `CODE_SENT_TO`. */
  readonly mobile: string
  /** The challenge's expiry, as an epoch the countdown counts down to. */
  readonly expiresAtEpochMs: number
  /** Set when the module's answer means a new code is the only fix. */
  readonly expired?: boolean
}

export interface CustomerLoginFormProps {
  /** The server's clock at render, so the countdown is a stopwatch from here. */
  readonly nowEpochMs: number
  /**
   * `auth`'s code length, passed from the server: this is a client component and the
   * barrel that owns the constant re-exports the login libraries, which reach Prisma.
   */
  readonly codeLength: number
  /** `auth`'s login labels and placeholders, handed down by the page for the same reason. */
  readonly labels: LoginLabels
  readonly placeholders: LoginPlaceholders
}

export function CustomerLoginForm({ nowEpochMs, codeLength, labels, placeholders }: CustomerLoginFormProps) {
  const router = useRouter()
  const [challenge, setChallenge] = useState<Challenge | null>(null)

  const requestForm = useForm({
    resolver: zodResolver(mobileSchema),
    defaultValues: { mobile: '' },
  })
  const verifyForm = useForm({
    resolver: zodResolver(codeSchema(codeLength)),
    defaultValues: { code: '' },
  })

  const onRequest = useCallback(
    async (values: { readonly mobile: string }) => {
      const mobile = normalizeMobile(values.mobile)
      const result = await requestOtpAction({ mobile })
      if (!result.ok) {
        requestForm.setError('mobile', { message: result.message })
        return
      }
      setChallenge({ id: result.challengeId, mobile, expiresAtEpochMs: result.expiresAtEpochMs })
      verifyForm.setFocus('code')
    },
    [requestForm, verifyForm],
  )

  const onVerify = useCallback(
    async (values: { readonly code: string }) => {
      if (challenge === null) return
      const result = await verifyOtpAction({
        challengeId: challenge.id,
        code: normalizeDigits(values.code),
      })
      if (!result.ok) {
        verifyForm.setError('code', { message: result.message })
        // A spent or exhausted challenge will not accept another code, so the fix is
        // a new one; the button below offers it and this flag is what shows it.
        if (result.needsNewCode) setChallenge((current) => (current === null ? null : { ...current, expired: true }))
        return
      }
      router.push('/account')
    },
    [challenge, router, verifyForm],
  )

  const requestNewCode = useCallback(async () => {
    if (challenge === null) return
    await onRequest({ mobile: challenge.mobile })
    verifyForm.reset({ code: '' })
  }, [challenge, onRequest, verifyForm])

  if (challenge === null) {
    return (
      <Form form={requestForm} onValid={onRequest} className={styles.card}>
        <h2 className={styles.cardTitle}>{labels.customerTitle}</h2>
        <p className={styles.lead}>{CUSTOMER_LOGIN_PAGE.lead}</p>
        <div className={styles.fields}>
          <Field
            label={labels.mobile}
            required
            error={requestForm.formState.errors.mobile?.message}
          >
            <TextInput
              {...requestForm.register('mobile')}
              inputMode="tel"
              autoComplete="tel"
              placeholder={placeholders.mobile}
            />
          </Field>
          <FormError error={requestForm.formState.errors.root?.server?.message} />
        </div>
        <div className={styles.actions}>
          <SubmitButton loading={requestForm.formState.isSubmitting} leadingIcon="phone" block>
            {labels.requestCode}
          </SubmitButton>
        </div>
      </Form>
    )
  }

  return (
    <Form form={verifyForm} onValid={onVerify} className={styles.card}>
      <h2 className={styles.cardTitle}>{labels.customerTitle}</h2>
      <p className={styles.codeSentTo}>{renderMessage(CODE_SENT_TO, { mobile: formatPhone(challenge.mobile) })}</p>
      <div className={styles.fields}>
        <Field label={labels.code} required error={verifyForm.formState.errors.code?.message}>
          <TextInput
            {...verifyForm.register('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={placeholders.code}
          />
        </Field>
        <FormError error={verifyForm.formState.errors.root?.server?.message} />
      </div>
      <CodeCountdown challenge={challenge} nowEpochMs={nowEpochMs} />
      <div className={styles.actions}>
        <SubmitButton loading={verifyForm.formState.isSubmitting} block>
          {labels.submit}
        </SubmitButton>
        {challenge.expired ? (
          <Button
            type="button"
            variant="outline"
            onClick={requestNewCode}
            loading={requestForm.formState.isSubmitting}
            block
          >
            {REQUEST_NEW_CODE}
          </Button>
        ) : null}
      </div>
    </Form>
  )
}

/* ── The schemas the client validates with and the server re-validates against ── */

const mobileSchema = z.object({
  mobile: z
    .string()
    .min(1, FIELD_REQUIRED.mobile)
    .refine((value) => isValidMobile(normalizeMobile(value)), FIELD_INVALID.mobile),
})

/** The code schema, built with the length the page handed down. */
function codeSchema(length: number) {
  return z.object({
    code: z
      .string()
      .min(1, FIELD_REQUIRED.code)
      .refine(
        (value) => normalizeDigits(value).length === length,
        renderMessage(FIELD_INVALID.codeLength, { length }),
      ),
  })
}

/* ── The countdown ───────────────────────────────────────────────────────────── */

interface CodeCountdownProps {
  readonly challenge: Challenge
  readonly nowEpochMs: number
}

function CodeCountdown({ challenge, nowEpochMs }: CodeCountdownProps) {
  // The deadline is computed once, at mount, from the server's clock: the remaining
  // time the server reported, plus how long this browser has run since. See the
  // header for why it is not `Date.now()`.
  const deadlineRef = useRef(0)
  const [remainingMs, setRemainingMs] = useState(() => challenge.expiresAtEpochMs - nowEpochMs)

  useEffect(() => {
    deadlineRef.current = performance.now() + (challenge.expiresAtEpochMs - nowEpochMs)
    const tick = () => {
      const left = deadlineRef.current - performance.now()
      setRemainingMs(left)
      if (left <= 0) clearInterval(interval)
    }
    const interval = setInterval(tick, 500)
    tick()
    return () => clearInterval(interval)
  }, [challenge.expiresAtEpochMs, nowEpochMs])

  if (remainingMs <= 0) {
    return (
      <p className={styles.countdownDone} role="status">
        {CODE_COUNTDOWN_DONE}
      </p>
    )
  }

  return (
    <p className={styles.countdown}>
      <span>{CODE_COUNTDOWN_LABEL}</span>
      <span className={styles.countdownDigits}>{formatCountdown(remainingMs)}</span>
    </p>
  )
}

/** The remaining minutes and seconds as Persian digits, `mm:ss`. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return toPersianDigits(`${minutes}:${String(seconds).padStart(2, '0')}`)
}
