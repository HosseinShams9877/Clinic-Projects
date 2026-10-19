'use client'

import { useState } from 'react'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '../popover'
import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'
import { CONTROL_CLASSES } from '../form/control-classes'

export interface TimePickerProps {
  readonly value: string | null | undefined // مثلا "10:45"
  readonly onChange: (value: string) => void
  readonly disabled?: boolean
}

const HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']
const MINUTES = ['00', '15', '30', '45']

export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  
  const selectedHour = value ? value.split(':')[0] ?? '10' : '10'
  const selectedMinute = value ? value.split(':')[1] ?? '00' : '00'

  const handleSelect = (h: string, m: string) => {
    onChange(`${h}:${m}`)
    setOpen(false)
  }

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cx(CONTROL_CLASSES, 'inline-flex items-center justify-between gap-2 text-start')}
        >
          <span>{value ? toPersianDigits(value) : 'انتخاب ساعت'}</span>
          <Icon name="clock" size="control" />
        </button>
      </PopoverTrigger>

      <PopoverPortal>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-line bg-surface p-3 shadow-3 flex gap-4 h-64"
        >
          {/* ستون ساعت */}
          <div className="flex-1 overflow-y-auto pr-2 border-r border-line flex flex-col gap-1 scrollbar-thin">
             <span className="text-xs text-ink-3 mb-1 text-center sticky top-0 bg-surface">ساعت</span>
             {HOURS.map(h => (
               <button
                 key={h}
                 type="button"
                 onClick={() => handleSelect(h, selectedMinute)}
                 className={cx(
                   'py-1.5 rounded-sm text-sm text-center transition-colors',
                   selectedHour === h ? 'bg-brand-50 text-brand-700 font-bold' : 'hover:bg-surface-2 text-ink'
                 )}
               >
                 {toPersianDigits(h)}
               </button>
             ))}
          </div>

          {/* ستون دقیقه */}
          <div className="flex-1 overflow-y-auto pl-2 flex flex-col gap-1 scrollbar-thin">
             <span className="text-xs text-ink-3 mb-1 text-center sticky top-0 bg-surface">دقیقه</span>
             {MINUTES.map(m => (
               <button
                 key={m}
                 type="button"
                 onClick={() => handleSelect(selectedHour, m)}
                 className={cx(
                   'py-1.5 rounded-sm text-sm text-center transition-colors',
                   selectedMinute === m ? 'bg-brand-50 text-brand-700 font-bold' : 'hover:bg-surface-2 text-ink'
                 )}
               >
                 {toPersianDigits(m)}
               </button>
             ))}
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  )
}