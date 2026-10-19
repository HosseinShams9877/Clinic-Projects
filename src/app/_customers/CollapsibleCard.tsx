'use client'

import { Icon } from '@/core/components/icons'

export function CollapsibleCard({
  title,
  note,
  action,
  children,
  defaultOpen = true,
}: {
  readonly title: string
  readonly note?: string
  readonly action?: React.ReactNode
  readonly children: React.ReactNode
  readonly defaultOpen?: boolean
}) {
  return (
    <details
      className="group flex flex-col rounded-lg border border-line bg-surface [&_summary::-webkit-details-marker]:hidden"
      open={defaultOpen}
    >
      <summary className="flex flex-wrap cursor-pointer items-center justify-between gap-3 border-b border-line px-4 py-3 select-none">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          {note === undefined ? null : <span className="text-xs text-ink-3">{note}</span>}
        </div>
        <div className="flex items-center gap-3">
          {action}
          <Icon
            name="chevronDown"
            size="compact"
            className="text-ink-3 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  )
}