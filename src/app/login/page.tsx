/**
 * The staff login page, at `/login` — `02-architecture.md` §9's `login.html`.
 *
 * §9 puts the two logins on one page for the staff audience: the people who work at
 * the clinic log in with a password, and the people it treats log in with a
 * one-time code, and both doors are on this page because a person who has reached
 * `/login` has already said "I work here", and the customer door beside it is how
 * someone who said the wrong thing gets to the right one. `STAFF_LOGIN_PAGE.lead` is
 * the sentence that says both, which is what makes the page's copy and its two forms
 * unable to disagree about what the page holds.
 *
 * ## Why the page is a server component
 *
 * The two forms are client components — they hold a form's pending state and, on the
 * customer side, a challenge and a countdown — and the page around them is not,
 * because the page's job is to hand the labels and two server-read facts down. The
 * labels come from `auth`'s catalog (`05-conventions.md` §14: a Persian literal in a
 * component is a finding, and the labels are the module's vocabulary), the code
 * length from the barrel that owns it, and `nowEpochMs` from the clock the request
 * is served at. Passing them as props keeps the client bundle to the two forms.
 *
 * ## What the page does not do
 *
 * It does not resolve a tenant. A staff member's tenant is the membership's, which
 * the action resolves from the session it just wrote — see `actions.ts` — and a page
 * that resolved one earlier would be a page that picked a tenant before it knew who
 * was logging in. The customer half resolves the host's tenant in its own action,
 * because a customer's tenant *is* the host's (`09-security.md` §7).
 */

import type { Metadata } from 'next'

import { realClock } from '@/core/lib/clock'
import {
  LOGIN_LABELS,
  LOGIN_PLACEHOLDERS,
  oneTimeCodeLength,
} from '@/modules/auth'

import { STAFF_LOGIN_PAGE } from '@/app/catalog'
import { CustomerLoginForm } from '@/app/_login/customer-login'
import { StaffLoginForm } from '@/app/_login/staff-login'

import styles from './page.module.css'

export const metadata: Metadata = { title: STAFF_LOGIN_PAGE.title }

export default function StaffLoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>{STAFF_LOGIN_PAGE.title}</h1>
        <p className={styles.lead}>{STAFF_LOGIN_PAGE.lead}</p>
        <div className={styles.cards}>
          <StaffLoginForm labels={LOGIN_LABELS} placeholders={LOGIN_PLACEHOLDERS} />
          <CustomerLoginForm
            nowEpochMs={realClock().getTime()}
            codeLength={oneTimeCodeLength}
            labels={LOGIN_LABELS}
            placeholders={LOGIN_PLACEHOLDERS}
          />
        </div>
      </div>
    </main>
  )
}
