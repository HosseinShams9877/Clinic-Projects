/**
 * The popup's options — the services and the customers its two selects offer.
 *
 * `02-architecture.md` §6 puts reads in the module that owns the table. `services` has
 * landed, so the service read is the module's own `bookableServices` and this file is
 * the composition around it; `customers`'s own reads are scoped to a permission and a
 * question this popup does not ask — the desk's hundred most recent, including the
 * patients a doctor's own scope would exclude — so the customer read stays here next
 * to the popup until the module has the read this surface actually wants.
 *
 * ## Why the reads are scoped and not filtered by hand
 *
 * Both run through the transaction the page already opened, so the extension's scope
 * is what narrows them — a query here cannot return another tenant's services or
 * customers, which is the property the RLS layer exists to keep and the property a
 * hand-written `where: { tenantId }` would only appear to keep.
 *
 * ## Why the service read goes through the module (DoD 4)
 *
 * `bookableServices` is the read `loadBookableService` shares with the write path, so
 * the list the popup offers and the gate the booking runs are one read. A service the
 * clinic deactivated between the popup opening and the form submitting is refused by
 * that gate, and the two cannot disagree because there is one function between them.
 *
 * ## Why the list is bounded
 *
 * The popup's customer search is client-side over the list, and a tenant with
 * thousands of customers is a tenant whose list is not a select. The bound is a
 * hundred, which is a desk's own working set; the search beyond it is the
 * `customers` module's own query.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { bookableServices } from '@/modules/services'

import type { CustomerOption, ServiceOption } from './booking-dialog'

/** The most customers the popup is handed, and the bound the header argues for. */
const POPUP_CUSTOMER_LIMIT = 100

/**
 * The services and the customers the booking popup offers, for one tenant.
 *
 * Services are the clinic's active ones, because an inactive service is history a
 * booking cannot be made against (`03-data-model.md` §2.4's
 * `service_tenant_active_idx` exists for this read). Customers are the tenant's
 * recent ones, ordered by their last visit so the desk's own day is the top of the
 * list.
 */
export async function loadPopupOptions(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<{ readonly services: readonly ServiceOption[]; readonly customers: readonly CustomerOption[] }> {
  const [services, customers] = await Promise.all([
    bookableServices({ tx: args.tx, ctx: args.ctx }),
    args.tx.customer.findMany({
      where: { tenantId: args.ctx.tenantId, isActive: true },
      orderBy: { lastVisitAt: 'desc' },
      take: POPUP_CUSTOMER_LIMIT,
      select: { id: true, firstName: true, lastName: true, mobile: true, lastVisitAt: true },
    }),
  ])

  return {
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      mobile: customer.mobile,
    })),
  }
}
