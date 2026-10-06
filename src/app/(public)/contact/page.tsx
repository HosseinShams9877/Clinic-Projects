/**
 * «تماس و مشاوره» — `02-architecture.md` §9's `contact.html`.
 *
 * The form is the deliverable's lead capture: a person who wants advice becomes a
 * **lead** with `acquisitionSource: Website`, and the lead appears in the reception
 * cartable. The page reads the catalogue so the form's service dropdown names real
 * services, and the island owns the submit.
 */

import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
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

export const metadata = { title: PUBLIC_CONTACT.title }

export default async function ContactPage() {
  const tenantId = await resolveTenantId()
  const services = tenantId === null ? [] : await readServices(tenantId)
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
            <InfoRow icon="phone" title={copy.phoneTitle} value={copy.phoneValue} />
            <InfoRow icon="location" title={copy.addressTitle} value={copy.addressValue} />
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
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
        <Icon name={icon} size="compact" />
      </span>
      <div className="flex flex-col gap-1">
        <dt className="text-xs font-semibold text-ink-2">{title}</dt>
        <dd className="text-sm text-ink" dir={icon === 'phone' ? 'ltr' : undefined}>{value}</dd>
      </div>
    </div>
  )
}

async function readServices(tenantId: TenantId): Promise<readonly PublicService[]> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), (tx) =>
    publicServices(tx, tenantId),
  )
}
