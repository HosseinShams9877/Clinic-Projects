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
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface [&_summary::-webkit-details-marker]:hidden"
      open={defaultOpen}
    >
      {/* 👈 نوار آبی بالای کارت */}
      <div className="h-1 w-full shrink-0 bg-brand" aria-hidden="true" />
      
      {/* 👈 هدر با پس‌زمینه رنگی */}
      <summary className="flex flex-wrap cursor-pointer items-center justify-between gap-3 border-b border-line/40 bg-brand-50 px-5 py-4 select-none">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-brand-900">{title}</h2>
          {note === undefined ? null : <span className="text-xs font-medium text-brand-700/70">{note}</span>}
        </div>
        <div className="flex items-center gap-3">
          {action}
          <Icon
            name="chevronDown"
            size="compact"
            className="text-brand-700 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  )
}