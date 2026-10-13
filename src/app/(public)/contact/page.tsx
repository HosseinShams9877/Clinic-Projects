/**
 * «تماس و مشاوره» — `02-architecture.md` §9's `contact.html`.
 *
 * The form is the deliverable's lead capture: a person who wants advice becomes a
 * **lead** with `acquisitionSource: Website`, and the lead appears in the reception
 * cartable. The page reads the catalogue so the form's service dropdown names real
 * services, and the island owns the submit.
 *
 * ## Why the contact facts come from the database
 *
 * The page used to render `PUBLIC_CONTACT.phoneValue`, `addressValue` and `hours`,
 * which are the *catalog's* copy and not the tenant's — so every clinic showed the
 * same phone and address. The facts a visitor needs to reach *this* clinic are the
 * clinic's own row, and the header already reads them; the page reads the same row
 * and renders it beside the form.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope, unscopedPrisma } from '@/core/db'
import { formatPhone } from '@/core/localization'
import { resolveTenantId } from '@/app/_shell/tenant'
import type { TenantId } from '@/core/types'
import { Icon } from '@/core/components/icons'

import {
  PUBLIC_CONTACT,
  PUBLIC_LAYOUT,
  publicServices,
  type PublicService,
} from '@/modules/public-site'
import { ConsultationForm } from '@/app/_public/consultation-form'

export const metadata: Metadata = { title: PUBLIC_CONTACT.title }

export default async function ContactPage() {
  const tenantId = await resolveTenantId()
  const [services, clinic] = await Promise.all([
    tenantId === null ? [] : readServices(tenantId),
    tenantId === null ? null : readClinic(tenantId),
  ])
  const copy = PUBLIC_CONTACT

  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto grid w-full max-w-[1100px] gap-10 panel:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-ink">{copy.title}</h1>
            <p className="text-sm leading-7 text-ink-2">{copy.lead}</p>
          </div>
          <ConsultationForm
            labels={copy.labels}
            hints={copy.hints}
            submit={copy.submit}
            submitting={copy.submitting}
            result={copy.result}
            services={services.map((service) => ({ id: service.id, name: service.name }))}
          />
        </div>

        <aside className="flex flex-col gap-6 rounded-[18px] border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-ink">{copy.infoTitle}</h2>
          <div className="flex flex-col gap-4">
            {clinic?.phone === null || clinic?.phone === undefined ? null : (
              <InfoRow icon="phone" title={copy.phoneTitle} value={clinic.phone} />
            )}
            {clinic?.address === null || clinic?.address === undefined ? null : (
              <InfoRow icon="location" title={copy.addressTitle} value={clinic.address} />
            )}
            <InfoRow icon="clock" title={copy.hoursTitle} value={copy.hours} />
          </div>
          <Link
            href={PUBLIC_LAYOUT.bookingCta.href}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-btn px-5 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand"
          >
            <Icon name="appointment" size="compact" />
            {copy.bookCta}
          </Link>
        </aside>
      </div>
    </section>
  )
}

function InfoRow({
  icon,
  title,
  value,
}: {
  readonly icon: 'phone' | 'location' | 'clock'
  readonly title: string
  readonly value: string
}) {
  // A phone number is read by a person, so it is the one value this row
  // formats. `formatPhone` normalises the number, converts it to Persian
  // digits, and isolates the LTR run inside the Persian sentence. The other
  // two rows carry text that is already the clinic's own copy.
  const display = icon === 'phone' ? formatPhone(value) : value
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
        <Icon name={icon} size="compact" />
      </span>
      <div className="flex flex-col gap-1">
        <dt className="text-xs font-semibold text-ink-2">{title}</dt>
        <dd className="text-sm text-ink" dir={icon === 'phone' ? 'ltr' : undefined}>
          {display}
        </dd>
      </div>
    </div>
  )
}

async function readServices(tenantId: TenantId): Promise<readonly PublicService[]> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), (tx) =>
    publicServices(tx, tenantId),
  )
}

async function readClinic(tenantId: TenantId): Promise<{
  readonly phone: string | null
  readonly address: string | null
} | null> {
  const row = await unscopedPrisma().clinic.findFirst({
    where: { tenantId, isActive: true },
    select: { phone: true, address: true },
  })
  return row
}