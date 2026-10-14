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
 * ## Why the overflow check is observed, not sampled once
 *
 * The gesture is only available when the content is actually wider than the
 * container — a grid with one doctor has nothing to scroll, and a `grab` cursor on
 * a header that cannot be dragged is a lie the reader can feel. But the content
 * arrives *after* the first effect run: the grid's columns, rows and cells are
 * rendered from props the server hands down, and the first paint can happen before
 * the table has laid out to its full width. A single `scrollWidth > clientWidth`
 * read in the effect's own body therefore samples a container that is still narrow,
 * concludes there is nothing to scroll, and never attaches the listeners — the
 * cursor never becomes `grab`, and the drag silently does nothing.
 *
 * The check is therefore driven by a `ResizeObserver` on both the container and its
 * first child (the table), so that the moment the content grows past the container,
 * the listeners attach and the cursor appears — and the moment it shrinks back (a
 * day with one doctor, a narrower breakpoint), they detach again.
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

    // Aliased to locals so the closures below see them as the non-null values the
    // two `if` statements above have already proven them to be. TypeScript narrows
    // through a closure only when the binding is `const` and never reassigned, and
    // the property access `containerRef.current` does not survive the closure.
    const containerEl: T = container
    const headerEl: HTMLElement = header

    let dragging = false
    let startX = 0
    let startScrollLeft = 0
    let attached = false

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

    function attach(): void {
      if (attached) return
      attached = true
      headerEl.style.cursor = 'grab'
      headerEl.addEventListener('mousedown', onDown)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    function detach(): void {
      if (!attached) return
      attached = false
      headerEl.style.cursor = ''
      headerEl.style.userSelect = ''
      headerEl.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    function sync(): void {
      const canScroll = containerEl.scrollWidth > containerEl.clientWidth
      if (canScroll) attach()
      else detach()
    }

    // The observer watches the container *and* its first child (the table), because
    // the container's own `clientWidth` does not change when its content does — the
    // table inside it is what grows.
    const observer = new ResizeObserver(sync)
    observer.observe(containerEl)
    const firstChild = containerEl.firstElementChild
    if (firstChild !== null) observer.observe(firstChild)

    // One synchronous pass so a container that is *already* wide at effect time
    // (a client-side navigation back into the page, a warm cache) attaches without
    // waiting for the observer's first callback.
    sync()

    return () => {
      observer.disconnect()
      detach()
    }
  }, [])

  return { containerRef }
}