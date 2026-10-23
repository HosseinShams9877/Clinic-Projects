'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/core/components/button'
import { Field, TextArea } from '@/core/components/form'
import { Icon } from '@/core/components/icons'

export function CycleActionDialog({
  isOpen,
  onClose,
  cycleId,
  customerName,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  cycleId: string
  customerName: string
  onSuccess: () => void
}) {
  const [note, setNote] = useState('')
  const [isPending, setIsPending] = useState(false)

  if (!isOpen || typeof document === 'undefined') return null

  const handleSubmit = async () => {
    setIsPending(true)
    // اینجا بعداً اکشن ثبت نتیجه رو صدا می‌زنیم
    setTimeout(() => {
      setIsPending(false)
      onSuccess()
      onClose()
    }, 500)
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm text-right" dir="rtl">
      <div className="w-full max-w-[480px] overflow-hidden rounded-xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Icon name="treatment" size="card" className="text-brand" />
            ثبت نتیجه برای {customerName}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-danger">
            <Icon name="close" size="compact" />
          </button>
        </div>
        
        <div className="p-5 flex flex-col gap-4">
          <Field label="توضیحات و نتیجه جلسه">
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="مثلاً: تماس گرفته شد، مشتری گفت هفته بعد میاد..."
              className="w-full resize-none"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            انصراف
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending || note.trim() === ''}>
            {isPending ? 'در حال ثبت...' : 'ثبت نتیجه'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}