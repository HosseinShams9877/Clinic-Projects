/**
 * The customer's aftercare — `02-architecture.md` §9's `account/care.html`.
 *
 * The instructions the clinic wrote for the services this person has actually had,
 * read through the cycles and appointments the module scoped to the session's
 * `customerId` (`09-security.md` §7). The catalogue's care text is public; what makes
 * this page the person's own is the `where` clause, which intersects the tenant with
 * the resolved customer and so shows the care for their treatments and no one else's.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { Icon } from '@/core/components/icons'
import { CUSTOMER_PANEL, ownCareInstructions } from '@/modules/customers'

import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_PANEL.care.title }

/**
 * «دستورالعمل‌های مراقبتی» — one card per service the person has had.
 */
export default async function AccountCarePage() {
  const session = await requireCustomerPanel()

  const instructions = await runInTenantScope(session.permissions, prisma(), (tx) =>
    ownCareInstructions({ tx, tenantId: session.tenantId, customerId: session.customerId }),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMER_PANEL.care.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMER_PANEL.care.lead}</p>
      </div>

      {instructions.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
          {CUSTOMER_PANEL.care.empty}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {instructions.map((instruction) => (
            <CareCard key={instruction.id} instruction={instruction} />
          ))}
        </div>
      )}
    </div>
  )
}

/** One service's two halves, as the card the person keeps. */
function CareCard({
  instruction,
}: {
  readonly instruction: {
    readonly id: string
    readonly serviceName: string
    readonly afterCare: string | null
    readonly beforeCare: string | null
  }
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-1">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Icon name="treatment" size="card" />
        {instruction.serviceName}
      </h2>
      <div className="flex flex-col gap-4">
        <CareHalf label={CUSTOMER_PANEL.care.afterCare} text={instruction.afterCare} />
        <CareHalf label={CUSTOMER_PANEL.care.beforeCare} text={instruction.beforeCare} />
      </div>
    </section>
  )
}

/** One half of the card, absent when the clinic wrote no text for it. */
function CareHalf({ label, text }: { readonly label: string; readonly text: string | null }) {
  if (text === null) return null

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-4">
      <h3 className="text-xs font-bold text-ink-3">{label}</h3>
      <p className="whitespace-pre-line text-sm leading-7 text-ink">{text}</p>
    </div>
  )
}
