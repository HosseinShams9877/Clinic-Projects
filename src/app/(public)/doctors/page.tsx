/**
 * «پزشکان» — `02-architecture.md` §9's `doctors.html`.
 *
 * The team as the public site sees it: doctors who perform at least one service, with
 * their services as the card's subtitle. The read is the module's own, and the §33 card
 * is the same shape the home page renders.
 */

import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import type { TenantId } from '@/core/types'
import { Icon } from '@/core/components/icons'
import { PERSIAN_LIST_SEPARATOR } from '@/core/localization'

import { PUBLIC_DOCTORS, publicDoctors, type PublicDoctor } from '@/modules/public-site'

export const metadata = { title: PUBLIC_DOCTORS.title }

export default async function DoctorsPage() {
  const tenantId = await resolveTenantId()
  const doctors = tenantId === null ? [] : await readDoctors(tenantId)
  const copy = PUBLIC_DOCTORS

  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">{copy.title}</h1>
          <p className="text-sm text-ink-2">{copy.lead}</p>
        </div>
        {doctors.length === 0 ? (
          <p className="text-sm text-ink-2">{copy.empty}</p>
        ) : (
          <div className="grid gap-6 panel:grid-cols-2 desktop:grid-cols-3">
            {doctors.map((doctor) => (
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
  readonly copy: typeof PUBLIC_DOCTORS
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
          <p className="text-[11.5px] text-ink-2">{copy.role}</p>
          <p className="text-[11.5px] text-ink-2">{doctor.specialties.join(PERSIAN_LIST_SEPARATOR)}</p>
        </div>
        <Link
          href={{ pathname: '/booking', query: { doctor: doctor.id } }}
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

async function readDoctors(tenantId: TenantId): Promise<readonly PublicDoctor[]> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), (tx) =>
    publicDoctors(tx, tenantId),
  )
}
