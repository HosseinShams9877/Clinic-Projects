/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The framework advertises itself in a response header by default. A clinic's
  // attack surface should not begin with a version number.
  poweredByHeader: false,

  // Prisma ships a native query engine binary. Bundling it into the server build
  // breaks that binary's path resolution, so it stays external and is required
  // at runtime from node_modules — the same way the worker loads it.
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],

  // `next build` does not run lint — the `eslint` key this used to live under is
  // gone in Next 16, and lint is `npm run lint` anyway, so a lint failure is
  // reported as a lint failure and not as a build failure. Keeping the build a
  // compile-and-bundle step is still the intent; the key just no longer exists.

  experimental: {
    // **Temporary — remove when the `_global-error` prerender is fixed.**
    //
    // Next 16.3.8 force-prerenders `/_global-error` at build time, and under the
    // production React build that prerender dies with `TypeError: Cannot read
    // properties of null (reading 'useContext')` — inside the framework's own
    // page wrapper, in code the application does not supply. This reproduces with
    // an empty root layout and a zero-dependency `global-error.tsx`, so it is a
    // Turbopack bug and not this project's; `next build --debug-prerender`, which
    // disables this flag, renders the page fine, which is the isolation.
    //
    // The cost is bundle size: the client and server chunks ship unminified. Every
    // route in this product is dynamic (`ƒ`, server-rendered on demand), so the
    // client bundles are the pages' own JS and the size is paid on first load.
    // Track this and turn minification back on when the framework fixes the
    // prerender — see `reports/phase-01-report.md`.
    turbopackMinify: false,
  },

  typedRoutes: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
