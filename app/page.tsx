import type { Metadata } from 'next'
import HomeClient from '@/components/home-client'
import { EBOHOMES_EMAIL } from '@/lib/contact'
import { BRAND_TITLE } from '@/lib/brand'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ebohomes.vercel.app').replace(/\/+$/, '')

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description:
    'Find reviewed homes to rent in Abakaliki and across Ebonyi State. Search by area, type and budget, request a viewing and apply online, all in one place.',
  alternates: { canonical: '/' },
  openGraph: {
    title: BRAND_TITLE,
    description: 'Reviewed rental listings in Ebonyi State. Search, request a viewing and apply online.',
    url: '/',
    siteName: 'EboHomes',
    type: 'website',
    locale: 'en_NG',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'EboHomes: Find Homes. Skip the Stress.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_TITLE,
    description: 'Reviewed rental listings in Ebonyi State.',
    images: ['/og-image.jpg'],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'EboHomes',
      url: SITE,
      logo: `${SITE}/icons/icon-512.png`,
      email: EBOHOMES_EMAIL,
      areaServed: { '@type': 'AdministrativeArea', name: 'Ebonyi State, Nigeria' },
      sameAs: ['https://www.tiktok.com/@ebohomes7'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'EboHomes',
      publisher: { '@id': `${SITE}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HomeClient />
    </>
  )
}
