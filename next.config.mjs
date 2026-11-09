import { noindexHeaderRules } from './lib/private-routes.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // The service worker must never be cached, so updates reach people quickly
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // Stage 19a: private and signed-in pages are kept out of search results. See lib/private-routes.mjs.
      ...noindexHeaderRules(),
    ]
  },
}

export default nextConfig
