'use client'

import { useState } from 'react'
import { cx } from '@/core/lib'
import { Icon } from '@/core/components/icons'
import { toPersianDigits, formatDate, dateToLocalDate } from '@/core/localization'
import { createInternalNoteAction } from './internal-notes-actions'
import type { Panel } from '@/app/_shell/navigation'

export type InternalNoteRow = {
  id: string
  content: string
  category: string
  createdAt: Date
  authorName: string
  authorRole: string
}

interface InternalNotesTabProps {
  customerId: string
  panel: Panel
  notes: InternalNoteRow[]
}

const CATEGORIES = [
  { id: 'COORDINATION', label: 'هماهنگی جلسه' },
  { id: 'FINANCIAL', label: 'پرداخت و مالی' },
  { id: 'MEDICAL', label: 'پیگیری پزشکی' },
  { id: 'PATIENT_INFO', label: 'اطلاعات بیمار' },
  { id: 'OTHER', label: 'موضوع عمومی' },
]

export function InternalNotesTab({ customerId, panel, notes }: InternalNotesTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('COORDINATION')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setIsSubmitting(true)
    
    const res = await createInternalNoteAction(panel, {
      customerId,
      content,
      category,
    })
    
    setIsSubmitting(false)
    if (res.ok) {
      setContent('')
      setIsFormOpen(false)
    } else {
      alert(res.message)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      
      {/* هدر صفحه */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">یادداشت‌ها و هماهنگی‌ها</h2>
          <p className="mt-1 text-xs text-ink-3">گفتگوی داخلی بین کادر درمان و منشی برای این پرونده</p>
        </div>
        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          {isFormOpen ? 'بستن فرم' : '+ ثبت یادداشت جدید'}
        </button>
      </div>

      {/* فرم ثبت یادداشت جدید */}
      {isFormOpen && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-ink">متن یادداشت <span className="text-danger">*</span></label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="یادداشت خود را اینجا بنویسید..."
              rows={3}
              className="w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-ink">دسته‌بندی <span className="text-danger">*</span></label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={cx(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                    category === cat.id 
                      ? 'bg-brand-50 border-brand-500 text-brand-700' 
                      : 'bg-surface-2 border-transparent text-ink-2 hover:bg-line'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="rounded-md bg-brand-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors hover:bg-brand-700"
            >
              {isSubmitting ? 'در حال ثبت...' : 'ثبت یادداشت'}
            </button>
          </div>
        </form>
      )}

      {/* لیست یادداشت‌ها */}
      <div className="flex flex-col rounded-xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line bg-surface-2 px-4 py-3">
          <h3 className="text-sm font-bold text-ink">
            یادداشت‌های پرونده <span className="text-xs text-ink-3">({toPersianDigits(notes.length)} مورد)</span>
          </h3>
        </div>

        {notes.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-3">
            هنوز هیچ یادداشتی برای این پرونده ثبت نشده است.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {notes.map((note) => {
              const cat = CATEGORIES.find(c => c.id === note.category)
              return (
                <div key={note.id} className="flex flex-col gap-2 p-4 hover:bg-surface-2/30 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {note.authorName.slice(0, 1)}
                      </span>
                      <span className="text-xs font-semibold text-ink">{note.authorName}</span>
                      <span className="mx-1 inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
  {note.authorRole}
</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-ink-3 tabular-nums">
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5">{cat?.label || note.category}</span>
                      <span>{formatDate(dateToLocalDate(note.createdAt), 'short')}</span>
                    </div>
                  </div>
                  <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{note.content}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}