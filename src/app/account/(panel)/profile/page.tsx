/**
 * The customer's own record — `02-architecture.md` §9's `account/profile.html`.
 *
 * The person's two writes on one page: the facts they edit themselves, and the consent
 * flags they grant or revoke. The scope is the session's `customerId` in both, and the
 * page never names another person's — the module's `where` intersects the tenant with
 * the resolution, and a record outside it is absent rather than refused
 * (`09-security.md` §6.3).
 *
 * ## Why the two forms are two components
 *
 * Each has its own pending state and its own sentence for the failure the module
 * raised, and a single form holding both would be a form whose submit button had to
 * decide which of two actions it was submitting. See `_account/profile-forms.tsx`.
 *
 * ## Why the page renders a missing-record state
 *
 * The session resolved a customer, so a profile the read cannot find is a record the
 * clinic removed while the session was still open. The person is signed in, and the
 * honest answer is the sentence naming the fix rather than a 404 for a door the
 * person is standing in.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { CUSTOMER_PANEL, readOwnProfile } from '@/modules/customers'

import { OwnConsentForm, OwnProfileForm } from '@/app/_account/profile-forms'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_PANEL.profile.title }

/**
 * «پروفایل من» — the person's facts and their consent.
 */
export default async function AccountProfilePage() {
  const session = await requireCustomerPanel()

  const profile = await runInTenantScope(session.permissions, prisma(), (tx) =>
    readOwnProfile({ tx, tenantId: session.tenantId, customerId: session.customerId }),
  )

  if (profile === null) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-ink">{CUSTOMER_PANEL.profile.title}</h1>
          <p className="text-sm text-ink-2">{CUSTOMER_PANEL.profile.lead}</p>
        </div>
        <p
          className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3"
          role="alert"
        >
          {CUSTOMER_PANEL.profile.missing}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMER_PANEL.profile.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMER_PANEL.profile.lead}</p>
      </div>

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5 shadow-1">
        <h2 className="text-base font-bold text-ink">{CUSTOMER_PANEL.profile.title}</h2>
        <OwnProfileForm
          firstName={profile.firstName}
          lastName={profile.lastName}
          mobile={profile.mobile}
          birthDate={profile.birthDate}
          residenceArea={profile.residenceArea}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5 shadow-1">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-ink">
            {CUSTOMER_PANEL.profile.consent.title}
          </h2>
          <p className="text-sm text-ink-2">{CUSTOMER_PANEL.profile.consent.lead}</p>
        </div>
        <OwnConsentForm
          sms={profile.consentSms}
          whatsApp={profile.consentWhatsApp}
          phone={profile.consentPhone}
          beforeAfter={profile.consentBeforeAfter}
        />
      </section>
    </div>
  )
}
