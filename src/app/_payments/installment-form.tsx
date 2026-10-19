'use client'

import { useActionState } from 'react'
import { createInstallmentAction } from './actions'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'

export function InstallmentForm() {
  const [state, formAction] = useActionState(createInstallmentAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-bold text-ink">{ADMIN_INSTALLMENTS.form.title}</h2>
      
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
           <label className="text-sm text-ink-2">{ADMIN_INSTALLMENTS.form.appointmentId}</label>
           <input name="appointmentId" type="text" className="rounded-sm border border-line p-2" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
           <label className="text-sm text-ink-2">{ADMIN_INSTALLMENTS.form.totalAmount}</label>
           <input name="totalAmount" type="text" className="rounded-sm border border-line p-2" />
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
           <label className="text-sm text-ink-2">{ADMIN_INSTALLMENTS.form.count}</label>
           <input name="count" type="number" className="rounded-sm border border-line p-2" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
           <label className="text-sm text-ink-2">{ADMIN_INSTALLMENTS.form.firstDueAt}</label>
           <input name="firstDueAt" type="text" className="rounded-sm border border-line p-2" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
         <label className="text-sm text-ink-2">{ADMIN_INSTALLMENTS.form.note}</label>
         <input name="note" type="text" className="rounded-sm border border-line p-2" />
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      
      <button type="submit" className="mt-2 rounded-sm bg-brand p-2 text-ink-inverse hover:bg-brand-600">
        {ADMIN_INSTALLMENTS.form.submit}
      </button>
    </form>
  )
}