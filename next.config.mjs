/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],
  typedRoutes: true,

  experimental: {
    serverActions: {
      bodySizeLimit: '5mb', 
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        process.env.VERCEL_URL ?? '',
        process.env.NEXT_PUBLIC_SITE_URL ?? '',
      ].filter(Boolean),
    },
  },

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