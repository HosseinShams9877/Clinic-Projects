// src/app/_appointments/fullscreen-wrapper.tsx

'use client'

import { useState, useEffect } from 'react'
import { cx } from '@/core/lib'
import { APPOINTMENTS_PAGE } from '@/app/catalog' // <-- اضافه شد

export function FullscreenWrapper({ children }: { readonly children: React.ReactNode }) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  return (
    <div
      className={cx(
        'flex min-w-0 flex-col bg-surface',
        isFullscreen
          ? 'fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden rounded-none border-0 shadow-none'
          : 'relative flex h-full flex-1 flex-col overflow-hidden rounded-lg border border-line shadow-sm',
      )}
    >
      <div className="absolute left-3 top-3 z-50">
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="rounded-md bg-surface/80 p-1.5 text-ink-3 backdrop-blur-sm transition-colors hover:bg-surface-2 hover:text-ink"
          title={isFullscreen ? APPOINTMENTS_PAGE.controls.exitFullscreen : APPOINTMENTS_PAGE.controls.fullscreen}
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex h-full w-full flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}