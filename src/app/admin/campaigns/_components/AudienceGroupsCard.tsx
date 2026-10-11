/**
 * The audience groups card — the demo's «گروه‌های مخاطب».
 *
 * The eight are the `audience-groups` module's own built-ins, and their names and
 * sentences are that module's catalog — imported here and not retyped, the way the
 * cycles page imports the services module's own names. Each card's count is the group's
 * own `lastCount`, which is the number the nightly refresh recomputes from the same
 * evaluation the dispatch runs; the card names it and does not re-evaluate, because a
 * second answer arriving after the manager read the first is the failure the refresh
 * exists to prevent.
 *
 * The demo's eight names are the demo's own and the module's eight differ from them
 * («خوابیده‌ها» where the demo reads «مشتریان غیرفعال»), because the eight are the
 * specification's own and a renamed label would be a group the manager cannot ask for by
 * the name they know (`audience-groups/catalog.ts` says so in its own header). The cards
 * render the module's eight.
 *
 * The head's «ساخت گروه دستی از فهرست مشتریان» points at the customers list, which is
 * the page a manual group would be built from; the builder for one is not a surface the
 * product holds, so the link reaches the list and the group's own creation is the
 * assistant's and the module's seed.
 */

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { formatNumber } from '@/core/localization'

import { ADMIN_CAMPAIGNS } from '@/app/admin/catalog'

/** One built-in group, as the page loaded it from the module's own read. */
export interface GroupCard {
  /** The group's own key, as the module's closed set spells it. */
  readonly key: string
  /** The group's own name, as the module's catalog labels it. */
  readonly label: string
  /** One sentence the module's catalog keeps about who the group holds. */
  readonly description: string
  /** The group's own last-refreshed size. */
  readonly count: number
}

/** The card's props: the eight built-ins, as the page composed them. */
export interface AudienceGroupsCardProps {
  readonly groups: readonly GroupCard[]
}

export function AudienceGroupsCard({ groups }: AudienceGroupsCardProps) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <span className="grid size-7 place-items-center rounded-sm bg-brand-50 text-brand">
            <Icon name="customers" size="compact" />
          </span>
          {ADMIN_CAMPAIGNS.groupsTitle}
        </h2>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand no-underline hover:underline"
        >
          {ADMIN_CAMPAIGNS.groupsManual}
          <Icon name="chevronEnd" size="compact" />
        </Link>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 panel:grid-cols-4">
        {groups.map((group) => (
          <div
            key={group.key}
            className="flex items-center gap-3 rounded-md border border-line-2 bg-surface p-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-brand-50 text-brand">
              <Icon name="customers" size="compact" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-bold text-ink">{group.label}</span>
              <span className="text-xs text-ink-3">{group.description}</span>
            </span>
            <span className="shrink-0 rounded-pill bg-brand-50 px-3 py-[4px] text-xs font-semibold text-brand-700 tabular-nums">
              {formatNumber(group.count)}
              {ADMIN_CAMPAIGNS.groupCountSuffix}
            </span>
          </div>
        ))}
      </div>
      <footer className="border-t border-line px-4 py-3">
        <p className="text-xs text-ink-3">{ADMIN_CAMPAIGNS.groupsHint}</p>
      </footer>
    </section>
  )
}
