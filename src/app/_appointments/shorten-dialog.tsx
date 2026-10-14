/**
 * The shorten-confirm dialog — the desk's confirmation when a service runs longer
 * than the doctor's own slot.
 *
 * The dialog is *only* a confirm: it renders two numbers and two answers, and the
 * booking dialog is what calls it. It owns no state the booking dialog does not
 * already hold, because a second source of truth for "the desk agreed" is the one
 * that drifts from the row that was written.
 *
 * The header is the same shape as the booking dialog's — a small close button at
 * the inline-start edge and the title at the inline-end — so the two dialogs the
 * booking flow opens read as one flow and not two.
 */

'use client'

import { useId } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/core/components/button'
import { formatNumber } from '@/core/localization'

import { SHORTEN_POPUP } from './catalog'

export interface ShortenDialogProps {
  /** The service's length, in minutes. */
  readonly serviceMinutes: number
  /** The doctor's own slot step, in minutes. */
  readonly slotMinutes: number
  /** Confirms the shorter booking and runs the write. */
  readonly onConfirm: () => void
  /** Dismisses the dialog without writing. */
  readonly onDismiss: () => void
}

/**
 * The dialog. A client component because it is a button pair and a state the
 * booking dialog already holds; it renders nothing while the booking dialog has
 * not asked it to.
 */
export function ShortenDialog(props: ShortenDialogProps) {
  const titleId = useId()

  return (
    <Overlay onClose={props.onDismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="inline-size-full max-h-[90dvh] overflow-y-auto rounded-xl bg-surface shadow-3 panel:max-w-[460px]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {SHORTEN_POPUP.title}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            icon="close"
            aria-label={SHORTEN_POPUP.dismiss}
            onClick={props.onDismiss}
          />
        </header>

        <p className="p-5 text-sm text-ink-2">
          {SHORTEN_POPUP.bodyStart}
          <span className="font-semibold tabular-nums">{formatNumber(props.serviceMinutes)}</span>
          {SHORTEN_POPUP.bodyMiddle}
          <span className="font-semibold tabular-nums">{formatNumber(props.slotMinutes)}</span>
          {SHORTEN_POPUP.bodyEnd}
        </p>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={props.onDismiss}>
            {SHORTEN_POPUP.dismiss}
          </Button>
          <Button variant="primary" onClick={props.onConfirm}>
            {SHORTEN_POPUP.confirm}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/** The dimmed backdrop a click outside and an Escape both close. */
function Overlay({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 panel:items-center panel:p-6"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      <div className="inline-size-full" onClick={stopPropagation} role="presentation">
        {children}
      </div>
    </div>
  )
}

/** Swallows a click so the backdrop does not close on a click inside the panel. */
function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}