import type { Metadata } from 'next'
import HomeClient from '@/components/home-client'
import { EBOHOMES_EMAIL } from '@/lib/contact'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ebohomes.vercel.app').replace(/\/+$/, '')

export const metadata: Metadata = {
  title: 'EboHomes | Find Homes. Skip the Stress.',
  description:
    'Find reviewed homes to rent in Abakaliki and across Ebonyi State. Search by area, type and budget, request a viewing and apply online, all in one place.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'EboHomes | Find Homes. Skip the Stress.',
    description: 'Reviewed rental listings in Ebonyi State. Search, request a viewing and apply online.',
    url: '/',
    siteName: 'EboHomes',
    type: 'website',
    locale: 'en_NG',
    images: [{ url: '/hero-home.jpg', alt: 'EboHomes: find homes in Ebonyi State' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EboHomes | Find Homes. Skip the Stress.',
    description: 'Reviewed rental listings in Ebonyi State.',
    images: ['/hero-home.jpg'],
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
      logo: `${SITE}/logo.png`,
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
