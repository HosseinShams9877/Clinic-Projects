/**
 * «رزرو نوبت» — `02-architecture.md` §9's `booking.html`.
 *
 * The page is the wizard's shell: it reads the catalogue and the team on the server,
 * hands them to the client island as already-built props, and the island owns the three
 * steps. The split is the appointments dialog's own, and for the same reason — the
 * module barrels are server-only, and a client component may not reach one.
 */

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { resolveTenantId } from '@/app/_shell/tenant'
import { todayLocalDate } from '@/core/localization'
import type { TenantId } from '@/core/types'

import {
  PUBLIC_BOOKING,
  publicDoctors,
  publicServices,
  type PublicDoctor,
  type PublicService,
} from '@/modules/public-site'
import { BookingWizard } from '@/app/_public/booking-wizard'

export const metadata = { title: PUBLIC_BOOKING.title }

export default async function BookingPage() {
  const tenantId = await resolveTenantId()
  const empty = { services: [], doctors: [] }
  const data = tenantId === null ? empty : await readBooking(tenantId)

  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">{PUBLIC_BOOKING.title}</h1>
          <p className="text-sm text-ink-2">{PUBLIC_BOOKING.lead}</p>
        </div>
        <BookingWizard
          services={data.services.map((service) => ({
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            depositAmount: service.depositAmount,
            showPriceOnSite: service.showPriceOnSite,
          }))}
          doctors={data.doctors.map((doctor) => ({ id: doctor.id, name: doctor.name }))}
          steps={PUBLIC_BOOKING.steps}
          labels={PUBLIC_BOOKING.labels}
          hints={PUBLIC_BOOKING.hints}
          actions={PUBLIC_BOOKING.actions}
          formats={PUBLIC_BOOKING.formats}
          result={PUBLIC_BOOKING.result}
          today={todayLocalDate(realClock())}
          empty={PUBLIC_BOOKING.empty}
        />
      </div>
    </section>
  )
}

async function readBooking(tenantId: TenantId): Promise<{
  services: readonly PublicService[]
  doctors: readonly PublicDoctor[]
}> {
  return runInTenantScope({ tenantId, clinicId: null, role: 'public', userId: 'public' }, prisma(), async (tx) => {
    const [services, doctors] = await Promise.all([
      publicServices(tx, tenantId),
      publicDoctors(tx, tenantId),
    ])
    return { services, doctors }
  })
}
