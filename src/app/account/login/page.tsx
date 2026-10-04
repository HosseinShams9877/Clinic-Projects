/**
 * The customer login page, at `/account/login` — `02-architecture.md` §9's
 * `account/login.html`.
 *
 * §9 gives the customer panel six surfaces and this is the one a person sees first:
 * the door, before the five destinations the panel holds. It asks for a mobile and
 * then the code that mobile received, and nothing else — `09-security.md` §10's
 * second login, which is a one-time code and never a password, because a customer
 * holds no password and a door that asked for one would be a door describing a
 * credential the audience does not have.
 *
 * ## Why this page is not `/login`
 *
 * The staff page carries both doors; this one carries one. The difference is what
 * each audience needs to see: a person at `/login` has said "I work here" and needs
 * the other door pointed out, and a person here has already chosen. `CUSTOMER_LOGIN_PAGE`
 * is this page's own copy and `STAFF_LOGIN_PAGE` is that page's, because a page's
 * lead is the thing that says what the page holds and the two pages hold different
 * amounts.
 *
 * ## Why the tenant is the host's
 *
 * `resolveTenantId()` reads the tenant from the host the page is served on, and the
 * code is issued for that tenant alone (`09-security.md` §7: a customer's every query
 * is scoped to the tenant and to the customer). On a host that names no tenant the
 * form still renders — Persian, RTL, and the two steps — and the request action is
 * the thing that answers with `NO_TENANT_FOR_THIS_ADDRESS`, because a form that
 * rendered nothing would be a page that hid the reason it cannot work.
 *
 * ## What is deliberately absent
 *
 * A "forgot password" link. A customer has no password to forget (`§10` again), and a
 * link to a flow the audience has no credential for is a link to a dead page.
 *
 * ## The classes
 *
 * `08-ui-design-system.md` has no `account/login.html` section, so the page composes
 * the same tokens the other two pages do: a centred column narrower than the staff
 * page's — `max-w-[440px]` rather than `880px`, because this page holds one form and
 * not two — and the §12 card surface the form itself renders in. The back link is
 * the only thing below it, and `back` mirrors in RTL, so it points the reading way
 * without a second rule.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { realClock } from '@/core/lib/clock'
import {
  LOGIN_LABELS,
  LOGIN_PLACEHOLDERS,
  oneTimeCodeLength,
} from '@/modules/auth'

import { CUSTOMER_LOGIN_PAGE, PANELS_PAGE } from '@/app/catalog'
import { CustomerLoginForm } from '@/app/_login/customer-login'

export const metadata: Metadata = { title: CUSTOMER_LOGIN_PAGE.title }

export default function CustomerLoginPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 px-[var(--content-pad)] panel:p-7 panel:px-[var(--content-pad-sm)]">
      <div className="flex w-full max-w-[440px] flex-col items-stretch gap-6">
        <h1 className="text-center text-3xl font-extrabold tracking-[var(--ls-heading)] text-ink">
          {CUSTOMER_LOGIN_PAGE.title}
        </h1>
        <p className="text-center text-lg text-ink-2">{CUSTOMER_LOGIN_PAGE.lead}</p>
        <CustomerLoginForm
          nowEpochMs={realClock().getTime()}
          codeLength={oneTimeCodeLength}
          labels={LOGIN_LABELS}
          placeholders={LOGIN_PLACEHOLDERS}
        />
        <Link
          className="inline-flex items-center justify-center gap-2 text-md text-brand no-underline hover:underline"
          href="/"
        >
          <Icon name="back" size="compact" />
          {CUSTOMER_LOGIN_PAGE.backToEntry} · {PANELS_PAGE.title}
        </Link>
      </div>
    </main>
  )
}
