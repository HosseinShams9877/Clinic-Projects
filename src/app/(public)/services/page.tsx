/**
 * «خدمات» — `02-architecture.md` §9's `services.html`.
 *
 * The catalogue as the public site sees it: active services only, cheapest first, each
 * card the §32 shape the home page uses. The page's own contribution is the list and
 * nothing else — the read is the module's and the copy is the catalog's.
 */

import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import type { TenantId } from '@/core/types'
import { Icon } from '@/core/components/icons'
import { formatMoney } from '@/core/localization'

import { PUBLIC_SERVICES, publicServices, type PublicService } from '@/modules/public-site'

export const metadata = { title: PUBLIC_SERVICES.title }

export default async function ServicesPage() {
  const tenantId = await resolveTenantId()
  const services = tenantId === null ? [] : await readServices(tenantId)
  const copy = PUBLIC_SERVICES

  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">{copy.title}</h1>
          <p className="text-sm text-ink-2">{copy.lead}</p>
        </div>
        {services.length === 0 ? (
          <p className="text-sm text-ink-2">{copy.empty}</p>
        ) : (
          <div className="grid gap-6 panel:grid-cols-2 desktop:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} copy={copy} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ServiceCard({
  service,
  copy,
}: {
  readonly service: PublicService
  readonly copy: typeof PUBLIC_SERVICES
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-[18px] border border-line bg-white transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-brand-300 hover:shadow-2">
      <div className="relative aspect-[4/3] bg-brand-100">
        <div className="grid size-full place-items-center text-brand-300">
          <Icon name="treatment" size="action" />
        </div>
        <span className="absolute bottom-0 left-1/2 grid size-[34px] -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border-[3px] border-white bg-brand-50 text-brand">
          <Icon name="appointment" size="compact" />
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-bold text-ink">{service.name}</h3>
          <p className="line-clamp-2 text-xs leading-6 text-ink-2">
            {service.siteDescription ?? service.category}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-2">
          <span className="flex items-center gap-1 rounded-full bg-bg px-2.5 py-1">
            <Icon name="clock" size="compact" />
            {copy.duration(service.durationMinutes)}
          </span>
          {service.defaultSessions > 1 ? (
            <span className="rounded-full bg-bg px-2.5 py-1">{copy.sessions(service.defaultSessions)}</span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[13px] font-bold text-brand-700">
            {service.showPriceOnSite
              ? service.price === 0n
                ? copy.free
                : `${copy.priceFrom} ${formatMoney(service.price)}`
              : copy.priceFrom}
          </span>
          <Link
            href={`/service/${service.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand no-underline"
          >
            {copy.book}
            <Icon name="chevronStart" size="compact" />
          </Link>
        </div>
      </div>
    </div>
  )
}

async function readServices(tenantId: TenantId): Promise<readonly PublicService[]> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), (tx) =>
    publicServices(tx, tenantId),
  )
}
