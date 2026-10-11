/**
 * The header's «کمپین جدید» — the one of the wizard's three entry points the URL holds.
 *
 * The wizard's other two entries (a type card, the assistant's «بررسی و شروع») carry a
 * choice the page renders in memory, but this one is a navigation, because an open
 * wizard is a bookmarkable fact: `?new=1` is a link a manager can hand a colleague, and
 * the wizard's own revalidation clears it on close. A `Button` and a `router.push` are
 * the pair the day picker already uses for the same reason — the design system's button
 * is a `<button>` and not an `<a>`, so the navigation goes through the router and the
 * pixel stays the demo's.
 *
 * The href is the page's, so the params the open preserves are the params the page owns.
 */

'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/core/components/button'
import { CAMPAIGNS_PAGE } from '@/app/catalog'

/** The button's one prop: the `?new=1` href the page built from its own other params. */
export interface NewCampaignButtonProps {
  readonly href: string
}

/** «کمپین جدید» — a push, and the wizard opens from the URL the page reads. */
export function NewCampaignButton({ href }: NewCampaignButtonProps) {
  const router = useRouter()
  return (
    <Button size="large" variant="primary" leadingIcon="add" onClick={() => router.push(href)}>
      {CAMPAIGNS_PAGE.builder.title}
    </Button>
  )
}
