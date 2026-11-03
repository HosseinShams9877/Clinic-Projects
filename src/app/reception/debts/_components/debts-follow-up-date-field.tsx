'use client'

import { useState } from 'react'
import { JalaliDatePicker } from '@/core/components/date-picker'
import { Field } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { DEBTS_PAGE } from '@/app/catalog'

export function DebtsFollowUpDateField({
  defaultValue,
}: {
  readonly defaultValue: string | null
}) {
  const [date, setDate] = useState<string | null>(defaultValue)

  function submitForm() {
    setTimeout(() => {
      const form = document.querySelector('form[method="get"]') as HTMLFormElement
      if (form) form.requestSubmit()
    }, 50)
  }

  function clearDate() {
    setDate(null)
    
    setTimeout(() => {
      const form = document.querySelector('form[method="get"]') as HTMLFormElement
      if (!form) return
      
      const dueInput = form.querySelector('input[name="due"]')
      if (dueInput) {
        dueInput.setAttribute('disabled', 'true')
      }
      
      form.requestSubmit()
      
      setTimeout(() => {
        if (dueInput) dueInput.removeAttribute('disabled')
      }, 100)
    }, 50)
  }

  return (
    <div className="flex min-w-48 flex-col gap-1 [&_button]:h-[38px] [&_button]:py-0 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-ink-3">
      <Field label={DEBTS_PAGE.filter.followUpDate}>
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <JalaliDatePicker
              name="due"
              value={date}
              onChange={(next) => {
                setDate(next as string)
                submitForm()
              }}
            />
          </div>
          {date !== null && date !== '' ? (
            <button
              type="button"
              onClick={clearDate}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xs border border-line-2 bg-surface text-ink-3 hover:bg-surface-2 hover:text-danger"
              title="حذف تاریخ"
            >
              <Icon name="close" size="compact" />
            </button>
          ) : null}
        </div>
      </Field>
    </div>
  )
}