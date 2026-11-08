import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'EboHomes',
    short_name: 'EboHomes',
    description:
     'Find rental properties in Ebonyi State with clearer property information, verification, and a more trustworthy rental experience.',
    lang: 'en-NG',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#062D1A',
    theme_color: '#0A2E1A',
    categories: ['lifestyle', 'business'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
