/**
 * «جزئیات خدمت» — `02-architecture.md` §9's `service-detail.html`.
 *
 * The specification's first scenario starts here: a person opens a service, reads it,
 * and the page's button opens the booking wizard on that service. The button is a link
 * to `/booking` carrying the service id, and the wizard is what turns it into a row —
 * the page itself writes nothing.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import type { TenantId } from '@/core/types'
import { Icon } from '@/core/components/icons'
import { formatMoney } from '@/core/localization'

import {
  PUBLIC_SERVICE_DETAIL,
  publicService,
  publicServiceBeforeAfter,
  type PublicBeforeAfter,
  type PublicService,
} from '@/modules/public-site'

export const metadata = { title: PUBLIC_SERVICE_DETAIL.book }

interface PageProps {
  readonly params: Promise<{ readonly id: string }>
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params
  const tenantId = await resolveTenantId()
  const service = tenantId === null ? null : await readService(tenantId, id)

  if (service === null) notFound()

  const gallery = tenantId === null ? [] : await readGallery(tenantId)
  const copy = PUBLIC_SERVICE_DETAIL

  return (
    <article className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-10">
        <div className="grid gap-8 panel:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-brand">{service.category}</span>
              <h1 className="text-3xl font-bold leading-tight text-ink">{service.name}</h1>
              <p className="text-base leading-8 text-ink-2">
                {service.siteDescription ?? copy.notSet}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs text-ink-2">
                <Icon name="clock" size="compact" />
                {copy.duration(service.durationMinutes)}
              </span>
              <span className="text-[13px] font-bold text-brand-700">
                {service.showPriceOnSite
                  ? service.price === 0n
                    ? copy.free
                    : `${copy.priceFrom} ${formatMoney(service.price)}`
                  : copy.priceFrom}
              </span>
            </div>
            <Link
              href={{ pathname: '/booking', query: { service: service.id } }}
              className="inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-brand-btn px-6 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand"
            >
              <Icon name="appointment" size="compact" />
              {copy.book}
            </Link>
            {service.depositAmount > 0n ? (
              <p className="text-[11.5px] text-ink-2">{copy.depositNote(formatMoney(service.depositAmount))}</p>
            ) : null}
          </div>
          <div className="aspect-[4/3] overflow-hidden rounded-[24px] bg-brand-100">
            <div className="grid size-full place-items-center text-brand-300">
              <Icon name="treatment" size="action" />
            </div>
          </div>
        </div>

        <CareSection title={copy.sections.beforeCare} body={service.beforeCare} copy={copy} />
        <CareSection title={copy.sections.afterCare} body={service.afterCare} copy={copy} />
        <CareSection title={copy.sections.notSuitableFor} body={service.notSuitableFor} copy={copy} />
        <BeforeAfter gallery={gallery} copy={copy} />
      </div>
    </article>
  )
}

function CareSection({
  title,
  body,
  copy,
}: {
  readonly title: string
  readonly body: string | null
  readonly copy: typeof PUBLIC_SERVICE_DETAIL
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-8">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="text-sm leading-8 text-ink-2">{body ?? copy.notSet}</p>
    </section>
  )
}

function BeforeAfter({
  gallery,
  copy,
}: {
  readonly gallery: readonly { readonly id: string; readonly path: string; readonly caption: string | null }[]
  readonly copy: typeof PUBLIC_SERVICE_DETAIL
}) {
  if (gallery.length === 0) return null
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="text-lg font-bold text-ink">{copy.sections.beforeAfter}</h2>
      <div className="grid gap-4 panel:grid-cols-2">
        {gallery.slice(0, 4).map((image) => (
          <figure key={image.id} className="grid grid-cols-2 gap-[3px] overflow-hidden rounded-[14px]">
            <PairPane label={copy.sections.before} />
            <PairPane label={copy.sections.after} />
            {image.caption === null ? null : (
              <figcaption className="col-span-2 pt-2 text-center text-[11.5px] text-ink-2">
                {image.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  )
}

function PairPane({ label }: { readonly label: string }) {
  return (
    <div className="relative aspect-square bg-brand-100">
      <div className="grid size-full place-items-center text-brand-300">
        <Icon name="treatment" size="action" />
      </div>
      <span className="absolute inset-x-0 bottom-0 bg-[rgba(46,37,36,.72)] py-1.5 text-center text-[11.5px] font-medium text-white">
        {label}
      </span>
    </div>
  )
}

async function readService(tenantId: TenantId, serviceId: string): Promise<PublicService | null> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), (tx) =>
    publicService(tx, tenantId, serviceId),
  )
}

async function readGallery(tenantId: TenantId): Promise<readonly PublicBeforeAfter[]> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), (tx) =>
    publicServiceBeforeAfter(tx, tenantId),
  )
}
