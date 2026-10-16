'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { deleteInjection } from './delete-injection-action'
import { INJECTION_TAB } from './catalog'

export function DeleteInjectionButton({ id }: { readonly id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!confirm(INJECTION_TAB.deleteConfirm)) return
    setBusy(true)
    const result = await deleteInjection(id)
    setBusy(false)
    if (result.ok) {
      router.refresh()
    } else {
      alert(INJECTION_TAB.deleteFailed)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="rounded-xs border border-line-2 bg-surface px-2 py-1 text-xs font-semibold text-danger no-underline transition-colors hover:bg-danger/5 disabled:opacity-40"
    >
      {busy ? '…' : INJECTION_TAB.deleteLabel}
    </button>
  )
}