/**
 * «خانه» — `02-architecture.md` §9's `index.html`.
 *
 * The page is four sections the design system pins: §30's hero, §31's trust bar, §32's
 * service cards and §33's doctor cards. Each is a read and a render — the catalogue and
 * the team come from the module, and the copy comes from the catalog, so the page holds
 * one layout decision (the order of the four) and no other fact of its own.
 */

import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import { Icon } from '@/core/components/icons'
import {
  formatMoney,
  PERSIAN_LIST_SEPARATOR,
  renderMessage,
  toPersianDigits,
} from '@/core/localization'

import {
  PUBLIC_HOME,
  publicBeforeAfter,
  publicDoctors,
  publicServices,
  type PublicDoctor,
  type PublicService,
  type TrustItem,
} from '@/modules/public-site'

export const metadata = { title: PUBLIC_HOME.hero.title }

export default async function HomePage() {
  const tenantId = await resolveTenantId()
  const { services, doctors, gallery } = await readHome(tenantId)

  return (
    <>
      <Hero />
      <TrustBar />
      <ServicesSection services={services} />
      <DoctorsSection doctors={doctors} />
      <BeforeAfterSection gallery={gallery} />
    </>
  )
}

/** §30 — the gradient banner, the two actions and the 16/11 media. */
function Hero() {
  const hero = PUBLIC_HOME.hero
  return (
    <section
      className="px-[var(--content-pad)] py-[72px] panel:px-[var(--content-pad-sm)]"
      style={{ backgroundImage: 'linear-gradient(105deg, #FBF1EE 0%, #F3EBE6 55%, #EEE3DC 100%)' }}
    >
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 panel:grid-cols-2 panel:gap-[40px]">
        <div className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-brand-700">
            {hero.badge}
          </span>
          <h1 className="text-[42px] font-extrabold leading-[1.45] text-ink">
            {hero.title}
            <span className="block text-brand">{hero.titleHighlight}</span>
          </h1>
          <p className="max-w-[520px] text-base leading-8 text-ink-2">{hero.lead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={hero.primaryCta.href}
              className="inline-flex items-center justify-center rounded-lg bg-brand-btn px-6 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand"
            >
              {hero.primaryCta.label}
            </Link>
            <Link
              href={hero.secondaryCta.href}
              className="inline-flex items-center justify-center rounded-lg border border-line bg-white px-6 py-3 text-sm font-semibold text-ink no-underline transition-colors hover:border-brand-300"
            >
              {hero.secondaryCta.label}
            </Link>
          </div>
        </div>
        <div className="aspect-[16/11] overflow-hidden rounded-[24px] bg-brand-100">
          <div className="grid size-full place-items-center">
            <Icon name="treatment" size="action" />
          </div>
        </div>
      </div>
    </section>
  )
}

/** §31 — four facts, a vertical divider between them, an icon and two lines each. */
function TrustBar() {
  const items: readonly TrustItem[] = PUBLIC_HOME.trust.items
  return (
    <section className="border-b border-line bg-white px-[var(--content-pad)] py-6 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 panel:grid-cols-4 panel:gap-0">
        {items.map((item, index) => (
          <div
            key={item.title}
            className="flex flex-col items-center justify-center gap-1.5 text-center panel:border-r panel:border-line panel:py-1 first:panel:border-r-0"
            style={index === 0 ? { borderRightWidth: 0 } : undefined}
          >
            <span className="grid size-[26px] place-items-center text-brand">
              <Icon name={item.icon} size="compact" />
            </span>
            <span className="text-[13px] font-bold text-ink">{item.title}</span>
            <span className="text-[11.5px] text-ink-2">{item.subtitle}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** §32 — the catalogue's cards, with the floating icon on the image's edge. */
function ServicesSection({ services }: { readonly services: readonly PublicService[] }) {
  const copy = PUBLIC_HOME.services
  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
        <SectionHeader title={copy.title} lead={copy.lead} action={{ href: '/services', label: copy.viewAll }} />
        {services.length === 0 ? (
          <p className="text-sm text-ink-2">{copy.empty}</p>
        ) : (
          <div className="grid gap-6 panel:grid-cols-2 panel:gap-6 desktop:grid-cols-3">
            {services.slice(0, 6).map((service) => (
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
  readonly copy: typeof PUBLIC_HOME.services
}) {
  return (
    <Link
      href={`/service/${service.id}`}
      className="group relative flex flex-col overflow-hidden rounded-[18px] border border-line bg-white no-underline transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-brand-300 hover:shadow-2"
    >
      <div className="relative aspect-[4/3] bg-brand-100">
        <div className="grid size-full place-items-center text-brand-300">
          <Icon name="treatment" size="action" />
        </div>
        <span className="absolute bottom-0 left-1/2 grid size-[34px] -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border-[3px] border-white bg-brand-50 text-brand">
          <Icon name="appointment" size="compact" />
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <h3 className="text-sm font-bold text-ink">{service.name}</h3>
        <p className="line-clamp-2 text-xs leading-6 text-ink-2">
          {service.siteDescription ?? service.category}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-2">
          <span className="flex items-center gap-1">
            <Icon name="clock" size="compact" />
            {renderMessage(copy.duration, { minutes: toPersianDigits(service.durationMinutes) })}
          </span>
        </div>
        <p className="mt-1 text-[13px] font-bold text-brand-700">
          {service.showPriceOnSite ? `${copy.priceFrom} ${formatMoney(service.price)}` : copy.priceFrom}
        </p>
      </div>
    </Link>
  )
}

/** §33 — the team's cards, square images and an arrow that inverts on hover. */
function DoctorsSection({ doctors }: { readonly doctors: readonly PublicDoctor[] }) {
  const copy = PUBLIC_HOME.doctors
  return (
    <section className="bg-bg px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
        <SectionHeader title={copy.title} lead={copy.lead} action={{ href: '/doctors', label: copy.viewAll }} />
        {doctors.length === 0 ? (
          <p className="text-sm text-ink-2">{copy.empty}</p>
        ) : (
          <div className="grid gap-6 panel:grid-cols-2 desktop:grid-cols-4">
            {doctors.slice(0, 4).map((doctor) => (
              <DoctorCard key={doctor.id} doctor={doctor} copy={copy} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function DoctorCard({
  doctor,
  copy,
}: {
  readonly doctor: PublicDoctor
  readonly copy: typeof PUBLIC_HOME.doctors
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="aspect-square bg-brand-100">
        <div className="grid size-full place-items-center text-brand-300">
          <Icon name="doctor" size="action" />
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-bold text-ink">{doctor.name}</h3>
          <p className="text-[11.5px] text-ink-2">{doctor.specialties.join(PERSIAN_LIST_SEPARATOR)}</p>
        </div>
        <Link
          href="/booking"
          className="group inline-flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink no-underline transition-colors hover:border-brand"
        >
          {copy.visit}
          <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
            <Icon name="chevronStart" size="compact" />
          </span>
        </Link>
      </div>
    </div>
  )
}

/** §34 — the gallery, consent-filtered by the read and rendered as two-image grids. */
function BeforeAfterSection({
  gallery,
}: {
  readonly gallery: readonly { readonly id: string; readonly path: string; readonly caption: string | null }[]
}) {
  const copy = PUBLIC_HOME.beforeAfter
  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
        <SectionHeader title={copy.title} lead={copy.lead} />
        {gallery.length === 0 ? (
          <p className="text-sm text-ink-2">{copy.empty}</p>
        ) : (
          <div className="grid gap-6 panel:grid-cols-2 desktop:grid-cols-3">
            {gallery.slice(0, 6).map((image) => (
              <div key={image.id} className="grid grid-cols-2 gap-[3px] overflow-hidden rounded-[14px]">
                <PairPane label={copy.before} path={image.path} />
                <PairPane label={copy.after} path={image.path} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PairPane({ label, path }: { readonly label: string; readonly path: string }) {
  return (
    <div className="relative aspect-square bg-brand-100">
      <div className="grid size-full place-items-center text-brand-300">
        <Icon name="treatment" size="action" />
      </div>
      <span className="absolute inset-x-0 bottom-0 bg-[rgba(46,37,36,.72)] py-1.5 text-center text-[11.5px] font-medium text-white">
        {label}
      </span>
      <span className="sr-only">{path}</span>
    </div>
  )
}

function SectionHeader({
  title,
  lead,
  action,
}: {
  readonly title: string
  readonly lead: string
  readonly action?: { readonly href: string; readonly label: string }
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 panel:flex-row panel:items-end">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
        <p className="text-sm text-ink-2">{lead}</p>
      </div>
      {action === undefined ? null : (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline"
        >
          {action.label}
          <Icon name="chevronStart" size="compact" />
        </Link>
      )}
    </div>
  )
}

/**
 * The page's four reads in one scoped transaction, so the four sections are one fact
 * about the clinic and not four reads that could disagree mid-render.
 */
async function readHome(tenantId: Awaited<ReturnType<typeof resolveTenantId>>) {
  if (tenantId === null) return { services: [], doctors: [], gallery: [] }
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), async (tx) => {
    const [services, doctors, gallery] = await Promise.all([
      publicServices(tx, tenantId),
      publicDoctors(tx, tenantId),
      publicBeforeAfter(tx, tenantId),
    ])
    return { services, doctors, gallery }
  })
}