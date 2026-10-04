/**
 * The global error boundary — `09-security.md` §9's boundary, at the document root.
 *
 * This file replaces the root layout when it renders, so it carries its own `<html>`
 * and `<body>`, its own font variable and its own copy of the token block. The root
 * layout's `dir="rtl"` and `lang="fa"` are restated here rather than inherited,
 * because there is no layout to inherit from — a person who reaches this page is
 * still reading Persian right-to-left, and a document that lost its direction here
 * would reflow every glyph on the one page that is already telling them something
 * went wrong.
 *
 * ## Why the copy says nothing specific
 *
 * `error.message` in production is the framework's generic text and carries nothing
 * useful to a clinic's receptionist; rendering it would be showing an internal
 * detail to the person least able to act on it. The sentence says "try again" and
 * the button is `retry`, which is the boundary's own prop and the one thing that can
 * actually help: it re-renders the segment that failed.
 *
 * ## Why this is a client component
 *
 * An error boundary is a React boundary, and React boundaries are client components
 * — the framework requires it and forbids `metadata` here, which is why the title
 * below is a `<title>` element and not an export.
 * ## Why the styles are inline
 *
 * `global-error` replaces the root layout, which is where `globals.css` is imported
 * — so the page imports the token block itself (`./globals.css`) and then uses the
 * same theme utilities every other page does. The card is the §12 surface on the
 * centred column the login pages use, because this is still the product's voice on
 * its worst day, and the retry button is the one element in the product drawn
 * outside `Button`: this page has no access to anything but the token block, and
 * hand-writing its four properties here is shorter than the dependency it would
 * take to share them across a boundary the framework replaces the layout for.
 */

'use client'

import { GLOBAL_ERROR_PAGE } from '@/app/catalog'

import './globals.css'

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-surface-2 p-8 px-[var(--content-pad)]">
          <div className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-lg border border-line bg-surface p-8 shadow-2">
            <span className="grid size-11 place-items-center rounded-md bg-danger-bg text-danger">
              <span aria-hidden="true">⚠</span>
            </span>
            <h1 className="text-2xl font-extrabold tracking-[var(--ls-heading)] text-ink">
              {GLOBAL_ERROR_PAGE.title}
            </h1>
            <p className="text-center text-md text-ink-2">{GLOBAL_ERROR_PAGE.lead}</p>
            <button
              type="button"
              onClick={retry}
              className="cursor-pointer rounded-md border-none bg-brand p-[10px_18px] text-md font-semibold text-surface [transition:background_var(--transition-control)] hover:bg-brand-700"
            >
              {GLOBAL_ERROR_PAGE.retry}
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}

// The framework prerenders this route at build time, and the production prerender
// crashes on a Turbopack ESM/CJS interop that leaves a `react` import null (the
// debug build, which disables minification, renders it fine). This page is a
// boundary that renders on demand, so it is dynamic by nature.
export const dynamic = 'force-dynamic'
