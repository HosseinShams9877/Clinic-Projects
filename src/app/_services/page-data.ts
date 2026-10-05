/**
 * The reads the services catalogue's two surfaces share, in one place.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and the composition the
 * catalogue page and its dialogs have in common is not the table — the page renders
 * that — but the reads behind it: the tenant's services with their doctors, and the
 * doctor options the assignment checkboxes offer. Those are one transaction's worth
 * of queries, written once so a dialog and the row it edits cannot disagree about who
 * a service is bookable by.
 *
 * ## Why the doctors are read once for the whole catalogue
 *
 * A service's doctor column is a `service_doctors` row, and a catalogue of twenty
 * services read as twenty per-service queries is twenty trips where one does. The
 * join belongs in the app tier because it composes two modules' rows — `services`
 * owns the catalogue and `staff` owns the people — and a module may not reach into
 * another's tables (`02-architecture.md` §10 rule 2).
 *
 * ## Why the doctor options come from `staff`
 *
 * The checkboxes name the tenant's own doctors, and the `staff` module's `listStaff`
 * is its own read of them. The page's caller holds the manager column, which carries
 * `manage_users` as well as `manage_services`, so the read is permitted by the
 * permission the surface already resolved — and a reader that holds one without the
 * other is a reader the catalogue's own permission gate speaks to first.
 *
 * ## What is deliberately not here
 *
 * A row. Nothing here writes, because a page is a read and a write is an action
 * (`actions.ts`). Nothing here deletes either, for the same reason the module has no
 * `deleteService` (DoD 3): the read half of that rule is that no surface offers a
 * path the module does not have.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

import {
  listServices,
  type ServiceRow,
} from '@/modules/services'
import { listStaff } from '@/modules/staff'
import { Role } from '@/core/constants'

/** One doctor the assignment checkboxes offer. */
export interface ServiceDoctorOption {
  /** The `User` id the column stores and the checkbox writes back. */
  readonly value: string
  readonly label: string
}

/** The catalogue, with each service's doctor names and the options the form offers. */
export interface ServicesCatalogueData {
  readonly rows: readonly (ServiceRow & {
    /**
     * The `User` ids the column stores, which the assignment checkboxes need to
     * pre-check — the names render, the ids round-trip.
     */
    readonly doctorIds: readonly string[]
    /** The names the catalogue's doctor column renders, already joined. */
    readonly doctorNames: readonly string[]
  })[]
  readonly doctorOptions: readonly ServiceDoctorOption[]
}

/**
 * One service, as its edit and assignment dialogs read it.
 *
 * Both dialogs read the row the page already holds — the catalogue's own `ServiceRow`
 * carries every field the edit form edits — so the page is the one read and there is no
 * second one to agree with. The doctors the checkboxes pre-check are the page's own
 * `doctorIds`, and the options are the page's own `doctorOptions`.
 */

/* ── The doctor options ────────────────────────────────────────────────────── */

/**
 * The tenant's catalogue, inactive services last, with each service's doctors.
 *
 * Inactive services are included because the page is the catalogue's own editor: a
 * clinic that re-offers a service should not have to re-enter it, and the booking
 * picker — not the catalogue — is the surface that excludes them.
 */
export async function loadServicesCatalogue(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly category?: string
}): Promise<ServicesCatalogueData> {
  const [rows, links, doctorOptions] = await Promise.all([
    listServices({ tx: args.tx, ctx: args.ctx, category: args.category, includeInactive: true }),
    args.tx.serviceDoctor.findMany({
      where: { tenantId: args.ctx.tenantId, service: { id: undefined } },
      select: { serviceId: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
    }),
    loadDoctorOptions(args.tx, args.ctx),
  ])

  // The tenant filter above is the scope's own; the join is read for every service at
  // once and grouped here, so a catalogue of N services is one read for its doctors.
  const ids = new Set(rows.map((row) => row.id))
  const namesByService = new Map<string, string[]>()
  const doctorsByService = new Map<string, string[]>()
  for (const link of links) {
    if (!ids.has(link.serviceId)) continue
    const names = namesByService.get(link.serviceId) ?? []
    names.push([link.doctor.firstName, link.doctor.lastName].filter(Boolean).join(' '))
    namesByService.set(link.serviceId, names)
    const value = doctorsByService.get(link.serviceId) ?? []
    value.push(link.doctor.id)
    doctorsByService.set(link.serviceId, value)
  }

  return {
    rows: rows.map((row) => ({
      ...row,
      doctorIds: doctorsByService.get(row.id) ?? [],
      doctorNames: namesByService.get(row.id) ?? [],
    })),
    doctorOptions,
  }
}

/**
 * The tenant's own doctors, as the assignment checkboxes offer them.
 *
 * `listStaff` is the `staff` module's own read and returns the membership's person,
 * which is the id the column stores; the filter to doctors is here because the
 * catalogue's question — «پزشکان مجاز» — is this surface's and not the staff list's.
 */
export async function loadDoctorOptions(
  tx: TransactionClient,
  ctx: TenantContext,
): Promise<readonly ServiceDoctorOption[]> {
  const staff = await listStaff({ tx, ctx })
  return staff
    .filter((row) => row.role === Role.Doctor && row.isActive)
    .map((row) => ({
      value: row.userId,
      label: [row.user.firstName, row.user.lastName].filter(Boolean).join(' '),
    }))
}
