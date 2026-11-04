import type { MetadataRoute } from 'next'

// Private, account-only, auth and server-only paths. Public pages stay crawlable.
// Rules are prefix matches, so each entry covers its whole subtree.
const PRIVATE_PATHS = [
  '/api/',
  // Staff and role dashboards
  '/admin',
  '/dashboard',
  '/home',
  '/inspector',
  // Tenant account areas
  '/journey',
  '/tenancies',
  '/viewings',
  '/messages',
  '/notifications',
  '/profile',
  '/settings',
  '/saved',
  '/applications',
  '/apply/',
  '/handovers',
  '/payment-confirmation/',
  '/receipt/',
  // Landlord-only action under a public listing URL
  '/listing/*/feature',
  // Authentication
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verification-pending',
]

// Same environment variable the rest of the app already uses for its canonical
// URL. No fallback domain is hardcoded: if unset or invalid, the Sitemap line
// is omitted and the crawl rules still apply.
function getSiteUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s/]+/i.test(raw) ? raw : null
}

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  }
}
