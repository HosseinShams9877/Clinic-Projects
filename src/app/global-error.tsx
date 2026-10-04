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
 */

'use client'

import { GLOBAL_ERROR_PAGE } from '@/app/catalog'

import './globals.css'
import styles from './global-error.module.css'

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <main className={styles.page}>
          <div className={styles.card}>
            <span className={styles.mark}>
              <span aria-hidden="true">⚠</span>
            </span>
            <h1 className={styles.title}>{GLOBAL_ERROR_PAGE.title}</h1>
            <p className={styles.lead}>{GLOBAL_ERROR_PAGE.lead}</p>
            <button type="button" onClick={retry} className={styles.retry}>
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
