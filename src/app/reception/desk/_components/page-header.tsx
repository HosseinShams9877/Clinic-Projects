/**
 * The desk's page header — the title, the day's date and count, and the two
 * buttons the demo carries («اولین زمان آزاد», «ثبت نوبت»).
 */

import Link from 'next/link'

import { Button } from '@/core/components/button/Button'

import { DESK_PAGE } from '@/app/catalog'

export function PageHeader({
  dateLabel,
  countLabel,
  firstFreeHref,
  bookHref,
}: {
  dateLabel: string
  countLabel: string
  firstFreeHref: string
  bookHref: string
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-ink">{DESK_PAGE.title}</h1>
        <p className="text-sm text-ink-2">
          {dateLabel} — {countLabel}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={firstFreeHref} className="no-underline">
          <Button variant="soft" size="small" leadingIcon="clock">
            {DESK_PAGE.header.firstFree}
          </Button>
        </Link>
        <Link href={bookHref} className="no-underline">
          <Button variant="primary" size="small" leadingIcon="add">
            {DESK_PAGE.header.book}
          </Button>
        </Link>
      </div>
    </header>
  )
}