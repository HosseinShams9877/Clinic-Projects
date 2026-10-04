/**
 * The staff login form — `09-security.md` §10's first login.
 *
 * > Staff login | Mobile or username + password.
 *
 * One step: a mobile and a password. The action calls `loginWithPassword` through
 * the `auth` barrel, sets the cookie and answers with the panel the person's role
 * belongs in, and this form sends them there.
 *
 * ## Why the form knows where to go
 *
 * A login that returned a role would be an authentication step making an
 * authorisation decision (`04-roles-permissions.md` §2 keeps the two apart), so
 * `loginWithPassword` returns a user and a tenant and nothing else. The panel comes
 * from the membership, which the action resolves by reading the session it just
 * wrote — the same resolution every request will make from then on, run once here so
 * the person lands on their own panel and not on a redirect page.
 *
 * ## Why a wrong mobile and a wrong password read identically here
 *
 * §10: "Login responses do not reveal whether a mobile number exists." The module
 * raises one key for both, and this form renders that key as a form-level error. It
 * adds nothing: no hint about which half was wrong, no suggestion to try the other,
 * because either would be the disclosure the rule exists to prevent.
 *
 * ## The two forms on one page
 *
 * This component is the staff half of `src/app/login/page.tsx`, which carries the
 * customer form beside it. The two are separate components because they are
 * separate logins — different credentials, different actions, different doors — and
 * sharing a form would mean a shared state machine with a branch the customer half
 * never takes. The page composes them; `02-architecture.md` §6 puts composition in
 * `src/app/`.
 */

'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Field, Form, FormError, SubmitButton, TextInput } from '@/core/components/form'
import { isValidMobile, normalizeMobile } from '@/core/localization'
import type { LoginLabels, LoginPlaceholders } from '@/modules/auth'

import { FIELD_INVALID, FIELD_REQUIRED, STAFF_LOGIN_PAGE } from '@/app/catalog'

import { staffLoginAction } from '@/app/login/actions'

export interface StaffLoginFormProps {
  /** `auth`'s login labels and placeholders, handed down by the page. */
  readonly labels: LoginLabels
  readonly placeholders: LoginPlaceholders
}

export function StaffLoginForm({ labels, placeholders }: StaffLoginFormProps) {
  const router = useRouter()
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { mobile: '', password: '' },
  })

  const onSubmit = useCallback(
    async (values: { readonly mobile: string; readonly password: string }) => {
      const result = await staffLoginAction({
        mobile: normalizeMobile(values.mobile),
        password: values.password,
      })
      if (!result.ok) {
        // One sentence for both halves of the proof, per §10 — the key is the
        // module's, and the message is the catalog's.
        form.setError('root.server', { message: result.message })
        return
      }
      router.push(result.panelPath)
    },
    [form, router],
  )

  return (
    <Form
      form={form}
      onValid={onSubmit}
      className="flex min-w-0 flex-[1_1_360px] flex-col gap-5 rounded-lg border border-line bg-surface p-7 shadow-2"
    >
      <h2 className="flex items-center gap-3 text-xl font-bold tracking-[var(--ls-heading)] text-ink">
        {labels.staffTitle}
      </h2>
      <p className="text-md text-ink-2">{STAFF_LOGIN_PAGE.lead}</p>
      <div className="flex flex-col gap-4">
        <Field label={labels.mobile} required error={form.formState.errors.mobile?.message}>
          <TextInput
            {...form.register('mobile')}
            inputMode="tel"
            autoComplete="tel"
            placeholder={placeholders.mobile}
          />
        </Field>
        <Field label={labels.password} required error={form.formState.errors.password?.message}>
          <TextInput
            {...form.register('password')}
            type="password"
            autoComplete="current-password"
            placeholder={placeholders.password}
          />
        </Field>
        <FormError error={form.formState.errors.root?.server?.message} />
      </div>
      <div className="flex flex-col gap-3">
        <SubmitButton loading={form.formState.isSubmitting} leadingIcon="shield" block>
          {labels.submit}
        </SubmitButton>
      </div>
    </Form>
  )
}

const schema = z.object({
  mobile: z
    .string()
    .min(1, FIELD_REQUIRED.mobile)
    .refine((value) => isValidMobile(normalizeMobile(value)), FIELD_INVALID.mobile),
  password: z.string().min(1, FIELD_REQUIRED.password),
})
