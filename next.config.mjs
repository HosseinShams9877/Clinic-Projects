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

  eslint: {
    // `next build` must not be the thing that runs lint. Lint is `npm run lint`,
    // so that a lint failure is reported as a lint failure and not as a build
    // failure, and so the build stays a compile-and-bundle step.
    ignoreDuringBuilds: true,
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
