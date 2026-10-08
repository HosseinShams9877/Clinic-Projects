/**
 * The staff login page, at `/login` — `02-architecture.md` §9's `login.html`.
 *
 * §9 has two doors on two pages: this page is the staff door only, and
 * `/account/login` is the customer door. A person who reaches `/login` has said
 * "I work here", so this page carries one form and one small link to the other
 * door for someone who said the wrong thing.
 *
 * ## Why the page is a server component
 *
 * The form is a client component — it holds a form's pending state — and the page
 * around it is not, because the page's job is to hand the labels down. The labels
 * come from `auth`'s catalog (`05-conventions.md` §14: a Persian literal in a
 * component is a finding, and the labels are the module's vocabulary). Passing them
 * as props keeps the client bundle to the one form.
 *
 * ## What the page does not do
 *
 * It does not resolve a tenant. A staff member's tenant is the membership's, which
 * the action resolves from the session it just wrote — see `actions.ts` — and a page
 * that resolved one earlier would be a page that picked a tenant before it knew who
 * was logging in.
 *
 * ## The classes
 *
 * `08-ui-design-system.md` has no `login.html` section, so the page composes the
 * same tokens the entry page does: the same centred column, the same card surface,
 * the same heading scale.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { LOGIN_LABELS, LOGIN_PLACEHOLDERS } from '@/modules/auth'

import { STAFF_LOGIN_PAGE, CUSTOMER_LOGIN_PAGE } from '@/app/catalog'
import { StaffLoginForm } from '@/app/_login/staff-login'

export const metadata: Metadata = { title: STAFF_LOGIN_PAGE.title }

export default function StaffLoginPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 px-[var(--content-pad)] panel:p-7 panel:px-[var(--content-pad-sm)]">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-6">
        <h1 className="text-center text-3xl font-extrabold tracking-[var(--ls-heading)] text-ink">
          {STAFF_LOGIN_PAGE.title}
        </h1>
        <p className="text-center text-lg text-ink-2">{STAFF_LOGIN_PAGE.lead}</p>
        <div className="flex w-full flex-col [&>*]:min-w-0">
          <StaffLoginForm labels={LOGIN_LABELS} placeholders={LOGIN_PLACEHOLDERS} />
        </div>
        <p className="text-center text-sm text-ink-3">
          <Link
            href="/account/login"
            className="font-semibold text-brand-700 underline-offset-4 hover:underline"
          >
            {CUSTOMER_LOGIN_PAGE.title}
          </Link>
        </p>
      </div>
    </main>
  )
}