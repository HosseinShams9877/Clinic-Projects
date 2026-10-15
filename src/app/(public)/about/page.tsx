/**
 * «درباره ما» — `02-architecture.md` §9's `about.html`.
 *
 * The page reads the clinic's own about picture and renders the copy from the
 * catalog. A clinic that has not uploaded the picture renders its own placeholder.
 */

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import { Icon } from '@/core/components/icons'
import { toPersianDigits } from '@/core/localization'

import { PUBLIC_ABOUT, publicClinicImages } from '@/modules/public-site'

export const metadata = { title: PUBLIC_ABOUT.title }

export default async function AboutPage() {
  const copy = PUBLIC_ABOUT
  const tenantId = await resolveTenantId()
  const aboutImageUrl = await readAboutImage(tenantId)

  return (
    <>
      <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold text-ink">{copy.title}</h1>
            <p className="text-base leading-8 text-ink-2">{copy.lead}</p>
          </div>
          <div className="aspect-[16/9] overflow-hidden rounded-[24px] bg-brand-100">
            {aboutImageUrl === null ? (
              <div className="grid size-full place-items-center text-brand-300">
                <Icon name="customers" size="action" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={aboutImageUrl} alt={copy.title} className="size-full object-cover" />
            )}
          </div>
        </div>
      </section>

      <section className="bg-bg px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8">
          <h2 className="text-2xl font-bold text-ink">{copy.storyTitle}</h2>
          <div className="flex flex-col gap-5">
            {copy.story.map((paragraph, index) => (
              <p key={index} className="text-sm leading-8 text-ink-2">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8">
          <h2 className="text-2xl font-bold text-ink">{copy.valuesTitle}</h2>
          <div className="grid gap-5 panel:grid-cols-2 desktop:grid-cols-4">
            {copy.values.map((value) => (
              <div
                key={value.title}
                className="flex flex-col gap-3 rounded-[18px] border border-line bg-white p-5"
              >
                <span className="grid size-10 place-items-center rounded-md bg-brand-50 text-brand">
                  <Icon name={value.icon} size="action" />
                </span>
                <h3 className="text-sm font-bold text-ink">{value.title}</h3>
                <p className="text-[11.5px] leading-6 text-ink-2">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8">
          <h2 className="text-2xl font-bold text-ink">{copy.statsTitle}</h2>
          <div className="grid gap-5 panel:grid-cols-2 desktop:grid-cols-4">
            {copy.stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-2 rounded-[18px] border border-line bg-bg p-6 text-center"
              >
                <span className="text-3xl font-extrabold text-brand">{toPersianDigits(stat.value)}</span>
                <span className="text-[11.5px] text-ink-2">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

/** The clinic's about picture, or `null` for a tenant the address does not resolve. */
async function readAboutImage(
  tenantId: Awaited<ReturnType<typeof resolveTenantId>>,
): Promise<string | null> {
  if (tenantId === null) return null
  const images = await runInTenantScope(
    { tenantId, clinicId: null, role: 'public', userId: 'public' },
    prisma(),
    (tx) => publicClinicImages(tx, tenantId),
  )
  return images.aboutImageUrl
}