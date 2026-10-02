import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

import { APP_DESCRIPTION, APP_NAME, APP_TITLE_TEMPLATE } from './catalog'
import { THEME_COLOR } from './theme'

import './globals.css'

/**
 * Vazirmatn, self-hosted (`07-localization.md` §2).
 *
 * The files live in `./fonts` and are committed, so the build performs no
 * request to Google Fonts or any other host. This is what makes the on-premise
 * install render correctly on a machine with no internet access — it is a
 * product requirement, not a performance preference.
 *
 * The weights are 400 / 500 / 600 / 700 / 800. `08-ui-design-system.md` §3 names
 * 600 for labels and buttons and 800 for the brand name, while
 * `07-localization.md` §2 lists 400 / 500 / 700. Shipping the union is the only
 * choice that keeps the rendered weight equal to the specified weight: a weight
 * that is not shipped is *synthesised* by the browser, which thickens the glyphs
 * unevenly and changes the visual language the design system pins.
 */
const vazirmatn = localFont({
  src: [
    { path: './fonts/Vazirmatn-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Vazirmatn-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Vazirmatn-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Vazirmatn-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Vazirmatn-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-vazirmatn',
  display: 'swap',
  preload: true,
  fallback: ['IRANSansX', 'IRANSans', 'IRANYekan', 'Segoe UI', 'Tahoma', 'sans-serif'],
})

/**
 * Document metadata. The strings live in `./catalog` — a Persian literal in a
 * component is a finding, and metadata is user-visible text.
 */
export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
  /** `./theme` — the one colour literal that cannot be a `var()`. */
  themeColor: THEME_COLOR,
}

/**
 * The document root. `dir="rtl"` and `lang="fa"` are set here and nowhere else
 * (`07-localization.md` §3) — there is no LTR mode and no direction switch, so
 * no component ever needs to ask which direction it is rendering in.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body>{children}</body>
    </html>
  )
}
