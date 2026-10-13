'use client'

import { useEffect, useRef } from 'react'

/**
 * Drag-to-scroll a horizontally overflowed container by grabbing its header row.
 *
 * The container is the one whose `scrollLeft` moves; the grab surface is the child
 * carrying `data-drag-scroll`. The hook installs the three mouse listeners a pan
 * needs (down, move, up), shows the `grab` / `grabbing` cursor pair while the drag
 * is in flight, and tears everything down on unmount.
 *
 * ## Why the drag is on the header and not the whole container
 *
 * The grid's body holds clickable cells — a free slot a booking opens from, a
 * booked cell's row actions — and a `mousedown` on one of those is a click, not the
 * start of a pan. The header's row of doctor names holds no interactive cell, so it
 * is the one strip of the table a drag can begin on without stealing a click from
 * the body.
 *
 * ## Why `move` and `up` are on `window`
 *
 * A drag that leaves the header — the pointer moving a few pixels past the table's
 * edge — must keep panning, and a listener on the header alone would drop the drag
 * the moment the pointer left the element. `down` is on the header; `move` and `up`
 * are on the window and only exist while the drag is in flight.
 *
 * ## Why the effect checks `scrollWidth > clientWidth` once
 *
 * A grid with one doctor has nothing to scroll, and a `grab` cursor on a header
 * that cannot be dragged is a lie the reader can feel. The check runs in the
 * effect's own body, so the listeners are only attached when the gesture is
 * available.
 */
export function useDragScroll<T extends HTMLElement>(): {
  readonly containerRef: React.RefObject<T | null>
} {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const header = container.querySelector<HTMLElement>('[data-drag-scroll]')
    if (header === null) return
    if (container.scrollWidth <= container.clientWidth) return

    // Aliased to locals so the closures below see them as the non-null values the
    // two `if` statements above have already proven them to be. TypeScript narrows
    // through a closure only when the binding is `const` and never reassigned, and
    // the property access `containerRef.current` does not survive the closure.
    const containerEl: T = container
    const headerEl: HTMLElement = header

    let dragging = false
    let startX = 0
    let startScrollLeft = 0

    function onDown(event: MouseEvent): void {
      // Only the primary button starts a pan; a middle- or right-click is the
      // reader's own and not this gesture's.
      if (event.button !== 0) return
      dragging = true
      startX = event.clientX
      startScrollLeft = containerEl.scrollLeft
      headerEl.style.cursor = 'grabbing'
      headerEl.style.userSelect = 'none'
      event.preventDefault()
    }

    function onMove(event: MouseEvent): void {
      if (!dragging) return
      const delta = event.clientX - startX
      containerEl.scrollLeft = startScrollLeft - delta
    }

    function onUp(): void {
      if (!dragging) return
      dragging = false
      headerEl.style.cursor = ''
      headerEl.style.userSelect = ''
    }

    headerEl.style.cursor = 'grab'
    headerEl.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    return () => {
      headerEl.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { containerRef }
}